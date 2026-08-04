import { ExchangeSdkError } from "./errors.js";
import { getAssetRequestSchema, parseWebSocketMessage } from "./schemas.js";
import {
  BaseSubscriptionWebSocketClient,
  type SubscriptionWebSocketClientOptions,
  type WebSocketConstructorLike,
  type WebSocketLike,
} from "./websocket-core.js";
import type {
  OrderBookSubscriptionHandlers,
  ProtocolBigNumberish,
  Unsubscribe,
  WebSocketMarketUpdate,
  WebSocketMessage,
} from "./types.js";

export type { WebSocketConstructorLike, WebSocketLike };

export interface ExchangeWebSocketClientOptions extends SubscriptionWebSocketClientOptions {
  WebSocketCtor?: WebSocketConstructorLike;
}

export class ExchangeWebSocketClient extends BaseSubscriptionWebSocketClient<
  OrderBookSubscriptionHandlers,
  WebSocketMessage
> {
  constructor(options: ExchangeWebSocketClientOptions) {
    super(options, {
      closedMessage: "WebSocket client closed",
      notOpenMessage: "WebSocket is not open",
      closeEventPrefix: "WebSocket",
      ackTimeoutMessage: (action, assetId) =>
        `Timed out waiting for ${action} acknowledgement for assetId ${assetId}`,
    });
  }

  async subscribeOrderBook(
    assetIdInput: ProtocolBigNumberish,
    handlers: OrderBookSubscriptionHandlers,
  ): Promise<Unsubscribe> {
    return this.subscribeKey(normalizeAssetId(assetIdInput), handlers);
  }

  async unsubscribeOrderBook(assetIdInput: ProtocolBigNumberish): Promise<void> {
    await this.unsubscribeKey(normalizeAssetId(assetIdInput));
  }

  protected parseMessage(input: unknown): WebSocketMessage {
    return parseWebSocketMessage(input);
  }

  protected handleMessage(message: WebSocketMessage): void {
    if (message.type === "connected") {
      return;
    }

    if (message.type === "subscribed") {
      this.resolveSubscribeAck(message.assetId);
      return;
    }

    if (message.type === "unsubscribed") {
      this.resolveUnsubscribeAck(message.assetId);
      return;
    }

    if (message.type === "error") {
      this.emitError(new ExchangeSdkError(message.message));
      return;
    }

    this.dispatchMarketUpdate(message);
  }

  protected buildSubscribeMessage(assetId: string): unknown {
    return { type: "subscribe", assetId };
  }

  protected buildUnsubscribeMessage(assetId: string): unknown {
    return { type: "unsubscribe", assetId };
  }

  protected beforeReconnect(): void {
    this.emitResyncRequiredForAll();
  }

  protected afterReconnectOpen(): void {
    this.resubscribeActiveAssets();
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

  private resubscribeActiveAssets(): void {
    for (const assetId of this.subscriptions.keys()) {
      try {
        this.sendJson(this.buildSubscribeMessage(assetId));
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
}

export function createExchangeWebSocketClient(
  options: ExchangeWebSocketClientOptions,
): ExchangeWebSocketClient {
  return new ExchangeWebSocketClient(options);
}

function normalizeAssetId(input: ProtocolBigNumberish): string {
  return getAssetRequestSchema.parse({ assetId: input }).assetId.toString();
}
