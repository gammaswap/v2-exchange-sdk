import assert from "node:assert/strict";
import test from "node:test";
import { Wallet, ZeroHash } from "ethers";
import {
  getDefaultExchangeChainConfig,
  createExchangeClient,
  createInfoClient,
  HttpResponseError,
  HttpAbortError,
  HttpTransportError,
  HttpTimeoutError,
  NonceManager,
  ProtocolValidationError,
} from "@gammaswap/v2-exchange-sdk";
import { SignatureType, OrderSide, TimeInForce } from "@gammaswap/v2-exchange-sdk/constants";
import {
  getExchangeDomain,
  hashCancelReplaceOrderJS,
  hashFillOrderJS,
} from "@gammaswap/v2-exchange-sdk/hashing";
import { parseEip712CancelReplace, parseEip712Order } from "@gammaswap/v2-exchange-sdk/schemas";
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
const AGENT_APPROVAL_NONCE = "1780272001";
const MIN_AGENT_APPROVAL_NONCE = "1780272000";

function currentSeconds() {
  return BigInt(Math.floor(Date.now() / 1000));
}

function futureApprovalNonce(offsetSeconds = 60n) {
  return (currentSeconds() + offsetSeconds).toString();
}

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

function assetSnapshot(overrides = {}) {
  return {
    assetId: "1",
    epoch: "2",
    registered: true,
    expiration: "1700000900",
    assetType: "2",
    strikePrice: "50000000",
    resolutionPrice: "0",
    isResolved: false,
    ledger: LEDGER,
    ...overrides,
  };
}

const LEVEL = {
  price: "50000000",
  size: "1000000",
  orderCount: 1,
  orders: [{ id: `0x${"11".repeat(32)}`, size: "1000000", price: "50000000" }],
};

