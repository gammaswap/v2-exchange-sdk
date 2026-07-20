import assert from "node:assert/strict";
import test from "node:test";
import * as builders from "@gammaswap/v2-exchange-sdk/builders";
import { getDefaultExchangeChainConfig } from "@gammaswap/v2-exchange-sdk/config";
import { OrderType, SignatureType } from "@gammaswap/v2-exchange-sdk/constants";
import { ProtocolValidationError } from "@gammaswap/v2-exchange-sdk/errors";
import * as schemas from "@gammaswap/v2-exchange-sdk/schemas";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const SENDER = "0x0000000000000000000000000000000000000002";
const AGENT = "0x0000000000000000000000000000000000000003";
const TOKEN = "0x0000000000000000000000000000000000000004";
const LEDGER = "0x0000000000000000000000000000000000000005";
const RECEIVER = "0x0000000000000000000000000000000000000006";
const EXCHANGE = "0x0000000000000000000000000000000000000007";
const DEPOSIT_LEDGER = "0x0000000000000000000000000000000000000008";
const PERMIT2 = "0x0000000000000000000000000000000000000009";
const ORDER_HASH = `0x${"11".repeat(32)}`;
const SIGNATURE = `0x${"22".repeat(65)}`;
const PERMIT_SIGNATURE = `0x${"33".repeat(65)}`;
const APPROVAL_SIGNATURE = `0x${"44".repeat(65)}`;

const auth = {
  nonce: "1",
  signer: ACCOUNT,
  signatureType: SignatureType.EOA.toString(),
  sender: SENDER,
};

const orderJson = {
  typ: OrderType.FILL.toString(),
  ...auth,
  epoch: "2",
  side: false,
  assetId: "123456789012345678901234567890",
  size: "1000000",
  price: "500000",
  timeInForce: "1",
  approvalNonce: "7",
};

const cancelJson = {
  typ: OrderType.CANCEL.toString(),
  ...auth,
  assetId: "123456789012345678901234567890",
  epoch: "2",
  orderHash: ORDER_HASH,
  approvalNonce: "7",
};

const claimJson = {
  typ: OrderType.CLAIM.toString(),
  ...auth,
  assetId: "123456789012345678901234567890",
  epoch: "2",
  approvalNonce: "7",
};

const depositJson = {
  typ: OrderType.DEPOSIT.toString(),
  ...auth,
  amount: "1000000",
  token: TOKEN,
  ledger: LEDGER,
  permitNonce: "8",
  permitSignature: PERMIT_SIGNATURE,
};

const withdrawalJson = {
  typ: OrderType.WITHDRAWAL.toString(),
  ...auth,
  receiver: RECEIVER,
  amount: "1000000",
  ledger: LEDGER,
};

const approveAgentJson = {
  typ: OrderType.AGENT_APPROVE.toString(),
  ...auth,
  agent: AGENT,
  approvalNonce: "7",
  approvalSignature: APPROVAL_SIGNATURE,
};

const revokeAgentJson = {
  typ: OrderType.AGENT_REVOKE.toString(),
  ...auth,
};

const resolutionJson = {
  typ: OrderType.RESOLUTION.toString(),
  ...auth,
  assetId: "123456789012345678901234567890",
  epoch: "2",
  price: "500000",
};

const pauseJson = {
  typ: OrderType.PAUSE.toString(),
  ...auth,
  isPause: true,
};

const invalidateJson = {
  typ: OrderType.INVALIDATE.toString(),
  ...auth,
  id: "9",
};

const onchainDepositJson = {
  typ: OrderType.ONCHAIN_DEPOSIT.toString(),
  id: "10",
  arrivalTime: "1700000000",
  owner: ACCOUNT,
  amount: "1000000",
  index: "11",
  ledger: LEDGER,
};

const agentApprovalJson = {
  master: ACCOUNT,
  agent: AGENT,
  approvalNonce: "7",
  approvalSignature: "0x",
};

const exchangeConfigJson = {
  chainId: "31337",
  contracts: {
    exchange: EXCHANGE,
    ledger: LEDGER,
    depositLedger: DEPOSIT_LEDGER,
    settlementToken: TOKEN,
    permit2: PERMIT2,
  },
};

