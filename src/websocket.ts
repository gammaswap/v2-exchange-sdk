import NodeWebSocket from "ws";
import { ExchangeSdkError, createProtocolValidationError } from "./errors.js";
import { getAssetRequestSchema, parseWebSocketMessage } from "./schemas.js";
import type {
  OrderBookSubscriptionHandlers,
  ProtocolBigNumberish,
  Unsubscribe,
  WebSocketConnectionState,
  WebSocketMarketUpdate,
  WebSocketMessage,
} from "./types.js";

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?(event: string, listener: (event: unknown) => void): void;
  removeEventListener?(event: string, listener: (event: unknown) => void): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export type WebSocketConstructorLike = new (url: string) => WebSocketLike;

export interface ExchangeWebSocketClientOptions {
  websocketUrl: string;
  WebSocketCtor?: WebSocketConstructorLike;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  ackTimeoutMs?: number;
  onError?: (error: unknown) => void;
}

interface PendingAck {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

const CONNECTING = 0;
const OPEN = 1;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_ACK_TIMEOUT_MS = 15_000;

export class ExchangeWebSocketClient {
  readonly websocketUrl: string;

  private readonly WebSocketCtor: WebSocketConstructorLike;
  private readonly reconnect: boolean;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly ackTimeoutMs: number;
  private readonly onError?: (error: unknown) => void;

  private state: WebSocketConnectionState = "idle";
  private socket?: WebSocketLike;
  private connectPromise?: Promise<void>;
  private connectResolve?: () => void;
  private connectReject?: (error: unknown) => void;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  private readonly subscriptions = new Map<string, Set<OrderBookSubscriptionHandlers>>();
  private readonly pendingSubscribes = new Map<string, PendingAck>();
  private readonly pendingUnsubscribes = new Map<string, PendingAck>();

  constructor(options: ExchangeWebSocketClientOptions) {
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
    this.rejectPendingAcks(new ExchangeSdkError("WebSocket client closed"));
    this.rejectConnect(new ExchangeSdkError("WebSocket client closed"));

    const socket = this.socket;
    this.socket = undefined;
    this.state = "closed";

    if (socket !== undefined && (socket.readyState === CONNECTING || socket.readyState === OPEN)) {
      socket.close(code, reason);
    }
  }

  async subscribeOrderBook(
    assetIdInput: ProtocolBigNumberish,
    handlers: OrderBookSubscriptionHandlers,
  ): Promise<Unsubscribe> {
    const assetId = normalizeAssetId(assetIdInput);
    await this.connect();

    const existingHandlers = this.subscriptions.get(assetId);
    if (existingHandlers !== undefined) {
      existingHandlers.add(handlers);
      await this.pendingSubscribes.get(assetId)?.promise;
      return this.createUnsubscribe(assetId, handlers);
    }

    this.subscriptions.set(assetId, new Set([handlers]));

    try {
      await this.subscribeAssetOnServer(assetId);
    } catch (error) {
      const handlersForAsset = this.subscriptions.get(assetId);
      handlersForAsset?.delete(handlers);
      if (handlersForAsset === undefined || handlersForAsset.size === 0) {
        this.subscriptions.delete(assetId);
      }
      this.handleConnectionFailure(error);
      throw error;
    }

    return this.createUnsubscribe(assetId, handlers);
  }

  async unsubscribeOrderBook(assetIdInput: ProtocolBigNumberish): Promise<void> {
    const assetId = normalizeAssetId(assetIdInput);
    await this.removeSubscription(assetId);
  }

  private createUnsubscribe(assetId: string, handlers: OrderBookSubscriptionHandlers): Unsubscribe {
    let didUnsubscribe = false;

    return async () => {
      if (didUnsubscribe) {
        return;
      }

      didUnsubscribe = true;
      await this.removeSubscription(assetId, handlers);
    };
  }

  private async removeSubscription(
    assetId: string,
    handlers?: OrderBookSubscriptionHandlers,
  ): Promise<void> {
    const handlersForAsset = this.subscriptions.get(assetId);
    if (handlersForAsset === undefined) {
      return;
    }

    if (handlers === undefined) {
      handlersForAsset.clear();
    } else {
      handlersForAsset.delete(handlers);
    }

    if (handlersForAsset.size > 0) {
      return;
    }

    this.subscriptions.delete(assetId);
    if (this.isOpen()) {
      await this.unsubscribeAssetOnServerBestEffort(assetId);
    }
  }

