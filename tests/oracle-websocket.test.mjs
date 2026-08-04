import assert from "node:assert/strict";
import test from "node:test";
import {
  createOracleWebSocketClient,
  OracleWebSocketClient,
} from "@gammaswap/v2-exchange-sdk/oracle-websocket";
import { ExchangeSdkError, ProtocolValidationError } from "@gammaswap/v2-exchange-sdk/errors";

const SYMBOL_ID = "1";
const OTHER_SYMBOL_ID = "2";

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
  return createOracleWebSocketClient({
    websocketUrl: "ws://localhost:8082",
    WebSocketCtor: FakeWebSocket,
    ackTimeoutMs: 30,
    reconnectDelayMs: 0,
    maxReconnectDelayMs: 0,
    stalePriceTimeoutMs: 1_000,
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

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function subscribe(client, symbolId = SYMBOL_ID, handlers = {}) {
  const subscribePromise = client.subscribePrice(symbolId, handlers);
  const socket = openLatestSocket();
  await settle();
  assert.deepEqual(socket.sentJson(0), { type: "subscribe", symbolId });
  socket.serverMessage({ type: "subscribed", symbolId });
  return { unsubscribe: await subscribePromise, socket };
}

function priceMessage(overrides = {}) {
  return {
    type: "price",
    symbolId: SYMBOL_ID,
    price: "123456789",
    ts: 1_730_000_000,
    ...overrides,
  };
}

test("OracleWebSocketClient subscribes and unsubscribes with acknowledgement", async () => {
  const client = createClient();

  const { unsubscribe, socket } = await subscribe(client);
  const unsubscribePromise = unsubscribe();

  assert.deepEqual(socket.sentJson(1), { type: "unsubscribe", symbolId: SYMBOL_ID });
  socket.serverMessage({ type: "unsubscribed", symbolId: SYMBOL_ID });
  await unsubscribePromise;

  client.close();
});

test("OracleWebSocketClient shares one server subscription for duplicate symbol handlers", async () => {
  const client = createClient();
  const firstPrices = [];
  const secondPrices = [];
  const { unsubscribe: unsubscribeFirst, socket } = await subscribe(client, SYMBOL_ID, {
    onPrice: (update) => firstPrices.push(update),
  });

  const unsubscribeSecond = await client.subscribePrice(SYMBOL_ID, {
    onPrice: (update) => secondPrices.push(update),
  });

  assert.equal(socket.sent.length, 1);

  socket.serverMessage(priceMessage());
  assert.equal(firstPrices.length, 1);
  assert.equal(secondPrices.length, 1);
  assert.equal(firstPrices[0].symbolId, 1n);
  assert.equal(firstPrices[0].price, 123_456_789n);
  assert.equal(firstPrices[0].ts, 1_730_000_000n);

  await unsubscribeFirst();
  assert.equal(socket.sent.length, 1);

  socket.serverMessage(priceMessage({ price: "223456789" }));
  assert.equal(firstPrices.length, 1);
  assert.equal(secondPrices.length, 2);

  const unsubscribePromise = unsubscribeSecond();
  assert.deepEqual(socket.sentJson(1), { type: "unsubscribe", symbolId: SYMBOL_ID });
  socket.serverMessage({ type: "unsubscribed", symbolId: SYMBOL_ID });
  await unsubscribePromise;

  client.close();
});

test("OracleWebSocketClient supports multiple symbol subscriptions on one socket", async () => {
  const client = createClient();
  const symbolPrices = [];
  const otherSymbolPrices = [];
  const { socket } = await subscribe(client, SYMBOL_ID, {
    onPrice: (update) => symbolPrices.push(update),
  });
  const otherSubscribePromise = client.subscribePrice(OTHER_SYMBOL_ID, {
    onPrice: (update) => otherSymbolPrices.push(update),
  });

  await settle();
  assert.deepEqual(socket.sentJson(1), { type: "subscribe", symbolId: OTHER_SYMBOL_ID });
  socket.serverMessage({ type: "subscribed", symbolId: OTHER_SYMBOL_ID });
  await otherSubscribePromise;

  socket.serverMessage(priceMessage());
  socket.serverMessage(priceMessage({ symbolId: OTHER_SYMBOL_ID, price: "987654321" }));

  assert.equal(symbolPrices.length, 1);
  assert.equal(otherSymbolPrices.length, 1);
  assert.equal(otherSymbolPrices[0].symbolId, 2n);
  assert.equal(otherSymbolPrices[0].price, 987_654_321n);

  client.close();
});

test("OracleWebSocketClient handles unsolicited server unsubscriptions", async () => {
  const errors = [];
  const prices = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const { socket } = await subscribe(client, SYMBOL_ID, {
    onPrice: (update) => prices.push(update),
    onError: (error) => errors.push(error),
  });

  socket.serverMessage({
    type: "unsubscribed",
    symbolId: SYMBOL_ID,
    reason: "symbol unavailable",
  });
  socket.serverMessage(priceMessage());

  assert.equal(prices.length, 0);
  assert.equal(errors.length, 2);
  assert.ok(errors[0] instanceof ExchangeSdkError);
  assert.match(errors[0].message, /symbol unavailable/);

  client.close();
});

test("OracleWebSocketClient reconnects and resubscribes after unexpected close", async () => {
  const errors = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const { socket } = await subscribe(client);

  socket.serverClose();

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Oracle WebSocket closed/);

  await settle();
  const reconnectedSocket = FakeWebSocket.latest();
  assert.notEqual(reconnectedSocket, socket);
  reconnectedSocket.open();
  await settle();

  assert.deepEqual(reconnectedSocket.sentJson(0), { type: "subscribe", symbolId: SYMBOL_ID });

  client.close();
});

test("OracleWebSocketClient treats unsubscribe acknowledgement timeouts as best-effort", async () => {
  const errors = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const { unsubscribe, socket } = await subscribe(client);

  await unsubscribe();

  assert.deepEqual(socket.sentJson(1), { type: "unsubscribe", symbolId: SYMBOL_ID });
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ExchangeSdkError);
  assert.match(errors[0].message, /Timed out waiting for oracle unsubscribe acknowledgement/);
  assert.equal(client.connectionState, "closed");
  assert.equal(socket.terminated, true);
  assert.equal(FakeWebSocket.instances.length, 1);
});

