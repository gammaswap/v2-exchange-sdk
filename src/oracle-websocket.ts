import NodeWebSocket from "ws";
import { ExchangeSdkError, createProtocolValidationError } from "./errors.js";
import { parseOracleWebSocketMessage } from "./schemas.js";
import type {
  OraclePriceSubscriptionHandlers,
  OraclePriceUpdate,
  OracleWebSocketMessage,
  ProtocolBigNumberish,
  Unsubscribe,
  WebSocketConnectionState,
} from "./types.js";

export interface OracleWebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  addEventListener?(event: string, listener: (event: unknown) => void): void;
  removeEventListener?(event: string, listener: (event: unknown) => void): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export type OracleWebSocketConstructorLike = new (url: string) => OracleWebSocketLike;

export interface OracleWebSocketClientOptions {
  websocketUrl: string;
  WebSocketCtor?: OracleWebSocketConstructorLike;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  ackTimeoutMs?: number;
  stalePriceTimeoutMs?: number;
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
const DEFAULT_STALE_PRICE_TIMEOUT_MS = 30_000;
const UINT256_MAX = 2n ** 256n - 1n;
const DECIMAL_STRING_PATTERN = /^(0|[1-9][0-9]*)$/;

export class OracleWebSocketClient {
  readonly websocketUrl: string;

  private readonly WebSocketCtor: OracleWebSocketConstructorLike;
  private readonly reconnect: boolean;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly ackTimeoutMs: number;
  private readonly stalePriceTimeoutMs: number;
  private readonly onError?: (error: unknown) => void;