  private async subscribeAssetOnServer(assetId: string): Promise<void> {
    if (this.pendingSubscribes.has(assetId)) {
      await this.pendingSubscribes.get(assetId)?.promise;
      return;
    }

    const pendingAck = this.createPendingAck(this.pendingSubscribes, assetId, "subscribe");
    try {
      this.sendJson({ type: "subscribe", assetId });
      await pendingAck.promise;
    } catch (error) {
      this.clearPendingAck(this.pendingSubscribes, assetId);
      throw error;
    }
  }

  private async unsubscribeAssetOnServer(assetId: string): Promise<void> {
    if (this.pendingUnsubscribes.has(assetId)) {
      await this.pendingUnsubscribes.get(assetId)?.promise;
      return;
    }

    const pendingAck = this.createPendingAck(this.pendingUnsubscribes, assetId, "unsubscribe");
    try {
      this.sendJson({ type: "unsubscribe", assetId });
      await pendingAck.promise;
    } catch (error) {
      this.clearPendingAck(this.pendingUnsubscribes, assetId);
      throw error;
    }
  }

  private async unsubscribeAssetOnServerBestEffort(assetId: string): Promise<void> {
    try {
      await this.unsubscribeAssetOnServer(assetId);
    } catch (error) {
      this.handleConnectionFailure(error);
    }
  }

