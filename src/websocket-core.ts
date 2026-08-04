import NodeWebSocket from "ws";
import { ExchangeSdkError, createProtocolValidationError } from "./errors.js";
import { parseNonNegativeIntegerOption, parsePositiveIntegerOption } from "./integer-inputs.js";
import type { Unsubscribe, WebSocketConnectionState } from "./types.js";

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  addEventListener?(event: string, listener: (event: unknown) => void): void;
  removeEventListener?(event: string, listener: (event: unknown) => void): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export type WebSocketConstructorLike = new (url: string) => WebSocketLike;

export interface SubscriptionWebSocketClientOptions {
  websocketUrl: string;
  WebSocketCtor?: WebSocketConstructorLike;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  ackTimeoutMs?: number;
  onError?: (error: unknown) => void;
}

interface SubscriptionWebSocketClientConfig {
  closedMessage: string;
  notOpenMessage: string;
  closeEventPrefix: string;
  ackTimeoutMessage(action: "subscribe" | "unsubscribe", key: string): string;
  emitUnexpectedCloseError?: boolean;
}

interface PendingAck {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface WebSocketErrorHandler {
  onError?: (error: unknown) => void;
}

const CONNECTING = 0;
const OPEN = 1;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_ACK_TIMEOUT_MS = 15_000;

export abstract class BaseSubscriptionWebSocketClient<
  THandlers extends WebSocketErrorHandler,
  TMessage,
> {
  readonly websocketUrl: string;

  protected readonly subscriptions = new Map<string, Set<THandlers>>();

  private readonly WebSocketCtor: WebSocketConstructorLike;
  private readonly reconnect: boolean;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly ackTimeoutMs: number;
  private readonly onError?: (error: unknown) => void;
  private readonly config: SubscriptionWebSocketClientConfig;

  private state: WebSocketConnectionState = "idle";
  private socket?: WebSocketLike;
  private connectPromise?: Promise<void>;
  private connectResolve?: () => void;
  private connectReject?: (error: unknown) => void;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  private readonly pendingSubscribes = new Map<string, PendingAck>();
  private readonly pendingUnsubscribes = new Map<string, PendingAck>();

  protected constructor(
    options: SubscriptionWebSocketClientOptions,
    config: SubscriptionWebSocketClientConfig,
  ) {
    if (options.websocketUrl.trim() === "") {
      throw createProtocolValidationError(
        "invalid_value",
        "$.websocketUrl",
        "websocketUrl is required",
      );
    }

    this.websocketUrl = options.websocketUrl;
    this.WebSocketCtor = options.WebSocketCtor ?? getDefaultWebSocketConstructor();
    this.reconnect = options.reconnect ?? true;
    this.reconnectDelayMs = parseNonNegativeIntegerOption(
      options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
      "$.reconnectDelayMs",
    );
    this.maxReconnectDelayMs = parseNonNegativeIntegerOption(
      options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS,
      "$.maxReconnectDelayMs",
    );
    this.ackTimeoutMs = parsePositiveIntegerOption(
      options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS,
      "$.ackTimeoutMs",
    );
    this.onError = options.onError;
    this.config = config;
  }

  get connectionState(): WebSocketConnectionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.isOpen()) {
      return;
    }

    if (this.connectPromise !== undefined) {
      return this.connectPromise;
    }

    this.manuallyClosed = false;
    this.state = this.state === "reconnecting" ? "reconnecting" : "connecting";

    try {
      this.socket = new this.WebSocketCtor(this.websocketUrl);
    } catch (error) {
      this.state = "closed";
      throw error;
    }

