import assert from "node:assert/strict";
import test from "node:test";
import {
  createExchangeWebSocketClient,
  ExchangeWebSocketClient,
} from "@gammaswap/v2-exchange-sdk/websocket";
import { ExchangeSdkError, ProtocolValidationError } from "@gammaswap/v2-exchange-sdk/errors";

const ASSET_ID = "261336857817713630688382311349658711122006440411137";
const OTHER_ASSET_ID = "261336857817713630688382311349658711122006440411138";
const ORDER_ID = `0x${"11".repeat(32)}`;
const CANCEL_ORDER_ID = `0x${"22".repeat(32)}`;
const RESOLUTION_ORDER_ID = `0x${"33".repeat(32)}`;

class FakeWebSocket {
  static instances = [];

  readyState = 0;
  sent = [];
  listeners = new Map();
  terminated = false;

  constructor(url) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  static latest() {
    return FakeWebSocket.instances.at(-1);
  }

  addEventListener(event, listener) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event, listener) {
    this.listeners.get(event)?.delete(listener);
  }

  send(data) {
    if (this.readyState !== 1) {
      throw new Error("fake websocket is not open");
    }
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  terminate() {
    this.terminated = true;
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.emit("open", {});
  }

  serverMessage(message) {
    this.emit("message", {
      data: typeof message === "string" ? message : JSON.stringify(message),
    });
  }

  serverClose(code = 1006, reason = "lost") {
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  sentJson(index) {
    return JSON.parse(this.sent[index]);
  }

  emit(event, ...args) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

function createClient(options = {}) {
  FakeWebSocket.reset();
  return createExchangeWebSocketClient({
    websocketUrl: "ws://localhost:4000",
    WebSocketCtor: FakeWebSocket,
    ackTimeoutMs: 50,
    reconnectDelayMs: 0,
    maxReconnectDelayMs: 0,
    ...options,
  });
}

function openLatestSocket() {
  const socket = FakeWebSocket.latest();
  assert.ok(socket);
  socket.open();
  return socket;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function subscribe(client, assetId = ASSET_ID, handlers = {}) {
  const subscribePromise = client.subscribeOrderBook(assetId, handlers);
  const socket = openLatestSocket();
  await settle();
  assert.deepEqual(socket.sentJson(0), { type: "subscribe", assetId });
  socket.serverMessage({ type: "subscribed", assetId });
  return { unsubscribe: await subscribePromise, socket };
}

function orderMessage(overrides = {}) {
  return {
    type: "order",
    seqId: 23,
    data: {
      orderId: ORDER_ID,
      assetId: ASSET_ID,
      epoch: "0",
      price: "650000",
      side: "sell",
      size: "10000000",
      arrivalTime: "1785142225",
      tif: "GTC",
      type: "limit",
      ...overrides,
    },
  };
}

function tradeMessage(overrides = {}) {
  return {
    type: "trade",
    seqId: 28,
    data: {
      orderId: ORDER_ID,
      assetId: ASSET_ID,
      epoch: "0",
      price: "600000",
      side: "buy",
      size: "200000000",
      arrivalTime: "1785141599",
      fillPrice: "600000",
      fill: "160000000",
      tif: "GTC",
      type: "limit",
      ...overrides,
    },
  };
}

function cancelMessage(overrides = {}) {
  return {
    type: "cancel",
    seqId: 24,
    data: {
      orderId: CANCEL_ORDER_ID,
      cancelId: ORDER_ID,
      assetId: ASSET_ID,
      epoch: "0",
      arrivalTime: "1785142265",
      ...overrides,
    },
  };
}

function resolutionMessage(overrides = {}) {
  return {
    type: "resolution",
    seqId: 30,
    data: {
      orderId: RESOLUTION_ORDER_ID,
      assetId: ASSET_ID,
      epoch: "0",
      price: "65282497628",
      arrivalTime: "1785142584",
      ...overrides,
    },
  };
}

test("ExchangeWebSocketClient subscribes and unsubscribes with acknowledgement", async () => {
  const client = createClient();

  const { unsubscribe, socket } = await subscribe(client);
  const unsubscribePromise = unsubscribe();

  assert.deepEqual(socket.sentJson(1), { type: "unsubscribe", assetId: ASSET_ID });
  socket.serverMessage({ type: "unsubscribed", assetId: ASSET_ID });
  await unsubscribePromise;
});

test("ExchangeWebSocketClient dispatches typed market updates for subscribed assets", async () => {
  const client = createClient();
  const updates = [];
  const orders = [];
  const trades = [];
  const cancels = [];
  const resolutions = [];

  const { socket } = await subscribe(client, ASSET_ID, {
    onUpdate: (update) => updates.push(update),
    onOrder: (update) => orders.push(update),
    onTrade: (update) => trades.push(update),
    onCancel: (update) => cancels.push(update),
    onResolution: (update) => resolutions.push(update),
  });

  socket.serverMessage(orderMessage());
  socket.serverMessage(tradeMessage());
  socket.serverMessage(cancelMessage());
  socket.serverMessage(resolutionMessage());

  assert.equal(updates.length, 4);
  assert.equal(orders[0].seqId, 23n);
  assert.equal(orders[0].assetId, BigInt(ASSET_ID));
  assert.equal(orders[0].epoch, 0n);
  assert.equal(orders[0].data.price, 650_000n);
  assert.equal(trades[0].data.fill, 160_000_000n);
  assert.equal(cancels[0].data.cancelId, ORDER_ID);
  assert.equal(resolutions[0].data.price, 65_282_497_628n);
});

test("ExchangeWebSocketClient ignores market updates for untracked assets", async () => {
  const client = createClient();
  const updates = [];
  const { socket } = await subscribe(client, ASSET_ID, {
    onUpdate: (update) => updates.push(update),
  });

  socket.serverMessage(orderMessage({ assetId: OTHER_ASSET_ID }));

  assert.equal(updates.length, 0);
});

test("ExchangeWebSocketClient reconnects, resubscribes, and signals resync", async () => {
  const client = createClient();
  const resyncs = [];
  const { socket } = await subscribe(client, ASSET_ID, {
    onResyncRequired: (assetId) => resyncs.push(assetId),
  });

  socket.serverClose();
  assert.deepEqual(resyncs, [ASSET_ID]);

  await settle();
  const reconnectedSocket = FakeWebSocket.latest();
  assert.notEqual(reconnectedSocket, socket);
  reconnectedSocket.open();
  await settle();

  assert.deepEqual(reconnectedSocket.sentJson(0), { type: "subscribe", assetId: ASSET_ID });
});

test("ExchangeWebSocketClient treats unsubscribe acknowledgement timeouts as best-effort", async () => {
  const errors = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const { unsubscribe, socket } = await subscribe(client);

  await unsubscribe();

  assert.deepEqual(socket.sentJson(1), { type: "unsubscribe", assetId: ASSET_ID });
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ExchangeSdkError);
  assert.match(errors[0].message, /Timed out waiting for unsubscribe acknowledgement/);
  assert.equal(client.connectionState, "closed");
  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(socket.terminated, true);
});

test("ExchangeWebSocketClient reconnects remaining subscriptions after unsubscribe acknowledgement timeout", async () => {
  const errors = [];
  const resyncs = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const { unsubscribe, socket } = await subscribe(client, ASSET_ID, {
    onResyncRequired: (assetId) => resyncs.push(assetId),
  });
  const secondSubscribePromise = client.subscribeOrderBook(OTHER_ASSET_ID, {
    onResyncRequired: (assetId) => resyncs.push(assetId),
  });

  await settle();
  assert.deepEqual(socket.sentJson(1), { type: "subscribe", assetId: OTHER_ASSET_ID });
  socket.serverMessage({ type: "subscribed", assetId: OTHER_ASSET_ID });
  await secondSubscribePromise;

  await unsubscribe();

  assert.deepEqual(socket.sentJson(2), { type: "unsubscribe", assetId: ASSET_ID });
  assert.equal(errors.length, 1);
  assert.deepEqual(resyncs, [OTHER_ASSET_ID]);

  await settle();
  const reconnectedSocket = FakeWebSocket.latest();
  assert.notEqual(reconnectedSocket, socket);
  reconnectedSocket.open();
  await settle();

  assert.deepEqual(reconnectedSocket.sentJson(0), {
    type: "subscribe",
    assetId: OTHER_ASSET_ID,
  });

  client.close();
});

test("ExchangeWebSocketClient reconnects existing subscriptions after subscribe acknowledgement timeout", async () => {
  const errors = [];
  const resyncs = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const { socket } = await subscribe(client, ASSET_ID, {
    onResyncRequired: (assetId) => resyncs.push(assetId),
  });
  const subscribePromise = client.subscribeOrderBook(OTHER_ASSET_ID, {
    onResyncRequired: (assetId) => resyncs.push(assetId),
  });

  await settle();
  assert.deepEqual(socket.sentJson(1), { type: "subscribe", assetId: OTHER_ASSET_ID });
  await assert.rejects(subscribePromise, (error) => {
    assert.ok(error instanceof ExchangeSdkError);
    assert.match(error.message, /Timed out waiting for subscribe acknowledgement/);
    return true;
  });

  assert.equal(errors.length, 1);
  assert.deepEqual(resyncs, [ASSET_ID]);

  await settle();
  const reconnectedSocket = FakeWebSocket.latest();
  assert.notEqual(reconnectedSocket, socket);
  reconnectedSocket.open();
  await settle();

  assert.deepEqual(reconnectedSocket.sentJson(0), { type: "subscribe", assetId: ASSET_ID });

  client.close();
});

test("ExchangeWebSocketClient surfaces malformed websocket messages through error handlers", async () => {
  const errors = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const connectPromise = client.connect();
  const socket = openLatestSocket();
  await connectPromise;

  socket.serverMessage("{bad json");
  socket.serverMessage(orderMessage({ assetId: 1 }));
  socket.serverMessage({ type: "error", message: "AssetId 123 is not available" });

  assert.equal(errors.length, 3);
  assert.ok(errors[0] instanceof SyntaxError);
  assert.ok(errors[1] instanceof ProtocolValidationError);
  assert.ok(errors[2] instanceof ExchangeSdkError);
});

test("websocket subpath exports the public client API", () => {
  assert.equal(typeof ExchangeWebSocketClient, "function");
  assert.equal(typeof createExchangeWebSocketClient, "function");
});