  private createPendingAck(
    pendingAcks: Map<string, PendingAck>,
    assetId: string,
    action: "subscribe" | "unsubscribe",
  ): PendingAck {
    let resolveAck: (() => void) | undefined;
    let rejectAck: ((error: unknown) => void) | undefined;
    const timer = setTimeout(() => {
      const pendingAck = pendingAcks.get(assetId);
      if (pendingAck !== undefined) {
        pendingAcks.delete(assetId);
        pendingAck.reject(
          new ExchangeSdkError(
            `Timed out waiting for ${action} acknowledgement for assetId ${assetId}`,
          ),
        );
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

    pendingAcks.set(assetId, pendingAck);
    return pendingAck;
  }

  private clearPendingAck(pendingAcks: Map<string, PendingAck>, assetId: string): void {
    const pendingAck = pendingAcks.get(assetId);
    if (pendingAck !== undefined) {
      clearTimeout(pendingAck.timer);
      pendingAcks.delete(assetId);
    }
  }

  private resolvePendingAck(pendingAcks: Map<string, PendingAck>, assetId: string): void {
    const pendingAck = pendingAcks.get(assetId);
    if (pendingAck !== undefined) {
      pendingAcks.delete(assetId);
      pendingAck.resolve();
    }
  }

  private rejectPendingAcks(error: unknown): void {
    for (const [assetId, pendingAck] of this.pendingSubscribes) {
      this.pendingSubscribes.delete(assetId);
      pendingAck.reject(error);
    }
    for (const [assetId, pendingAck] of this.pendingUnsubscribes) {
      this.pendingUnsubscribes.delete(assetId);
      pendingAck.reject(error);
    }
  }

  private sendJson(message: unknown): void {
    if (!this.isOpen() || this.socket === undefined) {
      throw new ExchangeSdkError("WebSocket is not open");
    }

    this.socket.send(JSON.stringify(message));
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
      this.resubscribeActiveAssets();
    }
  }

  private handleMessageEvent(socket: WebSocketLike, event: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    try {
      const rawData = getMessageEventData(event);
      const parsedJson = JSON.parse(messageDataToString(rawData)) as unknown;
      const message = parseWebSocketMessage(parsedJson);
      this.handleMessage(message);
    } catch (error) {
      this.emitError(error);
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    if (message.type === "connected") {
      return;
    }

    if (message.type === "subscribed") {
      this.resolvePendingAck(this.pendingSubscribes, message.assetId);
      return;
    }

    if (message.type === "unsubscribed") {
      this.resolvePendingAck(this.pendingUnsubscribes, message.assetId);
      return;
    }

    if (message.type === "error") {
      this.emitError(new ExchangeSdkError(message.message));
      return;
    }

    this.dispatchMarketUpdate(message);
  }

  private dispatchMarketUpdate(update: WebSocketMarketUpdate): void {
    const assetId = update.assetId.toString();
    const handlersForAsset = this.subscriptions.get(assetId);
    if (handlersForAsset === undefined) {
      return;
    }

    for (const handlers of Array.from(handlersForAsset)) {
      this.dispatchToHandler(update, handlers, assetId);
    }
  }

  private dispatchToHandler(
    update: WebSocketMarketUpdate,
    handlers: OrderBookSubscriptionHandlers,
    assetId: string,
  ): void {
    this.callHandler(() => handlers.onUpdate?.(update), handlers, assetId);

    if (update.type === "order") {
      this.callHandler(() => handlers.onOrder?.(update), handlers, assetId);
    } else if (update.type === "trade") {
      this.callHandler(() => handlers.onTrade?.(update), handlers, assetId);
    } else if (update.type === "cancel") {
      this.callHandler(() => handlers.onCancel?.(update), handlers, assetId);
    } else {
      this.callHandler(() => handlers.onResolution?.(update), handlers, assetId);
    }
  }

  private callHandler(
    callback: () => void,
    handlers: OrderBookSubscriptionHandlers,
    assetId: string,
  ): void {
    try {
      callback();
    } catch (error) {
      this.emitError(error, assetId, handlers);
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

    const error = closeEventToError(event, reason);
    const shouldReconnect = !this.manuallyClosed && this.reconnect && this.subscriptions.size > 0;

    this.socket = undefined;
    this.rejectPendingAcks(error);
    this.rejectConnect(error);

    if (!this.manuallyClosed && this.subscriptions.size > 0) {
      this.emitResyncRequiredForAll();
    }

    if (shouldReconnect) {
      this.scheduleReconnect();
    } else {
      this.state = "closed";
    }
  }

  private handleConnectionFailure(error: unknown): void {
    this.emitError(error);

    const socket = this.socket;
    this.socket = undefined;
    this.rejectPendingAcks(error);
    this.rejectConnect(error);

    if (!this.manuallyClosed && this.subscriptions.size > 0) {
      this.emitResyncRequiredForAll();
    }

    if (!this.manuallyClosed && this.reconnect && this.subscriptions.size > 0) {
      this.scheduleReconnect();
    } else {
      this.state = "closed";
    }

    if (socket !== undefined && (socket.readyState === CONNECTING || socket.readyState === OPEN)) {
      try {
        socket.close();
      } catch (closeError) {
        this.emitError(closeError);
      }
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
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private resubscribeActiveAssets(): void {
    for (const assetId of this.subscriptions.keys()) {
      try {
        this.sendJson({ type: "subscribe", assetId });
      } catch (error) {
        this.emitError(error, assetId);
      }
    }
  }

  private emitResyncRequiredForAll(): void {
    for (const [assetId, handlersForAsset] of this.subscriptions) {
      for (const handlers of handlersForAsset) {
        this.callResyncRequired(handlers, assetId);
      }
    }
  }

  private callResyncRequired(handlers: OrderBookSubscriptionHandlers, assetId: string): void {
    try {
      handlers.onResyncRequired?.(assetId);
    } catch (error) {
      this.emitError(error, assetId, handlers);
    }
  }

  private emitError(
    error: unknown,
    assetId?: string,
    sourceHandler?: OrderBookSubscriptionHandlers,
  ): void {
    const handlersToNotify = new Set<OrderBookSubscriptionHandlers>();
    if (sourceHandler !== undefined) {
      handlersToNotify.add(sourceHandler);
    } else if (assetId !== undefined) {
      for (const handlers of this.subscriptions.get(assetId) ?? []) {
        handlersToNotify.add(handlers);
      }
    } else {
      for (const handlersForAsset of this.subscriptions.values()) {
        for (const handlers of handlersForAsset) {
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

export function createExchangeWebSocketClient(
  options: ExchangeWebSocketClientOptions,
): ExchangeWebSocketClient {
  return new ExchangeWebSocketClient(options);
}

function normalizeAssetId(input: ProtocolBigNumberish): string {
  return getAssetRequestSchema.parse({ assetId: input }).assetId.toString();
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

function closeEventToError(event: unknown, reason?: unknown): ExchangeSdkError {
  if (typeof event === "object" && event !== null) {
    const code = "code" in event ? formatUnknown(event.code) : "unknown";
    const closeReason = "reason" in event ? formatUnknown(event.reason) : "unknown";
    return new ExchangeSdkError(`WebSocket closed with code ${code}: ${closeReason}`);
  }

  const code = formatUnknown(event);
  const closeReason = formatUnknown(reason);
  return new ExchangeSdkError(`WebSocket closed with code ${code}: ${closeReason}`);
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

function parseNonNegativeIntegerOption(input: number, path: string): number {
  if (!Number.isInteger(input) || input < 0) {
    throw createProtocolValidationError("invalid_value", path, "expected a non-negative integer");
  }

  return input;
}

function parsePositiveIntegerOption(input: number, path: string): number {
  if (!Number.isInteger(input) || input <= 0) {
    throw createProtocolValidationError("invalid_value", path, "expected a positive integer");
  }

  return input;
}