const actionCases = [
  {
    name: "fill order",
    json: orderJson,
    parse: schemas.parseEip712Order,
    toJson: schemas.toJsonEip712Order,
    build: builders.buildOrder,
    buildJson: builders.buildOrderJson,
    typ: OrderType.FILL,
  },
  {
    name: "cancel",
    json: cancelJson,
    parse: schemas.parseEip712Cancel,
    toJson: schemas.toJsonEip712Cancel,
    build: builders.buildCancel,
    buildJson: builders.buildCancelJson,
    typ: OrderType.CANCEL,
  },
  {
    name: "claim",
    json: claimJson,
    parse: schemas.parseEip712Claim,
    toJson: schemas.toJsonEip712Claim,
    build: builders.buildClaim,
    buildJson: builders.buildClaimJson,
    typ: OrderType.CLAIM,
  },
  {
    name: "deposit",
    json: depositJson,
    parse: schemas.parseEip712Deposit,
    toJson: schemas.toJsonEip712Deposit,
    build: builders.buildDeposit,
    buildJson: builders.buildDepositJson,
    typ: OrderType.DEPOSIT,
  },
  {
    name: "withdrawal",
    json: withdrawalJson,
    parse: schemas.parseEip712Withdrawal,
    toJson: schemas.toJsonEip712Withdrawal,
    build: builders.buildWithdrawal,
    buildJson: builders.buildWithdrawalJson,
    typ: OrderType.WITHDRAWAL,
  },
  {
    name: "approve agent",
    json: approveAgentJson,
    parse: schemas.parseEip712ApproveAgent,
    toJson: schemas.toJsonEip712ApproveAgent,
    build: builders.buildApproveAgent,
    buildJson: builders.buildApproveAgentJson,
    typ: OrderType.AGENT_APPROVE,
  },
  {
    name: "revoke agent",
    json: revokeAgentJson,
    parse: schemas.parseEip712RevokeAgent,
    toJson: schemas.toJsonEip712RevokeAgent,
    build: builders.buildRevokeAgent,
    buildJson: builders.buildRevokeAgentJson,
    typ: OrderType.AGENT_REVOKE,
  },
  {
    name: "resolution",
    json: resolutionJson,
    parse: schemas.parseEip712Resolution,
    toJson: schemas.toJsonEip712Resolution,
    build: builders.buildResolution,
    buildJson: builders.buildResolutionJson,
    typ: OrderType.RESOLUTION,
  },
  {
    name: "pause",
    json: pauseJson,
    parse: schemas.parseEip712Pause,
    toJson: schemas.toJsonEip712Pause,
    build: builders.buildPause,
    buildJson: builders.buildPauseJson,
    typ: OrderType.PAUSE,
  },
  {
    name: "invalidate",
    json: invalidateJson,
    parse: schemas.parseEip712Invalidate,
    toJson: schemas.toJsonEip712Invalidate,
    build: builders.buildInvalidate,
    buildJson: builders.buildInvalidateJson,
    typ: OrderType.INVALIDATE,
  },
  {
    name: "on-chain deposit",
    json: onchainDepositJson,
    parse: schemas.parseEip712OnchainDeposit,
    toJson: schemas.toJsonEip712OnchainDeposit,
    build: builders.buildOnchainDeposit,
    buildJson: builders.buildOnchainDepositJson,
    typ: OrderType.ONCHAIN_DEPOSIT,
  },
];

const signedMessageCases = [
  {
    name: "fill order",
    bodyKey: "order",
    action: orderJson,
    build: builders.buildSignedOrderMessage,
    buildJson: builders.buildSignedOrderMessageJson,
  },
  {
    name: "cancel",
    bodyKey: "cancel",
    action: cancelJson,
    build: builders.buildSignedCancelMessage,
    buildJson: builders.buildSignedCancelMessageJson,
  },
  {
    name: "claim",
    bodyKey: "claim",
    action: claimJson,
    build: builders.buildSignedClaimMessage,
    buildJson: builders.buildSignedClaimMessageJson,
  },
  {
    name: "deposit",
    bodyKey: "deposit",
    action: depositJson,
    build: builders.buildSignedDepositMessage,
    buildJson: builders.buildSignedDepositMessageJson,
  },
  {
    name: "withdrawal",
    bodyKey: "withdrawal",
    action: withdrawalJson,
    build: builders.buildSignedWithdrawalMessage,
    buildJson: builders.buildSignedWithdrawalMessageJson,
  },
  {
    name: "approve agent",
    bodyKey: "approval",
    action: approveAgentJson,
    build: builders.buildSignedApproveAgentMessage,
    buildJson: builders.buildSignedApproveAgentMessageJson,
  },
  {
    name: "revoke agent",
    bodyKey: "revocation",
    action: revokeAgentJson,
    build: builders.buildSignedRevokeAgentMessage,
    buildJson: builders.buildSignedRevokeAgentMessageJson,
  },
  {
    name: "resolution",
    bodyKey: "resolution",
    action: resolutionJson,
    build: builders.buildSignedResolutionMessage,
    buildJson: builders.buildSignedResolutionMessageJson,
  },
  {
    name: "pause",
    bodyKey: "pause",
    action: pauseJson,
    build: builders.buildSignedPauseMessage,
    buildJson: builders.buildSignedPauseMessageJson,
  },
  {
    name: "invalidate",
    bodyKey: "invalidate",
    action: invalidateJson,
    build: builders.buildSignedInvalidateMessage,
    buildJson: builders.buildSignedInvalidateMessageJson,
  },
];

