import { ExchangeSdkError } from "./errors.js";
import { UINT256_MAX, parsePositiveIntegerOption, parseUnsignedInteger } from "./integer-inputs.js";
import { parseOracleWebSocketMessage } from "./schemas.js";
import {
  BaseSubscriptionWebSocketClient,
  type SubscriptionWebSocketClientOptions,
  type WebSocketConstructorLike,
  type WebSocketLike,
} from "./websocket-core.js";
import type {
  OraclePriceSubscriptionHandlers,
  OraclePriceUpdate,
  OracleWebSocketMessage,
  ProtocolBigNumberish,
  Unsubscribe,
} from "./types.js";

export type OracleWebSocketLike = WebSocketLike;
export type OracleWebSocketConstructorLike = WebSocketConstructorLike;

export interface OracleWebSocketClientOptions extends SubscriptionWebSocketClientOptions {
  WebSocketCtor?: OracleWebSocketConstructorLike;
  stalePriceTimeoutMs?: number;
}

const DEFAULT_STALE_PRICE_TIMEOUT_MS = 30_000;

export class OracleWebSocketClient extends BaseSubscriptionWebSocketClient<
  OraclePriceSubscriptionHandlers,
  OracleWebSocketMessage
> {
  private readonly stalePriceTimeoutMs: number;
  private readonly stalePriceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: OracleWebSocketClientOptions) {
    super(options, {
      closedMessage: "Oracle WebSocket client closed",
      notOpenMessage: "Oracle WebSocket is not open",
      closeEventPrefix: "Oracle WebSocket",
      emitUnexpectedCloseError: true,
      ackTimeoutMessage: (action, symbolId) =>
        `Timed out waiting for oracle ${action} acknowledgement for symbolId ${symbolId}`,
    });

    this.stalePriceTimeoutMs = parsePositiveIntegerOption(
      options.stalePriceTimeoutMs ?? DEFAULT_STALE_PRICE_TIMEOUT_MS,
      "$.stalePriceTimeoutMs",
    );
  }

  async subscribePrice(
    symbolIdInput: ProtocolBigNumberish,
    handlers: OraclePriceSubscriptionHandlers,
  ): Promise<Unsubscribe> {
    return this.subscribeKey(normalizeSymbolId(symbolIdInput), handlers);
  }

  async unsubscribePrice(symbolIdInput: ProtocolBigNumberish): Promise<void> {
    await this.unsubscribeKey(normalizeSymbolId(symbolIdInput));
  }

  protected parseMessage(input: unknown): OracleWebSocketMessage {
    return parseOracleWebSocketMessage(input);
  }

  protected handleMessage(message: OracleWebSocketMessage): void {
    if (message.type === "connected") {
      return;
    }

    if (message.type === "subscribed") {
      this.resolveSubscribeAck(message.symbolId);
      return;
    }

    if (message.type === "unsubscribed") {
      const didResolveAck = this.resolveUnsubscribeAck(message.symbolId);
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

  protected buildSubscribeMessage(symbolId: string): unknown {
    return { type: "subscribe", symbolId };
  }

  protected buildUnsubscribeMessage(symbolId: string): unknown {
    return { type: "unsubscribe", symbolId };
  }

  protected afterSubscribeAck(symbolId: string): void {
    this.armStalePriceTimer(symbolId);
  }

  protected afterSubscriptionRemoved(symbolId: string): void {
    this.clearStalePriceTimer(symbolId);
  }

  protected beforeManualClose(): void {
    this.clearStalePriceTimers();
  }

  protected beforeConnectionUnavailable(): void {
    this.clearStalePriceTimers();
  }

  protected afterReconnectOpen(): void {
    this.resubscribeActiveSymbols();
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

  private resubscribeActiveSymbols(): void {
    for (const symbolId of this.subscriptions.keys()) {
      try {
        this.sendJson(this.buildSubscribeMessage(symbolId));
        this.armStalePriceTimer(symbolId);
      } catch (error) {
        this.handleConnectionFailure(error);
        return;
      }
    }
  }

  private armStalePriceTimer(symbolId: string): void {
    if (!this.subscriptions.has(symbolId) || this.isManuallyClosed()) {
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
}

export function createOracleWebSocketClient(
  options: OracleWebSocketClientOptions,
): OracleWebSocketClient {
  return new OracleWebSocketClient(options);
}

function normalizeSymbolId(input: ProtocolBigNumberish): string {
  return parseUnsignedInteger(input, "$.symbolId", UINT256_MAX).toString();
}
