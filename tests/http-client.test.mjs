import assert from "node:assert/strict";
import test from "node:test";
import { Wallet, ZeroHash } from "ethers";
import {
  getDefaultExchangeChainConfig,
  createExchangeClient,
  createInfoClient,
  HttpResponseError,
  NonceManager,
  ProtocolValidationError,
} from "@gammaswap/v2-exchange-sdk";
import { SignatureType, OrderSide, TimeInForce } from "@gammaswap/v2-exchange-sdk/constants";
import { getExchangeDomain, hashFillOrderJS } from "@gammaswap/v2-exchange-sdk/hashing";
import { parseEip712Order } from "@gammaswap/v2-exchange-sdk/schemas";
import { validateSignatureJS } from "@gammaswap/v2-exchange-sdk/signing";

const WALLET = new Wallet(`0x${"11".repeat(32)}`);
const AGENT_WALLET = new Wallet(`0x${"22".repeat(32)}`);
const MASTER = WALLET.address;
const AGENT = AGENT_WALLET.address;
const TOKEN = "0x0000000000000000000000000000000000000004";
const LEDGER = "0x0000000000000000000000000000000000000005";
const RECEIVER = "0x0000000000000000000000000000000000000006";
const EXCHANGE = "0x0000000000000000000000000000000000000007";
const DEPOSIT_LEDGER = "0x0000000000000000000000000000000000000008";
const PERMIT2 = "0x0000000000000000000000000000000000000009";
const ORDER_HASH = `0x${"33".repeat(32)}`;

function createFetchMock(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const body =
      typeof init.body === "string" && init.body.length > 0 ? JSON.parse(init.body) : undefined;
    const call = {
      url,
      init,
      body,
    };
    calls.push(call);
    const result = await handler(call, calls.length - 1);
    return response(result);
  };

  return { fetch, calls };
}

function response({ status = 200, statusText = "OK", data = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async json() {
      return data;
    },
    async text() {
      return typeof data === "string" ? data : JSON.stringify(data);
    },
  };
}

function baseOrderInput(overrides = {}) {
  return {
    nonce: "1",
    epoch: "2",
    side: OrderSide.BUY,
    assetId: "123456789012345678901234567890",
    size: "1",
    price: "50",
    timeInForce: TimeInForce.GTC,
    ...overrides,
  };
}

function baseAgentOrderInput(overrides = {}) {
  return {
    ...baseOrderInput(),
    sender: MASTER,
    approvalNonce: "0",
    ...overrides,
  };
}

function baseCancelInput(overrides = {}) {
  return {
    nonce: "2",
    assetId: "123456789012345678901234567890",
    epoch: "2",
    orderHash: ORDER_HASH,
    ...overrides,
  };
}

function baseAgentCancelInput(overrides = {}) {
  return {
    ...baseCancelInput(),
    sender: MASTER,
    approvalNonce: "0",
    ...overrides,
  };
}

function baseClaimInput(overrides = {}) {
  return {
    nonce: "3",
    assetId: "123456789012345678901234567890",
    epoch: "2",
    ...overrides,
  };
}

function baseAgentClaimInput(overrides = {}) {
  return {
    ...baseClaimInput(),
    sender: MASTER,
    approvalNonce: "0",
    ...overrides,
  };
}

function exchangeConfig(overrides = {}) {
  return {
    chainId: "31337",
    contracts: {
      exchange: EXCHANGE,
      ledger: LEDGER,
      depositLedger: DEPOSIT_LEDGER,
      settlementToken: TOKEN,
      permit2: PERMIT2,
    },
    ...overrides,
  };
}

test("InfoClient implements the GET routes used by src/test examples", async () => {
  const mock = createFetchMock((call) => {
    if (new URL(call.url).pathname === "/api/config/chains/31337") {
      return { data: exchangeConfig() };
    }

    return { data: { ok: true } };
  });
  const client = createInfoClient({
    apiUrl: "http://localhost:3000/api",
    fetch: mock.fetch,
  });

  await client.getAsset("1");
  await client.getBalance(MASTER);
  await client.getOrderBook({ assetId: "2", epoch: "3" });
  await client.getBookOrders({ assetId: "2", epoch: "3", account: MASTER });
  await client.getTopOfBook({ assetId: "2", epoch: "3" });
  await client.getPosition({ account: MASTER, assetId: "2", epoch: "3" });
  await client.getAgentApproval(MASTER);
  const config = await client.getExchangeConfig("31337");

  assert.deepEqual(config.data, exchangeConfig());

  assert.deepEqual(
    mock.calls.map((call) => call.url),
    [
      "http://localhost:3000/api/asset/1",
      `http://localhost:3000/api/balance/${MASTER}`,
      "http://localhost:3000/api/book/2/3",
      `http://localhost:3000/api/book/2/3/${MASTER}`,
      "http://localhost:3000/api/book/market/top/2/3",
      `http://localhost:3000/api/position/${MASTER}/2/3`,
      `http://localhost:3000/api/agents/status/${MASTER}`,
      "http://localhost:3000/api/config/chains/31337",
    ],
  );
  assert.ok(mock.calls.every((call) => call.init.method === "GET"));
});