function infoResponse(pathname) {
  if (pathname === "/api/health") return { status: "ok" };
  if (pathname === "/api/balance/" + MASTER) {
    return { account: MASTER, ts: 1700000000, balance: "1000000", pending: "0" };
  }
  if (pathname === "/api/position/" + MASTER + "/2/3") {
    return {
      account: MASTER,
      assetId: "2",
      epoch: "3",
      ts: 1700000000,
      size: "1000000",
      margin: "1000000",
      balance: "1000000",
      pnl: "0",
      side: false,
      bSide: false,
      mSide: false,
      pSide: false,
    };
  }
  if (pathname === "/api/book/2/3") {
    return { assetId: "2", epoch: "3", ts: 1700000000, seqId: 1, bids: [LEVEL], asks: [] };
  }
  if (pathname === "/api/book/2/3/" + MASTER) {
    return {
      assetId: "2",
      epoch: "3",
      ts: 1700000000,
      seqId: 1,
      buys: [LEVEL.orders[0]],
      sells: [],
    };
  }
  if (pathname === "/api/book/market/top/2/3") {
    return {
      assetId: "2",
      epoch: "3",
      ts: 1700000000,
      seqId: 1,
      bid: LEVEL,
      ask: LEVEL,
      last: "50000000",
      lastTs: "1700000000",
    };
  }
  if (pathname === "/api/claim/2/3/" + MASTER) {
    return { account: MASTER, assetId: "2", epoch: "3", claimable: "1000000" };
  }
  if (pathname === "/api/resolve/mark/2") {
    return { assetId: "2", id: 2, ts: "1700000000", price: "50000000" };
  }
  if (pathname === "/api/resolve/settlement/2/3") {
    return {
      assetId: "2",
      epoch: "3",
      id: 2,
      ts: 1700000000,
      expirationTime: 1700000000,
      settlementPrice: "50000000",
    };
  }
  if (pathname === "/api/resolve/2/3" || pathname === "/api/resolve/last/epoch/2") {
    return { assetId: "2", epoch: "3", id: 2, ts: "1700000000", price: "50000000", isNull: false };
  }
  if (pathname === "/api/agents/status/" + MASTER) {
    return { agent: AGENT, nonce: AGENT_APPROVAL_NONCE, status: "active" };
  }
  return { ok: true };
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
    approvalNonce: AGENT_APPROVAL_NONCE,
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

function baseCancelReplaceInput(overrides = {}) {
  return {
    ...baseOrderInput(),
    nonce: "8",
    replacementNonce: "7",
    cancelOrderHash: ORDER_HASH,
    allOrNothing: false,
    ...overrides,
  };
}

function baseAgentCancelInput(overrides = {}) {
  return {
    ...baseCancelInput(),
    sender: MASTER,
    approvalNonce: AGENT_APPROVAL_NONCE,
    ...overrides,
  };
}

function baseAgentCancelReplaceInput(overrides = {}) {
  return {
    ...baseCancelReplaceInput(),
    sender: MASTER,
    approvalNonce: AGENT_APPROVAL_NONCE,
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
    approvalNonce: AGENT_APPROVAL_NONCE,
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

    if (new URL(call.url).pathname === "/api/asset/1") {
      return { data: assetSnapshot({ assetId: "1" }) };
    }

    if (new URL(call.url).pathname === "/api/asset/2/3") {
      return { data: assetSnapshot({ assetId: "2", epoch: "3" }) };
    }

    return { data: infoResponse(new URL(call.url).pathname) };
  });
  const client = createInfoClient({
    apiUrl: "http://localhost:3000/api",
    fetch: mock.fetch,
  });

  await client.getHealth();
  await client.getAsset("1");
  const historicalAsset = await client.getAssetAtEpoch({ assetId: "2", epoch: "3" });
  await client.getResolutionPrice({ assetId: "2", epoch: "3" });
  await client.getLastResolutionPrice("2");
  const balance = await client.getBalance(MASTER);
  await client.getOrderBook({ assetId: "2", epoch: "3" });
  await client.getBookOrders({ assetId: "2", epoch: "3", account: MASTER });
  await client.getTopOfBook({ assetId: "2", epoch: "3" });
  await client.getPosition({ account: MASTER, assetId: "2", epoch: "3" });
  await client.getClaimable({ account: MASTER, assetId: "2", epoch: "3" });
  await client.getMarkPrice("2");
  await client.getSettlementPrice({ assetId: "2", epoch: "3" });
  await client.getAgentApproval(MASTER);
  const config = await client.getExchangeConfig("31337");

  assert.deepEqual(config.data, exchangeConfig());
  assert.equal(historicalAsset.data.epoch, 3n);
  assert.equal(historicalAsset.data.resolutionPrice, 0n);
  assert.equal(balance.data.balance, 1000000n);
  assert.equal(balance.data.ts, 1700000000n);

  assert.deepEqual(
    mock.calls.map((call) => call.url),
    [
      "http://localhost:3000/api/health",
      "http://localhost:3000/api/asset/1",
      "http://localhost:3000/api/asset/2/3",
      "http://localhost:3000/api/resolve/2/3",
      "http://localhost:3000/api/resolve/last/epoch/2",
      `http://localhost:3000/api/balance/${MASTER}`,
      "http://localhost:3000/api/book/2/3",
      `http://localhost:3000/api/book/2/3/${MASTER}`,
      "http://localhost:3000/api/book/market/top/2/3",
      `http://localhost:3000/api/position/${MASTER}/2/3`,
      `http://localhost:3000/api/claim/2/3/${MASTER}`,
      "http://localhost:3000/api/resolve/mark/2",
      "http://localhost:3000/api/resolve/settlement/2/3",
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
    approvalNonce: futureApprovalNonce(),
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

test("ExchangeClient signs and posts regular and agent cancel-replace actions", async () => {
  const mock = createFetchMock((call) => {
    if (call.init.method === "GET") {
      return { data: { agent: AGENT, nonce: AGENT_APPROVAL_NONCE, status: "active" } };
    }
    return { data: { accepted: true } };
  });
  const regularClient = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    contracts: exchangeConfig().contracts,
    fetch: mock.fetch,
  });
  const agentClient = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: AGENT_WALLET,
    chainId: "31337",
    contracts: exchangeConfig().contracts,
    fetch: mock.fetch,
  });
  const domain = getExchangeDomain("31337", EXCHANGE);

  const regular = await regularClient.cancelReplaceOrder(
    baseCancelReplaceInput({ allOrNothing: true }),
  );
  const agent = await agentClient.cancelReplaceAgentOrder(
    baseAgentCancelReplaceInput({
      nonce: "10",
      replacementNonce: "9",
      approvalNonce: undefined,
    }),
  );

  assert.deepEqual(
    mock.calls.map((call) => [call.init.method, new URL(call.url).pathname]),
    [
      ["POST", "/cancel-replace"],
      ["GET", `/agents/status/${MASTER}`],
      ["POST", "/cancel-replace"],
    ],
  );

  assert.equal(regular.request.cancelReplace.signer, MASTER);
  assert.equal(regular.request.cancelReplace.sender, MASTER);
  assert.equal(regular.request.cancelReplace.signatureType, SignatureType.EOA.toString());
  assert.equal(regular.request.cancelReplace.cancelOrderHash, ORDER_HASH);
  assert.equal(regular.request.cancelReplace.allOrNothing, true);
  assert.equal(regular.request.replacement.nonce, "7");
  assert.equal(regular.request.cancelReplace.nonce, "8");
  assert.equal(regular.request.replacement.size, "1000000");
  assert.equal(regular.request.replacement.price, "500000");
  assert.equal(
    regular.request.replacementOrderHash,
    hashFillOrderJS(parseEip712Order(regular.request.replacement), domain),
  );
  assert.equal(
    regular.request.cancelReplace.replacementOrderHash,
    regular.request.replacementOrderHash,
  );
  assert.equal(
    regular.request.orderHash,
    hashCancelReplaceOrderJS(parseEip712CancelReplace(regular.request.cancelReplace), domain),
  );
  assert.ok(
    validateSignatureJS(
      regular.request.replacementOrderHash,
      regular.request.replacementSignature,
      MASTER,
    ),
  );
  assert.ok(validateSignatureJS(regular.request.orderHash, regular.request.signature, MASTER));

  assert.equal(agent.request.cancelReplace.signer, AGENT);
  assert.equal(agent.request.cancelReplace.sender, MASTER);
  assert.equal(agent.request.cancelReplace.signatureType, SignatureType.AGENT.toString());
  assert.equal(agent.request.cancelReplace.approvalNonce, AGENT_APPROVAL_NONCE);
  assert.equal(agent.request.replacement.approvalNonce, AGENT_APPROVAL_NONCE);
  assert.equal(agent.request.replacement.nonce, "9");
  assert.equal(agent.request.cancelReplace.nonce, "10");
  assert.equal(
    agent.request.replacementOrderHash,
    hashFillOrderJS(parseEip712Order(agent.request.replacement), domain),
  );
  assert.equal(
    agent.request.orderHash,
    hashCancelReplaceOrderJS(parseEip712CancelReplace(agent.request.cancelReplace), domain),
  );
  assert.ok(
    validateSignatureJS(
      agent.request.replacementOrderHash,
      agent.request.replacementSignature,
      AGENT,
    ),
  );
  assert.ok(validateSignatureJS(agent.request.orderHash, agent.request.signature, AGENT));
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
      return { data: { agent: AGENT, nonce: AGENT_APPROVAL_NONCE, status: "active" } };
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
  assert.equal(order.request.order.approvalNonce, AGENT_APPROVAL_NONCE);
  assert.ok(validateSignatureJS(order.request.orderHash, order.request.signature, AGENT));

  assert.equal(cancel.request.cancel.approvalNonce, AGENT_APPROVAL_NONCE);
  assert.ok(validateSignatureJS(cancel.request.orderHash, cancel.request.signature, AGENT));
  assert.equal(claim.request.claim.approvalNonce, AGENT_APPROVAL_NONCE);
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

test("InfoClient rejects malformed successful informational responses", async () => {
  const mock = createFetchMock(() => ({
    data: {
      account: MASTER,
      ts: "1700000000",
      balance: "not-an-integer",
      pending: "0",
    },
  }));
  const client = createInfoClient({
    apiUrl: "http://localhost:3000",
    fetch: mock.fetch,
  });

  await assert.rejects(
    () => client.getBalance(MASTER),
    (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.path, "$.balance");
      return true;
    },
  );
});