test("OracleWebSocketClient reconnects after stale price timeout", async () => {
  const errors = [];
  const staleSymbols = [];
  const client = createClient({
    stalePriceTimeoutMs: 20,
    onError: (error) => errors.push(error),
  });
  const { socket } = await subscribe(client, SYMBOL_ID, {
    onStale: (symbolId) => staleSymbols.push(symbolId),
  });

  await wait(30);
  await settle();

  assert.deepEqual(staleSymbols, [SYMBOL_ID]);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /No oracle price update received/);
  assert.equal(socket.terminated, true);

  const reconnectedSocket = FakeWebSocket.latest();
  assert.notEqual(reconnectedSocket, socket);
  reconnectedSocket.open();
  await settle();

  assert.deepEqual(reconnectedSocket.sentJson(0), { type: "subscribe", symbolId: SYMBOL_ID });

  client.close();
});

test("OracleWebSocketClient surfaces malformed oracle messages through error handlers", async () => {
  const errors = [];
  const client = createClient({
    onError: (error) => errors.push(error),
  });
  const connectPromise = client.connect();
  const socket = openLatestSocket();
  await connectPromise;

  socket.serverMessage("{bad json");
  socket.serverMessage(priceMessage({ symbolId: 1 }));
  socket.serverMessage({ type: "error", message: "SymbolId 123 is not available" });

  assert.equal(errors.length, 3);
  assert.ok(errors[0] instanceof SyntaxError);
  assert.ok(errors[1] instanceof ProtocolValidationError);
  assert.ok(errors[2] instanceof ExchangeSdkError);

  client.close();
});

test("oracle websocket subpath exports the public client API", () => {
  assert.equal(typeof OracleWebSocketClient, "function");
  assert.equal(typeof createOracleWebSocketClient, "function");
});