test("ExchangeClient signs and posts regular order, cancel, claim, withdrawal, approve, and revoke actions", async () => {
  const mock = createFetchMock(() => ({ data: { accepted: true } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    contracts: exchangeConfig().contracts,
    fetch: mock.fetch,
  });

  const order = await client.placeOrder(baseOrderInput());
  const cancel = await client.cancelAll(baseCancelInput({ orderHash: undefined }));
  const claim = await client.claim(baseClaimInput());
  const withdrawal = await client.withdraw({
    nonce: "4",
    receiver: RECEIVER,
    amount: "1",
  });
  const approval = await client.approveAgent({
    nonce: "5",
    agent: AGENT,
    approvalNonce: "42",
  });
  const revocation = await client.revokeAgent({ nonce: "6" });

  assert.deepEqual(
    mock.calls.map((call) => [call.init.method, new URL(call.url).pathname]),
    [
      ["POST", "/orders"],
      ["POST", "/cancels"],
      ["POST", "/claim"],
      ["POST", "/withdrawals"],
      ["POST", "/agents/approve"],
      ["POST", "/agents/revoke"],
    ],
  );

  assert.equal(order.request.order.signer, MASTER);
  assert.equal(order.request.order.sender, MASTER);
  assert.equal(order.request.order.signatureType, SignatureType.EOA.toString());
  assert.equal(order.request.order.size, "1000000");
  assert.equal(order.request.order.price, "500000");
  assert.equal(typeof order.request.order.nonce, "string");
  assert.equal(
    order.request.orderHash,
    hashFillOrderJS(parseEip712Order(order.request.order), getExchangeDomain("31337", EXCHANGE)),
  );
  assert.ok(validateSignatureJS(order.request.orderHash, order.request.signature, MASTER));

  assert.equal(cancel.request.cancel.orderHash, ZeroHash);
  assert.ok(validateSignatureJS(cancel.request.orderHash, cancel.request.signature, MASTER));
  assert.ok(validateSignatureJS(claim.request.orderHash, claim.request.signature, MASTER));
  assert.equal(withdrawal.request.withdrawal.ledger, LEDGER);
  assert.equal(withdrawal.request.withdrawal.amount, "1000000");
  assert.equal(approval.request.approval.approvalSignature.startsWith("0x"), true);
  assert.notEqual(approval.request.approval.approvalSignature, "0x");
  assert.ok(validateSignatureJS(approval.request.orderHash, approval.request.signature, MASTER));
  assert.ok(
    validateSignatureJS(revocation.request.orderHash, revocation.request.signature, MASTER),
  );
});

test("ExchangeClient placeOrder uses its nonce manager when nonce is omitted", async () => {
  const nowMs = 1_700_000_000_000;
  const nonceManager = new NonceManager({
    now: () => nowMs,
  });
  const mock = createFetchMock(() => ({ data: { accepted: true } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    fetch: mock.fetch,
    nonceManager,
  });
  const orderInput = baseOrderInput({ nonce: undefined });

  const first = await client.placeOrder(orderInput);
  const second = await client.placeOrder(orderInput);

  const firstNonce = BigInt(first.request.order.nonce);
  const secondNonce = BigInt(second.request.order.nonce);
  const { nonce: firstNonceJson, ...firstOrderWithoutNonce } = first.request.order;
  const { nonce: secondNonceJson, ...secondOrderWithoutNonce } = second.request.order;

  assert.equal(firstNonceJson, firstNonce.toString());
  assert.equal(secondNonceJson, secondNonce.toString());
  assert.equal(NonceManager.getTimestampMs(firstNonce), BigInt(nowMs));
  assert.equal(NonceManager.getTimestampMs(secondNonce), BigInt(nowMs));
  assert.equal(NonceManager.getCounter(firstNonce), 1);
  assert.equal(NonceManager.getCounter(secondNonce), 2);
  assert.deepEqual(firstOrderWithoutNonce, secondOrderWithoutNonce);
  assert.notEqual(first.request.orderHash, second.request.orderHash);
  assert.ok(validateSignatureJS(first.request.orderHash, first.request.signature, MASTER));
  assert.ok(validateSignatureJS(second.request.orderHash, second.request.signature, MASTER));
  assert.deepEqual(
    mock.calls.map((call) => [call.init.method, new URL(call.url).pathname]),
    [
      ["POST", "/orders"],
      ["POST", "/orders"],
    ],
  );
});

test("ExchangeClient uses hard-coded localhost contracts when no contracts are provided", async () => {
  const defaultConfig = getDefaultExchangeChainConfig("31337");
  assert.ok(defaultConfig);

  const mock = createFetchMock(() => ({ data: { accepted: true } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    fetch: mock.fetch,
  });

  const withdrawal = await client.withdraw({
    nonce: "4",
    receiver: RECEIVER,
    amount: "1",
  });

  assert.equal(withdrawal.request.withdrawal.ledger, defaultConfig.contracts.ledger);
});

test("ExchangeClient agent actions fetch approval nonce and sign as the agent", async () => {
  const mock = createFetchMock((call) => {
    if (call.init.method === "GET") {
      return { data: { nonce: "42" } };
    }
    return { data: { accepted: true } };
  });
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: AGENT_WALLET,
    chainId: "31337",
    fetch: mock.fetch,
  });

  const order = await client.placeAgentOrder(baseAgentOrderInput({ approvalNonce: undefined }));
  const cancel = await client.cancelAgentOrder(baseAgentCancelInput({ approvalNonce: undefined }));
  const claim = await client.claimAgent(baseAgentClaimInput({ approvalNonce: undefined }));

  assert.deepEqual(
    mock.calls.map((call) => [call.init.method, new URL(call.url).pathname]),
    [
      ["GET", `/agents/status/${MASTER}`],
      ["POST", "/orders"],
      ["GET", `/agents/status/${MASTER}`],
      ["POST", "/cancels"],
      ["GET", `/agents/status/${MASTER}`],
      ["POST", "/claim"],
    ],
  );

  assert.equal(order.request.order.signer, AGENT);
  assert.equal(order.request.order.sender, MASTER);
  assert.equal(order.request.order.signatureType, SignatureType.AGENT.toString());
  assert.equal(order.request.order.approvalNonce, "42");
  assert.ok(validateSignatureJS(order.request.orderHash, order.request.signature, AGENT));

  assert.equal(cancel.request.cancel.approvalNonce, "42");
  assert.ok(validateSignatureJS(cancel.request.orderHash, cancel.request.signature, AGENT));
  assert.equal(claim.request.claim.approvalNonce, "42");
  assert.ok(validateSignatureJS(claim.request.orderHash, claim.request.signature, AGENT));
});

test("InfoClient rejects invalid request fields before sending", async () => {
  const mock = createFetchMock(() => ({ data: { ok: true } }));
  const client = createInfoClient({
    apiUrl: "http://localhost:3000",
    fetch: mock.fetch,
  });

  await assert.rejects(() => client.getAsset(1), ProtocolValidationError);
  assert.equal(mock.calls.length, 0);
});

test("ExchangeClient rejects invalid signed action fields before posting", async () => {
  const mock = createFetchMock(() => ({ data: { accepted: true } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    fetch: mock.fetch,
  });

  await assert.rejects(
    () => client.placeOrder(baseOrderInput({ price: "99.89" })),
    (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.code, "invalid_decimal_string");
      assert.equal(error.issues[0]?.path, "$.price");
      return true;
    },
  );
  await assert.rejects(
    () => client.withdraw({ amount: "0" }),
    (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.code, "invalid_value");
      assert.equal(error.issues[0]?.path, "$.amount");
      return true;
    },
  );
  assert.equal(mock.calls.length, 0);
});

test("ExchangeClient rejects invalid agent status nonce before posting agent action", async () => {
  const mock = createFetchMock(() => ({ data: { nonce: 42 } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: AGENT_WALLET,
    chainId: "31337",
    fetch: mock.fetch,
  });

  await assert.rejects(
    () => client.placeAgentOrder(baseAgentOrderInput({ approvalNonce: undefined })),
    ProtocolValidationError,
  );
  assert.equal(mock.calls.length, 1);
});

test("HTTP clients throw HttpResponseError for non-2xx responses", async () => {
  const mock = createFetchMock(() => ({
    status: 500,
    statusText: "Internal Server Error",
    data: { error: "boom" },
  }));
  const client = createInfoClient({
    apiUrl: "http://localhost:3000",
    fetch: mock.fetch,
  });

  await assert.rejects(
    () => client.getBalance(MASTER),
    (error) => {
      assert.ok(error instanceof HttpResponseError);
      assert.equal(error.status, 500);
      assert.deepEqual(error.data, { error: "boom" });
      return true;
    },
  );
});

test("clients reject empty apiUrl", () => {
  assert.throws(
    () => createInfoClient({ apiUrl: "", fetch: async () => response() }),
    ProtocolValidationError,
  );
});