test("InfoClient aborts timed out and caller-cancelled requests", async () => {
  const pendingFetch = async (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal.reason));
    });

  const client = createInfoClient({
    apiUrl: "http://localhost:3000",
    fetch: pendingFetch,
  });

  await assert.rejects(
    () => client.getHealth({ timeoutMs: 5 }),
    (error) => error instanceof HttpTimeoutError && error.timeoutMs === 5,
  );

  const hangingBodyClient = createInfoClient({
    apiUrl: "http://localhost:3000",
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => new Promise(() => {}),
      text: async () => "",
    }),
  });
  await assert.rejects(
    () => hangingBodyClient.getHealth({ timeoutMs: 5 }),
    (error) => error instanceof HttpTimeoutError && error.timeoutMs === 5,
  );

  const controller = new AbortController();
  const cancelled = client.getHealth({ signal: controller.signal });
  controller.abort("cancelled by caller");

  await assert.rejects(
    () => cancelled,
    (error) => error instanceof HttpAbortError && error.cause === "cancelled by caller",
  );
});

test("ExchangeClient applies request timeout options to signed POST requests", async () => {
  const pendingFetch = async (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal.reason));
    });
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    fetch: pendingFetch,
  });

  await assert.rejects(
    () => client.placeOrder(baseOrderInput(), { timeoutMs: 5 }),
    (error) => error instanceof HttpTimeoutError && error.timeoutMs === 5,
  );
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
  await assert.rejects(
    () => client.withdraw({ amount: "1000000000.01" }),
    (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.code, "invalid_value");
      assert.equal(error.issues[0]?.path, "$.amount");
      return true;
    },
  );
  await assert.rejects(
    () => client.cancelReplaceOrder(baseCancelReplaceInput({ cancelOrderHash: ZeroHash })),
    (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.code, "invalid_value");
      assert.equal(error.issues[0]?.path, "$.cancelOrderHash");
      return true;
    },
  );
  assert.equal(mock.calls.length, 0);
});