  private state: WebSocketConnectionState = "idle";
  private socket?: OracleWebSocketLike;
  private connectPromise?: Promise<void>;
  private connectResolve?: () => void;
  private connectReject?: (error: unknown) => void;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  private readonly subscriptions = new Map<string, Set<OraclePriceSubscriptionHandlers>>();
  private readonly pendingSubscribes = new Map<string, PendingAck>();
  private readonly pendingUnsubscribes = new Map<string, PendingAck>();
  private readonly stalePriceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: OracleWebSocketClientOptions) {
    if (options.websocketUrl.trim() === "") {
      throw createProtocolValidationError(
        "invalid_value",
        "$.websocketUrl",
        "websocketUrl is required",
      );
    }

    this.websocketUrl = options.websocketUrl;
    this.WebSocketCtor = options.WebSocketCtor ?? getDefaultOracleWebSocketConstructor();
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
    this.stalePriceTimeoutMs = parsePositiveIntegerOption(
      options.stalePriceTimeoutMs ?? DEFAULT_STALE_PRICE_TIMEOUT_MS,
      "$.stalePriceTimeoutMs",
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
    this.clearStalePriceTimers();
    this.rejectPendingAcks(new ExchangeSdkError("Oracle WebSocket client closed"));
    this.rejectConnect(new ExchangeSdkError("Oracle WebSocket client closed"));

    const socket = this.socket;
    this.socket = undefined;
    this.state = "closed";

    if (socket !== undefined && (socket.readyState === CONNECTING || socket.readyState === OPEN)) {
      socket.close(code, reason);
    }
  }

  async subscribePrice(
    symbolIdInput: ProtocolBigNumberish,
    handlers: OraclePriceSubscriptionHandlers,
  ): Promise<Unsubscribe> {
    const symbolId = normalizeSymbolId(symbolIdInput);
    await this.connect();

    const existingHandlers = this.subscriptions.get(symbolId);
    if (existingHandlers !== undefined) {
      existingHandlers.add(handlers);
      try {
        await this.pendingSubscribes.get(symbolId)?.promise;
      } catch (error) {
        existingHandlers.delete(handlers);
        if (existingHandlers.size === 0) {
          this.subscriptions.delete(symbolId);
        }
        throw error;
      }
      return this.createUnsubscribe(symbolId, handlers);
    }

    this.subscriptions.set(symbolId, new Set([handlers]));

    try {
      await this.subscribeSymbolOnServer(symbolId);
      this.armStalePriceTimer(symbolId);
    } catch (error) {
      const handlersForSymbol = this.subscriptions.get(symbolId);
      handlersForSymbol?.delete(handlers);
      if (handlersForSymbol === undefined || handlersForSymbol.size === 0) {
        this.subscriptions.delete(symbolId);
      }
      this.handleConnectionFailure(error);
      throw error;
    }

    return this.createUnsubscribe(symbolId, handlers);
  }

  async unsubscribePrice(symbolIdInput: ProtocolBigNumberish): Promise<void> {
    const symbolId = normalizeSymbolId(symbolIdInput);
    await this.removeSubscription(symbolId);
  }

  private createUnsubscribe(
    symbolId: string,
    handlers: OraclePriceSubscriptionHandlers,
  ): Unsubscribe {
    let didUnsubscribe = false;

    return async () => {
      if (didUnsubscribe) {
        return;
      }

      didUnsubscribe = true;
      await this.removeSubscription(symbolId, handlers);
    };
  }

  private async removeSubscription(
    symbolId: string,
    handlers?: OraclePriceSubscriptionHandlers,
  ): Promise<void> {
    const handlersForSymbol = this.subscriptions.get(symbolId);
    if (handlersForSymbol === undefined) {
      return;
    }

    if (handlers === undefined) {
      handlersForSymbol.clear();
    } else {
      handlersForSymbol.delete(handlers);
    }

    if (handlersForSymbol.size > 0) {
      return;
    }

    this.subscriptions.delete(symbolId);
    this.clearStalePriceTimer(symbolId);
    if (this.isOpen()) {
      await this.unsubscribeSymbolOnServerBestEffort(symbolId);
    }
  }

  private async subscribeSymbolOnServer(symbolId: string): Promise<void> {
    if (this.pendingSubscribes.has(symbolId)) {
      await this.pendingSubscribes.get(symbolId)?.promise;
      return;
    }

    const pendingAck = this.createPendingAck(this.pendingSubscribes, symbolId, "subscribe");
    try {
      this.sendJson({ type: "subscribe", symbolId });
      await pendingAck.promise;
    } catch (error) {
      this.clearPendingAck(this.pendingSubscribes, symbolId);
      throw error;
    }
  }

  private async unsubscribeSymbolOnServer(symbolId: string): Promise<void> {
    if (this.pendingUnsubscribes.has(symbolId)) {
      await this.pendingUnsubscribes.get(symbolId)?.promise;
      return;
    }

    const pendingAck = this.createPendingAck(this.pendingUnsubscribes, symbolId, "unsubscribe");
    try {
      this.sendJson({ type: "unsubscribe", symbolId });
      await pendingAck.promise;
    } catch (error) {
      this.clearPendingAck(this.pendingUnsubscribes, symbolId);
      throw error;
    }
  }

  private async unsubscribeSymbolOnServerBestEffort(symbolId: string): Promise<void> {
    try {
      await this.unsubscribeSymbolOnServer(symbolId);
    } catch (error) {
      this.handleConnectionFailure(error);
    }
  }

  private createPendingAck(
    pendingAcks: Map<string, PendingAck>,
    symbolId: string,
    action: "subscribe" | "unsubscribe",
  ): PendingAck {
    let resolveAck: (() => void) | undefined;
    let rejectAck: ((error: unknown) => void) | undefined;
    const timer = setTimeout(() => {
      const pendingAck = pendingAcks.get(symbolId);
      if (pendingAck !== undefined) {
        pendingAcks.delete(symbolId);
        pendingAck.reject(
          new ExchangeSdkError(
            `Timed out waiting for oracle ${action} acknowledgement for symbolId ${symbolId}`,
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

    pendingAcks.set(symbolId, pendingAck);
    return pendingAck;
  }

  private clearPendingAck(pendingAcks: Map<string, PendingAck>, symbolId: string): void {
    const pendingAck = pendingAcks.get(symbolId);
    if (pendingAck !== undefined) {
      clearTimeout(pendingAck.timer);
      pendingAcks.delete(symbolId);
    }
  }

  private resolvePendingAck(pendingAcks: Map<string, PendingAck>, symbolId: string): boolean {
    const pendingAck = pendingAcks.get(symbolId);
    if (pendingAck === undefined) {
      return false;
    }

    pendingAcks.delete(symbolId);
    pendingAck.resolve();
    return true;
  }

  private rejectPendingAcks(error: unknown): void {
    for (const [symbolId, pendingAck] of this.pendingSubscribes) {
      this.pendingSubscribes.delete(symbolId);
      pendingAck.reject(error);
    }
    for (const [symbolId, pendingAck] of this.pendingUnsubscribes) {
      this.pendingUnsubscribes.delete(symbolId);
      pendingAck.reject(error);
    }
  }

  private sendJson(message: unknown): void {
    if (!this.isOpen() || this.socket === undefined) {
      throw new ExchangeSdkError("Oracle WebSocket is not open");
    }

    this.socket.send(JSON.stringify(message));
  }

  private attachSocketListeners(socket: OracleWebSocketLike): void {
    addSocketListener(socket, "open", () => this.handleOpen(socket));
    addSocketListener(socket, "message", (event) => this.handleMessageEvent(socket, event));
    addSocketListener(socket, "error", (event) => this.handleErrorEvent(socket, event));
    addSocketListener(socket, "close", (event, reason) =>
      this.handleCloseEvent(socket, event, reason),
    );
  }

  private handleOpen(socket: OracleWebSocketLike): void {
    if (socket !== this.socket) {
      return;
    }

    const wasReconnecting = this.state === "reconnecting";
    this.state = "open";
    this.reconnectAttempt = 0;
    this.resolveConnect();

    if (wasReconnecting) {
      this.resubscribeActiveSymbols();
    }
  }

  private handleMessageEvent(socket: OracleWebSocketLike, event: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    try {
      const rawData = getMessageEventData(event);
      const parsedJson = JSON.parse(messageDataToString(rawData)) as unknown;
      const message = parseOracleWebSocketMessage(parsedJson);
      this.handleMessage(message);
    } catch (error) {
      this.emitError(error);
    }
  }

  private handleMessage(message: OracleWebSocketMessage): void {
    if (message.type === "connected") {
      return;
    }

    if (message.type === "subscribed") {
      this.resolvePendingAck(this.pendingSubscribes, message.symbolId);
      if (this.subscriptions.has(message.symbolId)) {
        this.armStalePriceTimer(message.symbolId);
      }
      return;
    }

    if (message.type === "unsubscribed") {
      const didResolveAck = this.resolvePendingAck(this.pendingUnsubscribes, message.symbolId);
      if (!didResolveAck) {
        this.handleServerUnsubscribe(message.symbolId, message.reason);
      }
      return;
    }

    if (message.type === "error") {
      this.emitError(new ExchangeSdkError(message.message));
      return;
    }

    this.dispatchPriceUpdate(message);
  }

  private dispatchPriceUpdate(update: OraclePriceUpdate): void {
    const symbolId = update.symbolId.toString();
    const handlersForSymbol = this.subscriptions.get(symbolId);
    if (handlersForSymbol === undefined) {
      return;
    }

    this.armStalePriceTimer(symbolId);

    for (const handlers of Array.from(handlersForSymbol)) {
      this.callHandler(() => handlers.onPrice?.(update), handlers, symbolId);
    }
  }

  private handleServerUnsubscribe(symbolId: string, reason?: string): void {
    const handlersForSymbol = this.subscriptions.get(symbolId);
    if (handlersForSymbol === undefined) {
      return;
    }

    const error = new ExchangeSdkError(
      reason === undefined
        ? `Oracle websocket unsubscribed from symbolId ${symbolId}`
        : `Oracle websocket unsubscribed from symbolId ${symbolId}: ${reason}`,
    );
    this.emitError(error, symbolId);
    this.subscriptions.delete(symbolId);
    this.clearStalePriceTimer(symbolId);
  }

  private callHandler(
    callback: () => void,
    handlers: OraclePriceSubscriptionHandlers,
    symbolId: string,
  ): void {
    try {
      callback();
    } catch (error) {
      this.emitError(error, symbolId, handlers);
    }
  }

  private handleErrorEvent(socket: OracleWebSocketLike, event: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    this.emitError(extractError(event));
  }

  private handleCloseEvent(socket: OracleWebSocketLike, event: unknown, reason?: unknown): void {
    if (socket !== this.socket) {
      return;
    }

    const error = closeEventToError(event, reason);
    const shouldReconnect = !this.manuallyClosed && this.reconnect && this.subscriptions.size > 0;

    this.socket = undefined;
    this.clearStalePriceTimers();
    this.rejectPendingAcks(error);
    this.rejectConnect(error);

    if (shouldReconnect) {
      this.emitError(error);
      this.scheduleReconnect();
    } else {
      this.state = "closed";
    }
  }

  private handleConnectionFailure(error: unknown): void {
    this.emitError(error);

    const socket = this.socket;
    this.socket = undefined;
    this.clearStalePriceTimers();
    this.rejectPendingAcks(error);
    this.rejectConnect(error);

    if (!this.manuallyClosed && this.reconnect && this.subscriptions.size > 0) {
      this.scheduleReconnect();
    } else {
      this.state = "closed";
    }

    if (socket !== undefined) {
      this.closeFailedSocket(socket);
    }
  }

  private closeFailedSocket(socket: OracleWebSocketLike): void {
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

  private resubscribeActiveSymbols(): void {
    for (const symbolId of this.subscriptions.keys()) {
      try {
        this.sendJson({ type: "subscribe", symbolId });
        this.armStalePriceTimer(symbolId);
      } catch (error) {
        this.handleConnectionFailure(error);
        return;
      }
    }
  }

  private armStalePriceTimer(symbolId: string): void {
    if (!this.subscriptions.has(symbolId) || this.manuallyClosed) {
      return;
    }

    this.clearStalePriceTimer(symbolId);
    this.stalePriceTimers.set(
      symbolId,
      setTimeout(() => this.handleStalePrice(symbolId), this.stalePriceTimeoutMs),
    );
  }

  private clearStalePriceTimer(symbolId: string): void {
    const timer = this.stalePriceTimers.get(symbolId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.stalePriceTimers.delete(symbolId);
    }
  }

  private clearStalePriceTimers(): void {
    for (const timer of this.stalePriceTimers.values()) {
      clearTimeout(timer);
    }
    this.stalePriceTimers.clear();
  }

  private handleStalePrice(symbolId: string): void {
    const handlersForSymbol = this.subscriptions.get(symbolId);
    if (handlersForSymbol === undefined) {
      return;
    }

    this.clearStalePriceTimer(symbolId);
    for (const handlers of Array.from(handlersForSymbol)) {
      this.callStaleHandler(handlers, symbolId);
    }

    this.handleConnectionFailure(
      new ExchangeSdkError(
        `No oracle price update received for symbolId ${symbolId} within ${this.stalePriceTimeoutMs.toString()}ms`,
      ),
    );
  }

  private callStaleHandler(handlers: OraclePriceSubscriptionHandlers, symbolId: string): void {
    try {
      handlers.onStale?.(symbolId);
    } catch (error) {
      this.emitError(error, symbolId, handlers);
    }
  }

  private emitError(
    error: unknown,
    symbolId?: string,
    sourceHandler?: OraclePriceSubscriptionHandlers,
  ): void {
    const handlersToNotify = new Set<OraclePriceSubscriptionHandlers>();
    if (sourceHandler !== undefined) {
      handlersToNotify.add(sourceHandler);
    } else if (symbolId !== undefined) {
      for (const handlers of this.subscriptions.get(symbolId) ?? []) {
        handlersToNotify.add(handlers);
      }
    } else {
      for (const handlersForSymbol of this.subscriptions.values()) {
        for (const handlers of handlersForSymbol) {
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

export function createOracleWebSocketClient(
  options: OracleWebSocketClientOptions,
): OracleWebSocketClient {
  return new OracleWebSocketClient(options);
}

function normalizeSymbolId(input: ProtocolBigNumberish): string {
  let value: bigint;

  if (typeof input === "bigint") {
    value = input;
  } else if (typeof input === "string") {
    if (!DECIMAL_STRING_PATTERN.test(input)) {
      throw createProtocolValidationError(
        "invalid_decimal_string",
        "$.symbolId",
        "expected a canonical unsigned decimal string",
      );
    }
    value = BigInt(input);
  } else {
    throw createProtocolValidationError(
      "invalid_type",
      "$.symbolId",
      "expected bigint or canonical unsigned decimal string",
    );
  }

  if (value < 0n || value > UINT256_MAX) {
    throw createProtocolValidationError(
      "integer_out_of_range",
      "$.symbolId",
      `expected integer in range 0..${UINT256_MAX.toString()}`,
    );
  }

  return value.toString();
}

function getDefaultOracleWebSocketConstructor(): OracleWebSocketConstructorLike {
  return globalThis.WebSocket ?? NodeWebSocket;
}

function addSocketListener(
  socket: OracleWebSocketLike,
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
    return new ExchangeSdkError(`Oracle WebSocket closed with code ${code}: ${closeReason}`);
  }

  const code = formatUnknown(event);
  const closeReason = formatUnknown(reason);
  return new ExchangeSdkError(`Oracle WebSocket closed with code ${code}: ${closeReason}`);
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