function withoutTyp(value) {
  const { typ: _typ, ...rest } = value;
  return rest;
}

function assertProtocolError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProtocolValidationError);
    assert.equal(error.issues[0]?.code, code);
    return true;
  });
}

test("all action schemas parse bigint internally and serialize decimal JSON", () => {
  for (const actionCase of actionCases) {
    const parsed = actionCase.parse(actionCase.json);

    assert.equal(parsed.typ, actionCase.typ, actionCase.name);
    if ("nonce" in parsed) {
      assert.equal(typeof parsed.nonce, "bigint");
    }
    assert.deepEqual(actionCase.toJson(parsed), actionCase.json, actionCase.name);
    assert.deepEqual(schemas.toJsonEip712Action(parsed), actionCase.json, actionCase.name);
    assert.deepEqual(schemas.parseEip712Action(actionCase.json), parsed, actionCase.name);
  }
});

test("agent approval schema parses and serializes its canonical shape", () => {
  const parsed = schemas.parseEip712AgentApproval(agentApprovalJson);

  assert.equal(parsed.approvalNonce, 7n);
  assert.deepEqual(schemas.toJsonEip712AgentApproval(parsed), agentApprovalJson);
  assert.deepEqual(builders.buildAgentApprovalJson(agentApprovalJson), agentApprovalJson);
});

test("exchange chain config schema parses and serializes configured addresses", () => {
  const parsed = schemas.parseExchangeChainConfig(exchangeConfigJson);

  assert.equal(parsed.chainId, 31337n);
  assert.equal(parsed.contracts.exchange, EXCHANGE);
  assert.equal(parsed.contracts.ledger, LEDGER);
  assert.equal(parsed.contracts.depositLedger, DEPOSIT_LEDGER);
  assert.equal(parsed.contracts.settlementToken, TOKEN);
  assert.equal(parsed.contracts.permit2, PERMIT2);
  assert.deepEqual(schemas.toJsonExchangeChainConfig(parsed), exchangeConfigJson);
});

test("default exchange chain config returns cloned hard-coded localhost contracts", () => {
  const first = getDefaultExchangeChainConfig("31337");
  const second = getDefaultExchangeChainConfig(31337n);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.chainId, 31337n);
  assert.equal(first.contracts.exchange, "0x749d20D85555330d20862770b58a72939285c42a");
  assert.equal(first.contracts.depositLedger, "0xCF9C83be89ac927F9D98F0CaFB9ED7fDea2fD459");
  assert.notEqual(first, second);
  assert.notEqual(first.contracts, second.contracts);
});

test("builders set canonical action type and accept bigint or decimal string inputs", () => {
  for (const actionCase of actionCases) {
    const built = actionCase.build({ ...withoutTyp(actionCase.json), typ: "999" });

    assert.equal(built.typ, actionCase.typ, actionCase.name);
    assert.deepEqual(actionCase.buildJson(withoutTyp(actionCase.json)), actionCase.json);
  }
});

test("signed message builders validate wrappers and serialize decimal JSON", () => {
  for (const messageCase of signedMessageCases) {
    const input = {
      [messageCase.bodyKey]: messageCase.action,
      chainId: "31337",
      orderHash: ORDER_HASH,
      signature: SIGNATURE,
    };

    const message = messageCase.build(input);
    const json = messageCase.buildJson(input);

    assert.equal(message.chainId, 31337n, messageCase.name);
    assert.equal(json.chainId, "31337", messageCase.name);
    assert.deepEqual(json[messageCase.bodyKey], messageCase.action, messageCase.name);
  }
});