    this.attachSocketListeners(this.socket);
    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });

    return this.connectPromise;
  }

  close(code?: number, reason?: string): void {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.beforeManualClose();
    this.rejectPendingAcks(new ExchangeSdkError(this.config.closedMessage));
    this.rejectConnect(new ExchangeSdkError(this.config.closedMessage));

    const socket = this.socket;
    this.socket = undefined;
    this.state = "closed";

    if (socket !== undefined && (socket.readyState === CONNECTING || socket.readyState === OPEN)) {
      socket.close(code, reason);
    }
  }

  protected async subscribeKey(key: string, handlers: THandlers): Promise<Unsubscribe> {
    await this.connect();

    const existingHandlers = this.subscriptions.get(key);
    if (existingHandlers !== undefined) {
      existingHandlers.add(handlers);
      try {
        await this.pendingSubscribes.get(key)?.promise;
      } catch (error) {
        existingHandlers.delete(handlers);
        if (existingHandlers.size === 0) {
          this.subscriptions.delete(key);
          this.afterSubscriptionRemoved(key);
        }
        throw error;
      }
      return this.createUnsubscribe(key, handlers);
    }

    this.subscriptions.set(key, new Set([handlers]));

    try {
      await this.subscribeKeyOnServer(key);
    } catch (error) {
      const handlersForKey = this.subscriptions.get(key);
      handlersForKey?.delete(handlers);
      if (handlersForKey === undefined || handlersForKey.size === 0) {
        this.subscriptions.delete(key);
        this.afterSubscriptionRemoved(key);
      }
      this.handleConnectionFailure(error);
      throw error;
    }

    return this.createUnsubscribe(key, handlers);
  }

  protected async unsubscribeKey(key: string, handlers?: THandlers): Promise<void> {
    const handlersForKey = this.subscriptions.get(key);
    if (handlersForKey === undefined) {
      return;
    }

    if (handlers === undefined) {
      handlersForKey.clear();
    } else {
      handlersForKey.delete(handlers);
    }

    if (handlersForKey.size > 0) {
      return;
    }

    this.subscriptions.delete(key);
    this.afterSubscriptionRemoved(key);
    if (this.isOpen()) {
      await this.unsubscribeKeyOnServerBestEffort(key);
    }
  }

  protected resolveSubscribeAck(key: string): boolean {
    const didResolve = this.resolvePendingAck(this.pendingSubscribes, key);
    if (didResolve && this.subscriptions.has(key)) {
      this.afterSubscribeAck(key);
    }
    return didResolve;
  }

  protected resolveUnsubscribeAck(key: string): boolean {
    return this.resolvePendingAck(this.pendingUnsubscribes, key);
  }

  protected sendJson(message: unknown): void {
    if (!this.isOpen() || this.socket === undefined) {
      throw new ExchangeSdkError(this.config.notOpenMessage);
    }

    this.socket.send(JSON.stringify(message));
  }

  protected callHandler(callback: () => void, handlers: THandlers, key: string): void {
    try {
      callback();
    } catch (error) {
      this.emitError(error, key, handlers);
    }
  }

  protected emitError(error: unknown, key?: string, sourceHandler?: THandlers): void {
    const handlersToNotify = new Set<THandlers>();
    if (sourceHandler !== undefined) {
      handlersToNotify.add(sourceHandler);
    } else if (key !== undefined) {
      for (const handlers of this.subscriptions.get(key) ?? []) {
        handlersToNotify.add(handlers);
      }
    } else {
      for (const handlersForKey of this.subscriptions.values()) {
        for (const handlers of handlersForKey) {
          handlersToNotify.add(handlers);
        }
      }
    }

    for (const handlers of handlersToNotify) {
      try {
        handlers.onError?.(error);
      } catch {
        // Error handlers must not break websocket dispatch.
      }
    }

    this.onError?.(error);
  }

  protected handleConnectionFailure(error: unknown): void {
    this.emitError(error);

    const socket = this.socket;
    this.socket = undefined;
    this.beforeConnectionUnavailable(error);
    this.rejectPendingAcks(error);
    this.rejectConnect(error);

    if (!this.manuallyClosed && this.subscriptions.size > 0) {
      this.beforeReconnect(error);
    }

    if (!this.manuallyClosed && this.reconnect && this.subscriptions.size > 0) {
      this.scheduleReconnect();
    } else {
      this.state = "closed";
    }

    if (socket !== undefined) {
      this.closeFailedSocket(socket);
    }
  }

  protected isManuallyClosed(): boolean {
    return this.manuallyClosed;
  }

  protected abstract parseMessage(input: unknown): TMessage;
  protected abstract handleMessage(message: TMessage): void;
  protected abstract buildSubscribeMessage(key: string): unknown;
  protected abstract buildUnsubscribeMessage(key: string): unknown;

  protected afterSubscribeAck(key: string): void {
    void key;
  }
  protected afterSubscriptionRemoved(key: string): void {
    void key;
  }
  protected beforeManualClose(): void {}
  protected beforeConnectionUnavailable(error: unknown): void {
    void error;
  }
  protected beforeReconnect(error: unknown): void {
    void error;
  }
  protected afterReconnectOpen(): void {}

  private createUnsubscribe(key: string, handlers: THandlers): Unsubscribe {
    let didUnsubscribe = false;

    return async () => {
      if (didUnsubscribe) {
        return;
      }

      didUnsubscribe = true;
      await this.unsubscribeKey(key, handlers);
    };
  }

  private async subscribeKeyOnServer(key: string): Promise<void> {
    if (this.pendingSubscribes.has(key)) {
      await this.pendingSubscribes.get(key)?.promise;
      return;
    }

    const pendingAck = this.createPendingAck(this.pendingSubscribes, key, "subscribe");
    try {
      this.sendJson(this.buildSubscribeMessage(key));
      await pendingAck.promise;
    } catch (error) {
      this.clearPendingAck(this.pendingSubscribes, key);
      throw error;
    }
  }

  private async unsubscribeKeyOnServer(key: string): Promise<void> {
    if (this.pendingUnsubscribes.has(key)) {
      await this.pendingUnsubscribes.get(key)?.promise;
      return;
    }

    const pendingAck = this.createPendingAck(this.pendingUnsubscribes, key, "unsubscribe");
    try {
      this.sendJson(this.buildUnsubscribeMessage(key));
      await pendingAck.promise;
    } catch (error) {
      this.clearPendingAck(this.pendingUnsubscribes, key);
      throw error;
    }
  }

  private async unsubscribeKeyOnServerBestEffort(key: string): Promise<void> {
    try {
      await this.unsubscribeKeyOnServer(key);
    } catch (error) {
      this.handleConnectionFailure(error);
    }
  }

  private createPendingAck(
    pendingAcks: Map<string, PendingAck>,
    key: string,
    action: "subscribe" | "unsubscribe",
  ): PendingAck {
    let resolveAck: (() => void) | undefined;
    let rejectAck: ((error: unknown) => void) | undefined;
    const timer = setTimeout(() => {
      const pendingAck = pendingAcks.get(key);
      if (pendingAck !== undefined) {
        pendingAcks.delete(key);
        pendingAck.reject(new ExchangeSdkError(this.config.ackTimeoutMessage(action, key)));
      }
    }, this.ackTimeoutMs);
    const promise = new Promise<void>((resolve, reject) => {
      resolveAck = resolve;
      rejectAck = reject;
    });
    const pendingAck: PendingAck = {
      promise,
      resolve: () => {
        clearTimeout(timer);
        resolveAck?.();
      },
      reject: (error) => {
        clearTimeout(timer);
        rejectAck?.(error);
      },
      timer,
    };

    pendingAcks.set(key, pendingAck);
    return pendingAck;
  }

  private clearPendingAck(pendingAcks: Map<string, PendingAck>, key: string): void {
    const pendingAck = pendingAcks.get(key);
    if (pendingAck !== undefined) {
      clearTimeout(pendingAck.timer);
      pendingAcks.delete(key);
    }
  }

  private resolvePendingAck(pendingAcks: Map<string, PendingAck>, key: string): boolean {
    const pendingAck = pendingAcks.get(key);
    if (pendingAck === undefined) {
      return false;
    }

    pendingAcks.delete(key);
    pendingAck.resolve();
    return true;
  }

  private rejectPendingAcks(error: unknown): void {
    for (const [key, pendingAck] of this.pendingSubscribes) {
      this.pendingSubscribes.delete(key);
      pendingAck.reject(error);
    }
    for (const [key, pendingAck] of this.pendingUnsubscribes) {
      this.pendingUnsubscribes.delete(key);
      pendingAck.reject(error);
    }
  }

  private attachSocketListeners(socket: WebSocketLike): void {
    addSocketListener(socket, "open", () => this.handleOpen(socket));
    addSocketListener(socket, "message", (event) => this.handleMessageEvent(socket, event));
    addSocketListener(socket, "error", (event) => this.handleErrorEvent(socket, event));
    addSocketListener(socket, "close", (event, reason) =>
      this.handleCloseEvent(socket, event, reason),
    );
  }

  private handleOpen(socket: WebSocketLike): void {
    if (socket !== this.socket) {
      return;
    }

    const wasReconnecting = this.state === "reconnecting";
    this.state = "open";
    this.reconnectAttempt = 0;
    this.resolveConnect();

    if (wasReconnecting) {
      this.afterReconnectOpen();
    }
  }

  private handleMessageEvent(socket: WebSocketLike, event: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    try {
      const rawData = getMessageEventData(event);
      const parsedJson = JSON.parse(messageDataToString(rawData)) as unknown;
      const message = this.parseMessage(parsedJson);
      this.handleMessage(message);
    } catch (error) {
      this.emitError(error);
    }
  }

  private handleErrorEvent(socket: WebSocketLike, event: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    this.emitError(extractError(event));
  }

  private handleCloseEvent(socket: WebSocketLike, event: unknown, reason?: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    const error = closeEventToError(this.config.closeEventPrefix, event, reason);
    const shouldReconnect = !this.manuallyClosed && this.reconnect && this.subscriptions.size > 0;

    this.socket = undefined;
    this.beforeConnectionUnavailable(error);
    this.rejectPendingAcks(error);
    this.rejectConnect(error);

    if (!this.manuallyClosed && this.subscriptions.size > 0) {
      this.beforeReconnect(error);
    }

    if (shouldReconnect) {
      if (this.config.emitUnexpectedCloseError === true) {
        this.emitError(error);
      }
      this.scheduleReconnect();
    } else {
      this.state = "closed";
    }
  }

  private closeFailedSocket(socket: WebSocketLike): void {
    if (socket.readyState !== CONNECTING && socket.readyState !== OPEN) {
      return;
    }

    try {
      if (socket.terminate !== undefined) {
        socket.terminate();
      } else {
        socket.close();
      }
    } catch (closeError) {
      this.emitError(closeError);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined || this.manuallyClosed) {
      return;
    }

    this.state = "reconnecting";
    const delay = Math.min(
      this.reconnectDelayMs * 2 ** this.reconnectAttempt,
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: unknown) => {
        this.emitError(error);
        if (!this.manuallyClosed && this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  private resolveConnect(): void {
    this.connectPromise = undefined;
    const resolve = this.connectResolve;
    this.connectResolve = undefined;
    this.connectReject = undefined;
    resolve?.();
  }

  private rejectConnect(error: unknown): void {
    this.connectPromise = undefined;
    const reject = this.connectReject;
    this.connectResolve = undefined;
    this.connectReject = undefined;
    reject?.(error);
  }
}

function getDefaultWebSocketConstructor(): WebSocketConstructorLike {
  return globalThis.WebSocket ?? NodeWebSocket;
}

function addSocketListener(
  socket: WebSocketLike,
  event: string,
  listener: (...args: unknown[]) => void,
): void {
  if (socket.addEventListener !== undefined) {
    socket.addEventListener(event, listener);
    return;
  }

  socket.on?.(event, listener);
}

function getMessageEventData(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "data" in event) {
    return event.data;
  }

  return event;
}

function messageDataToString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  throw createProtocolValidationError("invalid_type", "$", "expected websocket text message");
}

function extractError(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "error" in event) {
    return event.error;
  }

  return event;
}

function closeEventToError(prefix: string, event: unknown, reason?: unknown): ExchangeSdkError {
  if (typeof event === "object" && event !== null) {
    const code = "code" in event ? formatUnknown(event.code) : "unknown";
    const closeReason = "reason" in event ? formatUnknown(event.reason) : "unknown";
    return new ExchangeSdkError(`${prefix} closed with code ${code}: ${closeReason}`);
  }

  const code = formatUnknown(event);
  const closeReason = formatUnknown(reason);
  return new ExchangeSdkError(`${prefix} closed with code ${code}: ${closeReason}`);
}

function formatUnknown(input: unknown): string {
  if (input === undefined) {
    return "unknown";
  }

  if (typeof input === "string") {
    return input;
  }

  if (typeof input === "number" || typeof input === "bigint" || typeof input === "boolean") {
    return input.toString();
  }

  if (input instanceof Uint8Array) {
    return new TextDecoder().decode(input);
  }

  return "unknown";
}