test("ExchangeClient rejects agent action approvalNonce values at or below the minimum before posting", async () => {
  const mock = createFetchMock(() => ({ data: { accepted: true } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: AGENT_WALLET,
    chainId: "31337",
    fetch: mock.fetch,
  });

  for (const action of [
    () => client.placeAgentOrder(baseAgentOrderInput({ approvalNonce: MIN_AGENT_APPROVAL_NONCE })),
    () => client.cancelAgentOrder(baseAgentCancelInput({ approvalNonce: "0" })),
    () =>
      client.cancelReplaceAgentOrder(
        baseAgentCancelReplaceInput({ approvalNonce: MIN_AGENT_APPROVAL_NONCE }),
      ),
    () => client.claimAgent(baseAgentClaimInput({ approvalNonce: MIN_AGENT_APPROVAL_NONCE })),
  ]) {
    await assert.rejects(action, (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.code, "invalid_value");
      assert.equal(error.issues[0]?.path, "$.approvalNonce");
      return true;
    });
  }

  assert.equal(mock.calls.length, 0);
});

test("ExchangeClient rejects approveAgent approvalNonce values outside the allowed future window before posting", async () => {
  const originalDateNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    const mock = createFetchMock(() => ({ data: { accepted: true } }));
    const client = createExchangeClient({
      apiUrl: "http://localhost:3000",
      wallet: WALLET,
      chainId: "31337",
      fetch: mock.fetch,
    });

    const now = currentSeconds();
    for (const approvalNonce of [now + 10n, now + 300n, now + 301n, 42n]) {
      await assert.rejects(
        () =>
          client.approveAgent({
            agent: AGENT,
            approvalNonce: approvalNonce.toString(),
          }),
        (error) => {
          assert.ok(error instanceof ProtocolValidationError);
          assert.equal(error.issues[0]?.code, "invalid_value");
          assert.equal(error.issues[0]?.path, "$.approvalNonce");
          return true;
        },
      );
    }

    assert.equal(mock.calls.length, 0);
  } finally {
    Date.now = originalDateNow;
  }
});

test("ExchangeClient rejects approveAgent when agent is the master address before posting", async () => {
  const mock = createFetchMock(() => ({ data: { accepted: true } }));
  const client = createExchangeClient({
    apiUrl: "http://localhost:3000",
    wallet: WALLET,
    chainId: "31337",
    fetch: mock.fetch,
  });

  await assert.rejects(
    () =>
      client.approveAgent({
        agent: MASTER.toLowerCase(),
        approvalNonce: futureApprovalNonce(),
      }),
    (error) => {
      assert.ok(error instanceof ProtocolValidationError);
      assert.equal(error.issues[0]?.code, "invalid_value");
      assert.equal(error.issues[0]?.path, "$.agent");
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

test("HTTP clients normalize fetch transport failures", async () => {
  const cause = new Error("socket disconnected");
  const client = createInfoClient({
    apiUrl: "http://localhost:3000",
    fetch: async () => {
      throw cause;
    },
  });

  await assert.rejects(
    () => client.getHealth(),
    (error) => {
      assert.ok(error instanceof HttpTransportError);
      assert.equal(error.url, "http://localhost:3000/health");
      assert.equal(error.cause, cause);
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