test("canonical JSON serialization is deterministic", () => {
  const order = schemas.parseEip712Order(orderJson);

  assert.equal(
    schemas.stringifyProtocolJson(schemas.toJsonEip712Order(order)),
    `{"typ":"2","nonce":"1","signer":"${ACCOUNT}","signatureType":"0","sender":"${SENDER}","epoch":"2","side":false,"assetId":"123456789012345678901234567890","size":"1000000","price":"500000","timeInForce":"1","approvalNonce":"7"}`,
  );
});

test("schemas reject JavaScript numbers for protocol integers", () => {
  assertProtocolError(() => schemas.parseEip712Order({ ...orderJson, nonce: 1 }), "invalid_type");
});

test("schemas reject non-canonical decimal strings", () => {
  assertProtocolError(
    () => schemas.parseEip712Order({ ...orderJson, nonce: "01" }),
    "invalid_decimal_string",
  );
});

test("schemas reject missing and unknown fields", () => {
  const { price: _price, ...missingPrice } = orderJson;

  assertProtocolError(() => schemas.parseEip712Order(missingPrice), "missing_field");
  assertProtocolError(
    () => schemas.parseEip712Order({ ...orderJson, clientOnly: "ignored" }),
    "unknown_field",
  );
});

test("schemas reject wrong action type and unknown signature type", () => {
  assertProtocolError(
    () => schemas.parseEip712Order({ ...orderJson, typ: OrderType.CANCEL.toString() }),
    "invalid_value",
  );
  assertProtocolError(
    () => schemas.parseEip712Order({ ...orderJson, signatureType: "9" }),
    "invalid_value",
  );
});

test("schemas enforce signed integer widths and fixed bytes fields", () => {
  assertProtocolError(
    () => schemas.parseEip712Order({ ...orderJson, price: (2n ** 24n).toString() }),
    "integer_out_of_range",
  );
  assertProtocolError(
    () => schemas.parseEip712Cancel({ ...cancelJson, orderHash: "0x1234" }),
    "invalid_value",
  );
});

test("schemas reject invalid addresses and malformed signatures", () => {
  assertProtocolError(
    () => schemas.parseEip712Deposit({ ...depositJson, token: "not-an-address" }),
    "invalid_value",
  );
  assertProtocolError(
    () => schemas.parseEip712Deposit({ ...depositJson, permitSignature: "0xabc" }),
    "invalid_value",
  );
});

test("signed message schemas reject incomplete wrappers", () => {
  const input = {
    order: orderJson,
    chainId: "31337",
    orderHash: ORDER_HASH,
  };

  assertProtocolError(() => schemas.parseSignedOrderMessage(input), "missing_field");
});

test("unsigned request schemas parse examples from the request surface", () => {
  assert.deepEqual(schemas.getAssetRequestSchema.parse({ assetId: "1" }), { assetId: 1n });
  assert.deepEqual(schemas.getBalanceRequestSchema.parse({ account: ACCOUNT }), {
    account: ACCOUNT,
  });
  assert.deepEqual(schemas.getOrderBookRequestSchema.parse({ assetId: "1", epoch: "2" }), {
    assetId: 1n,
    epoch: 2n,
  });
  assert.deepEqual(
    schemas.getBookOrdersRequestSchema.parse({ assetId: "1", epoch: "2", account: ACCOUNT }),
    { assetId: 1n, epoch: 2n, account: ACCOUNT },
  );
  assert.deepEqual(schemas.getTopOfBookRequestSchema.parse({ assetId: "1", epoch: "2" }), {
    assetId: 1n,
    epoch: 2n,
  });
  assert.deepEqual(
    schemas.getPositionRequestSchema.parse({ account: ACCOUNT, assetId: "1", epoch: "2" }),
    { account: ACCOUNT, assetId: 1n, epoch: 2n },
  );
  assert.deepEqual(schemas.getAgentApprovalRequestSchema.parse({ account: ACCOUNT }), {
    account: ACCOUNT,
  });
  assert.deepEqual(schemas.getExchangeConfigRequestSchema.parse({ chainId: "31337" }), {
    chainId: 31337n,
  });
});
