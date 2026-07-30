import { isAddress } from "ethers";
import { OrderType, SignatureType, TimeInForce } from "./constants.js";
import { createProtocolValidationError } from "./errors.js";
import {
  UINT8_MAX,
  UINT24_MAX,
  UINT32_MAX,
  UINT64_MAX,
  UINT128_MAX,
  UINT256_MAX,
  parseSafeJsonUnsignedInteger,
  parseUnsignedInteger,
} from "./integer-inputs.js";
import type {
  Eip712AgentApproval,
  Eip712ApproveAgent,
  Eip712Cancel,
  Eip712CancelReplace,
  Eip712Claim,
  Eip712Deposit,
  Eip712Invalidate,
  Eip712OnchainDeposit,
  Eip712Order,
  Eip712Pause,
  Eip712Resolution,
  Eip712RevokeAgent,
  Eip712Withdrawal,
  ExchangeChainConfig,
  ExchangeContracts,
  GetAgentApprovalRequest,
  GetAssetRequest,
  GetBalanceRequest,
  GetBookOrdersRequest,
  GetExchangeConfigRequest,
  GetOrderBookRequest,
  GetPositionRequest,
  GetTopOfBookRequest,
  OraclePriceUpdate,
  OracleWebSocketControlMessage,
  OracleWebSocketMessage,
  OrderEvent,
  ProtocolJson,
  ResolutionEvent,
  SignedApproveAgentMessage,
  SignedCancelMessage,
  SignedCancelReplaceMessage,
  SignedClaimMessage,
  SignedDepositMessage,
  SignedInvalidateMessage,
  SignedOrderMessage,
  SignedPauseMessage,
  SignedResolutionMessage,
  SignedRevokeAgentMessage,
  SignedWithdrawalMessage,
  TradeEvent,
  WebSocketControlMessage,
  WebSocketMarketUpdate,
  WebSocketMessage,
  CancelEvent,
} from "./types.js";

export interface ProtocolSchema<T extends object> {
  parse(input: unknown): T;
  serialize(value: T): ProtocolJson<T>;
}

interface InternalProtocolSchema<T extends object> extends ProtocolSchema<T> {
  parseAt(input: unknown, path: string): T;
}

interface FieldSpec<T> {
  parse(input: unknown, path: string): T;
  serialize(value: T): unknown;
}

type FieldSpecs<T extends object> = {
  [K in keyof T]: FieldSpec<T[K]>;
};

export type Eip712Action =
  | Eip712Order
  | Eip712Cancel
  | Eip712CancelReplace
  | Eip712Claim
  | Eip712Deposit
  | Eip712Withdrawal
  | Eip712ApproveAgent
  | Eip712RevokeAgent
  | Eip712Resolution
  | Eip712Pause
  | Eip712Invalidate
  | Eip712OnchainDeposit;

export type Eip712ActionJson =
  | ProtocolJson<Eip712Order>
  | ProtocolJson<Eip712Cancel>
  | ProtocolJson<Eip712CancelReplace>
  | ProtocolJson<Eip712Claim>
  | ProtocolJson<Eip712Deposit>
  | ProtocolJson<Eip712Withdrawal>
  | ProtocolJson<Eip712ApproveAgent>
  | ProtocolJson<Eip712RevokeAgent>
  | ProtocolJson<Eip712Resolution>
  | ProtocolJson<Eip712Pause>
  | ProtocolJson<Eip712Invalidate>
  | ProtocolJson<Eip712OnchainDeposit>;

const HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const signatureTypeValues = new Set<bigint>(Object.values(SignatureType));

function objectSchema<T extends object>(fields: FieldSpecs<T>): InternalProtocolSchema<T> {
  const parseAt = (input: unknown, path: string): T => {
    const record = parseObject(input, path);
    const allowedKeys = new Set(Object.keys(fields));

    for (const key of Object.keys(record)) {
      if (!allowedKeys.has(key)) {
        throw createProtocolValidationError(
          "unknown_field",
          `${path}.${key}`,
          "field is not part of this schema",
        );
      }
    }

    const result = {} as T;
    for (const key of Object.keys(fields) as Array<keyof T>) {
      const fieldPath = `${path}.${String(key)}`;
      if (!Object.hasOwn(record, String(key))) {
        throw createProtocolValidationError("missing_field", fieldPath, "field is required");
      }

      result[key] = fields[key].parse(record[String(key)], fieldPath);
    }

    return result;
  };

  const serialize = (value: T): ProtocolJson<T> => {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(fields) as Array<keyof T>) {
      output[String(key)] = fields[key].serialize(value[key]);
    }

    return output as ProtocolJson<T>;
  };

  return {
    parse(input: unknown): T {
      return parseAt(input, "$");
    },
    parseAt,
    serialize,
  };
}

function parseObject(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw createProtocolValidationError("invalid_type", path, "expected an object");
  }

  return input as Record<string, unknown>;
}

function parseAddress(input: unknown, path: string): string {
  if (typeof input !== "string" || !isAddress(input)) {
    throw createProtocolValidationError("invalid_value", path, "expected an EVM address");
  }

  return input;
}

function parseBoolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw createProtocolValidationError("invalid_type", path, "expected a boolean");
  }

  return input;
}

function parseHexData(input: unknown, path: string): string {
  if (typeof input !== "string" || !HEX_DATA_PATTERN.test(input)) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      "expected 0x-prefixed hex data with an even byte length",
    );
  }

  return input;
}

function parseBytes32(input: unknown, path: string): string {
  if (typeof input !== "string" || !BYTES32_PATTERN.test(input)) {
    throw createProtocolValidationError("invalid_value", path, "expected a 32-byte hex string");
  }

  return input;
}

function parseString(input: unknown, path: string): string {
  if (typeof input !== "string") {
    throw createProtocolValidationError("invalid_type", path, "expected a string");
  }

  return input;
}

function getRequiredField(record: Record<string, unknown>, key: string, path: string): unknown {
  if (!Object.hasOwn(record, key)) {
    throw createProtocolValidationError("missing_field", `${path}.${key}`, "field is required");
  }

  return record[key];
}

function parseWebSocketSeqId(input: unknown, path: string): bigint {
  return parseSafeJsonUnsignedInteger(
    input,
    path,
    UINT64_MAX,
    "expected a safe unsigned integer sequence id",
  );
}

function parseExpectedInteger(
  input: unknown,
  path: string,
  expected: bigint,
  max: bigint = UINT8_MAX,
): bigint {
  const value = parseUnsignedInteger(input, path, max);
  if (value !== expected) {
    throw createProtocolValidationError("invalid_value", path, `expected ${expected.toString()}`);
  }

  return value;
}

function parseSignatureType(input: unknown, path: string): bigint {
  const value = parseUnsignedInteger(input, path, UINT8_MAX);
  if (!signatureTypeValues.has(value)) {
    throw createProtocolValidationError("invalid_value", path, "unknown signature type");
  }

  return value;
}

function uint(max: bigint): FieldSpec<bigint> {
  return {
    parse: (input, path) => parseUnsignedInteger(input, path, max),
    serialize: (value) => value.toString(),
  };
}

function exactUint(expected: bigint, max: bigint = UINT8_MAX): FieldSpec<bigint> {
  return {
    parse: (input, path) => parseExpectedInteger(input, path, expected, max),
    serialize: (value) => value.toString(),
  };
}

const uint24 = uint(UINT24_MAX);
const uint32 = uint(UINT32_MAX);
const uint64 = uint(UINT64_MAX);
const uint128 = uint(UINT128_MAX);
const uint256 = uint(UINT256_MAX);

const address: FieldSpec<string> = {
  parse: parseAddress,
  serialize: (value) => value,
};

const bytes32: FieldSpec<string> = {
  parse: parseBytes32,
  serialize: (value) => value,
};

const hexData: FieldSpec<string> = {
  parse: parseHexData,
  serialize: (value) => value,
};

const boolean: FieldSpec<boolean> = {
  parse: parseBoolean,
  serialize: (value) => value,
};

const signatureType: FieldSpec<bigint> = {
  parse: parseSignatureType,
  serialize: (value) => value.toString(),
};

function nested<T extends object>(schema: InternalProtocolSchema<T>): FieldSpec<T> {
  return {
    parse: (input, path) => schema.parseAt(input, path),
    serialize: (value) => schema.serialize(value),
  };
}

const timeInForceValues = new Set<bigint>(Object.values(TimeInForce));

function parseTimeInForce(input: unknown, path: string): bigint {
  const value = parseUnsignedInteger(input, path, UINT8_MAX);

  if (!timeInForceValues.has(value)) {
    throw createProtocolValidationError("invalid_value", path, "unknown timeInForce");
  }

  return value;
}

const timeInForce: FieldSpec<bigint> = {
  parse: parseTimeInForce,
  serialize: (value) => value.toString(),
};

export const eip712OrderSchema = objectSchema<Eip712Order>({
  typ: exactUint(OrderType.FILL),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  epoch: uint32,
  side: boolean,
  assetId: uint256,
  size: uint64,
  price: uint24,
  timeInForce,
  approvalNonce: uint32,
});

export const eip712CancelSchema = objectSchema<Eip712Cancel>({
  typ: exactUint(OrderType.CANCEL),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  assetId: uint256,
  epoch: uint32,
  orderHash: bytes32,
  approvalNonce: uint32,
});

export const eip712CancelReplaceSchema = objectSchema<Eip712CancelReplace>({
  typ: exactUint(OrderType.CANCEL_REPLACE),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  assetId: uint256,
  epoch: uint32,
  cancelOrderHash: bytes32,
  replacementOrderHash: bytes32,
  approvalNonce: uint32,
  allOrNothing: boolean,
});

export const eip712ClaimSchema = objectSchema<Eip712Claim>({
  typ: exactUint(OrderType.CLAIM),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  assetId: uint256,
  epoch: uint32,
  approvalNonce: uint32,
});

export const eip712DepositSchema = objectSchema<Eip712Deposit>({
  typ: exactUint(OrderType.DEPOSIT),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  amount: uint64,
  token: address,
  ledger: address,
  permitNonce: uint32,
  permitSignature: hexData,
});

export const eip712WithdrawalSchema = objectSchema<Eip712Withdrawal>({
  typ: exactUint(OrderType.WITHDRAWAL),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  receiver: address,
  amount: uint64,
  ledger: address,
});

export const eip712ApproveAgentSchema = objectSchema<Eip712ApproveAgent>({
  typ: exactUint(OrderType.AGENT_APPROVE),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  agent: address,
  approvalNonce: uint32,
  approvalSignature: hexData,
});

export const eip712RevokeAgentSchema = objectSchema<Eip712RevokeAgent>({
  typ: exactUint(OrderType.AGENT_REVOKE),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
});

export const eip712ResolutionSchema = objectSchema<Eip712Resolution>({
  typ: exactUint(OrderType.RESOLUTION),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  assetId: uint256,
  epoch: uint32,
  price: uint64,
});

export const eip712PauseSchema = objectSchema<Eip712Pause>({
  typ: exactUint(OrderType.PAUSE),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  isPause: boolean,
});

export const eip712InvalidateSchema = objectSchema<Eip712Invalidate>({
  typ: exactUint(OrderType.INVALIDATE),
  nonce: uint64,
  signer: address,
  signatureType,
  sender: address,
  id: uint128,
});

export const eip712OnchainDepositSchema = objectSchema<Eip712OnchainDeposit>({
  typ: exactUint(OrderType.ONCHAIN_DEPOSIT),
  id: uint128,
  arrivalTime: uint64,
  owner: address,
  amount: uint64,
  index: uint128,
  ledger: address,
});

export const eip712AgentApprovalSchema = objectSchema<Eip712AgentApproval>({
  master: address,
  agent: address,
  approvalNonce: uint32,
  approvalSignature: hexData,
});

const exchangeContractKeys = new Set([
  "exchange",
  "ledger",
  "depositLedger",
  "settlementToken",
  "permit2",
]);

function parseExchangeContractsAt(input: unknown, path: string): ExchangeContracts {
  const record = parseObject(input, path);

  for (const key of Object.keys(record)) {
    if (!exchangeContractKeys.has(key)) {
      throw createProtocolValidationError(
        "unknown_field",
        `${path}.${key}`,
        "field is not part of this schema",
      );
    }
  }

  if (!Object.hasOwn(record, "exchange")) {
    throw createProtocolValidationError("missing_field", `${path}.exchange`, "field is required");
  }
  if (!Object.hasOwn(record, "ledger")) {
    throw createProtocolValidationError("missing_field", `${path}.ledger`, "field is required");
  }

  const result: ExchangeContracts = {
    exchange: address.parse(record.exchange, `${path}.exchange`),
    ledger: address.parse(record.ledger, `${path}.ledger`),
  };

  if (Object.hasOwn(record, "depositLedger")) {
    result.depositLedger = address.parse(record.depositLedger, `${path}.depositLedger`);
  }
  if (Object.hasOwn(record, "settlementToken")) {
    result.settlementToken = address.parse(record.settlementToken, `${path}.settlementToken`);
  }
  if (Object.hasOwn(record, "permit2")) {
    result.permit2 = address.parse(record.permit2, `${path}.permit2`);
  }

  return result;
}

export const exchangeContractsSchema: InternalProtocolSchema<ExchangeContracts> = {
  parse(input: unknown): ExchangeContracts {
    return parseExchangeContractsAt(input, "$");
  },
  parseAt(input: unknown, path: string): ExchangeContracts {
    return parseExchangeContractsAt(input, path);
  },
  serialize(value: ExchangeContracts): ProtocolJson<ExchangeContracts> {
    const output: Record<string, unknown> = {
      exchange: value.exchange,
      ledger: value.ledger,
    };

    if (value.depositLedger !== undefined) {
      output.depositLedger = value.depositLedger;
    }
    if (value.settlementToken !== undefined) {
      output.settlementToken = value.settlementToken;
    }
    if (value.permit2 !== undefined) {
      output.permit2 = value.permit2;
    }

    return output as ProtocolJson<ExchangeContracts>;
  },
};

export const exchangeChainConfigSchema = objectSchema<ExchangeChainConfig>({
  chainId: uint256,
  contracts: nested(exchangeContractsSchema),
});

export const signedOrderMessageSchema = objectSchema<SignedOrderMessage>({
  order: nested(eip712OrderSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedCancelMessageSchema = objectSchema<SignedCancelMessage>({
  cancel: nested(eip712CancelSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedCancelReplaceMessageSchema = objectSchema<SignedCancelReplaceMessage>({
  cancelReplace: nested(eip712CancelReplaceSchema),
  replacement: nested(eip712OrderSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
  replacementOrderHash: bytes32,
  replacementSignature: hexData,
});

export const signedClaimMessageSchema = objectSchema<SignedClaimMessage>({
  claim: nested(eip712ClaimSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedDepositMessageSchema = objectSchema<SignedDepositMessage>({
  deposit: nested(eip712DepositSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedWithdrawalMessageSchema = objectSchema<SignedWithdrawalMessage>({
  withdrawal: nested(eip712WithdrawalSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedApproveAgentMessageSchema = objectSchema<SignedApproveAgentMessage>({
  approval: nested(eip712ApproveAgentSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedRevokeAgentMessageSchema = objectSchema<SignedRevokeAgentMessage>({
  revocation: nested(eip712RevokeAgentSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedResolutionMessageSchema = objectSchema<SignedResolutionMessage>({
  resolution: nested(eip712ResolutionSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedPauseMessageSchema = objectSchema<SignedPauseMessage>({
  pause: nested(eip712PauseSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const signedInvalidateMessageSchema = objectSchema<SignedInvalidateMessage>({
  invalidate: nested(eip712InvalidateSchema),
  chainId: uint256,
  orderHash: bytes32,
  signature: hexData,
});

export const getAssetRequestSchema = objectSchema<GetAssetRequest>({
  assetId: uint256,
});

export const getBalanceRequestSchema = objectSchema<GetBalanceRequest>({
  account: address,
});

export const getOrderBookRequestSchema = objectSchema<GetOrderBookRequest>({
  assetId: uint256,
  epoch: uint32,
});

export const getBookOrdersRequestSchema = objectSchema<GetBookOrdersRequest>({
  assetId: uint256,
  epoch: uint32,
  account: address,
});

export const getTopOfBookRequestSchema = objectSchema<GetTopOfBookRequest>({
  assetId: uint256,
  epoch: uint32,
});

export const getPositionRequestSchema = objectSchema<GetPositionRequest>({
  account: address,
  assetId: uint256,
  epoch: uint32,
});

export const getAgentApprovalRequestSchema = objectSchema<GetAgentApprovalRequest>({
  account: address,
});

export const getExchangeConfigRequestSchema = objectSchema<GetExchangeConfigRequest>({
  chainId: uint256,
});

export function parseWebSocketMessage(input: unknown): WebSocketMessage {
  const record = parseObject(input, "$");
  const type = parseString(getRequiredField(record, "type", "$"), "$.type");

  if (
    type === "connected" ||
    type === "subscribed" ||
    type === "unsubscribed" ||
    type === "error"
  ) {
    return parseWebSocketControlMessage(record, type);
  }

  if (type === "order" || type === "trade" || type === "cancel" || type === "resolution") {
    return parseWebSocketMarketUpdateRecord(record, type);
  }

  throw createProtocolValidationError("invalid_value", "$.type", "unknown websocket message type");
}

export function parseWebSocketMarketUpdate(input: unknown): WebSocketMarketUpdate {
  const message = parseWebSocketMessage(input);

  if (
    message.type !== "order" &&
    message.type !== "trade" &&
    message.type !== "cancel" &&
    message.type !== "resolution"
  ) {
    throw createProtocolValidationError("invalid_value", "$.type", "expected market update type");
  }

  return message;
}

export function parseOracleWebSocketMessage(input: unknown): OracleWebSocketMessage {
  const record = parseObject(input, "$");
  const type = parseString(getRequiredField(record, "type", "$"), "$.type");

  if (
    type === "connected" ||
    type === "subscribed" ||
    type === "unsubscribed" ||
    type === "error"
  ) {
    return parseOracleWebSocketControlMessage(record, type);
  }

  if (type === "price") {
    return parseOraclePriceUpdateRecord(record);
  }

  throw createProtocolValidationError(
    "invalid_value",
    "$.type",
    "unknown oracle websocket message type",
  );
}

export function parseOraclePriceUpdate(input: unknown): OraclePriceUpdate {
  const message = parseOracleWebSocketMessage(input);

  if (message.type !== "price") {
    throw createProtocolValidationError("invalid_value", "$.type", "expected oracle price update");
  }

  return message;
}

function parseWebSocketControlMessage(
  record: Record<string, unknown>,
  type: string,
): WebSocketControlMessage {
  if (type === "connected") {
    return {
      type,
      message: parseString(getRequiredField(record, "message", "$"), "$.message"),
    };
  }

  if (type === "subscribed" || type === "unsubscribed") {
    return {
      type,
      assetId: parseUnsignedInteger(
        getRequiredField(record, "assetId", "$"),
        "$.assetId",
        UINT256_MAX,
      ).toString(),
    };
  }

  return {
    type: "error",
    message: parseString(getRequiredField(record, "message", "$"), "$.message"),
  };
}

function parseWebSocketMarketUpdateRecord(
  record: Record<string, unknown>,
  type: "order" | "trade" | "cancel" | "resolution",
): WebSocketMarketUpdate {
  const seqId = parseWebSocketSeqId(getRequiredField(record, "seqId", "$"), "$.seqId");
  const dataInput = getRequiredField(record, "data", "$");

  if (type === "order") {
    const data = parseOrderEvent(dataInput, "$.data");
    return { type, seqId, assetId: data.assetId, epoch: data.epoch, data };
  }

  if (type === "trade") {
    const data = parseTradeEvent(dataInput, "$.data");
    return { type, seqId, assetId: data.assetId, epoch: data.epoch, data };
  }

  if (type === "cancel") {
    const data = parseCancelEvent(dataInput, "$.data");
    return { type, seqId, assetId: data.assetId, epoch: data.epoch, data };
  }

  const data = parseResolutionEvent(dataInput, "$.data");
  return { type, seqId, assetId: data.assetId, epoch: data.epoch, data };
}

function parseOracleWebSocketControlMessage(
  record: Record<string, unknown>,
  type: string,
): OracleWebSocketControlMessage {
  if (type === "connected") {
    return {
      type,
      message: parseString(getRequiredField(record, "message", "$"), "$.message"),
    };
  }

  if (type === "subscribed") {
    return {
      type: "subscribed",
      symbolId: parseUnsignedInteger(
        getRequiredField(record, "symbolId", "$"),
        "$.symbolId",
        UINT256_MAX,
      ).toString(),
    };
  }

  if (type === "unsubscribed") {
    const message = {
      type: "unsubscribed" as const,
      symbolId: parseUnsignedInteger(
        getRequiredField(record, "symbolId", "$"),
        "$.symbolId",
        UINT256_MAX,
      ).toString(),
    };
    const reason = record.reason;
    if (reason !== undefined) {
      return {
        ...message,
        reason: parseString(reason, "$.reason"),
      };
    }

    return message;
  }

  return {
    type: "error",
    message: parseString(getRequiredField(record, "message", "$"), "$.message"),
  };
}

function parseOraclePriceUpdateRecord(record: Record<string, unknown>): OraclePriceUpdate {
  return {
    type: "price",
    symbolId: parseUnsignedInteger(
      getRequiredField(record, "symbolId", "$"),
      "$.symbolId",
      UINT256_MAX,
    ),
    price: parseUnsignedInteger(getRequiredField(record, "price", "$"), "$.price", UINT256_MAX),
    ts: parseWebSocketSeqId(getRequiredField(record, "ts", "$"), "$.ts"),
  };
}

function parseOrderEvent(input: unknown, path: string): OrderEvent {
  const record = parseObject(input, path);

  return {
    orderId: parseBytes32(getRequiredField(record, "orderId", path), `${path}.orderId`),
    assetId: parseUnsignedInteger(
      getRequiredField(record, "assetId", path),
      `${path}.assetId`,
      UINT256_MAX,
    ),
    epoch: parseUnsignedInteger(
      getRequiredField(record, "epoch", path),
      `${path}.epoch`,
      UINT32_MAX,
    ),
    price: parseUnsignedInteger(
      getRequiredField(record, "price", path),
      `${path}.price`,
      UINT64_MAX,
    ),
    side: parseString(getRequiredField(record, "side", path), `${path}.side`),
    size: parseUnsignedInteger(getRequiredField(record, "size", path), `${path}.size`, UINT64_MAX),
    arrivalTime: parseUnsignedInteger(
      getRequiredField(record, "arrivalTime", path),
      `${path}.arrivalTime`,
      UINT64_MAX,
    ),
    tif: parseString(getRequiredField(record, "tif", path), `${path}.tif`),
    type: parseString(getRequiredField(record, "type", path), `${path}.type`),
  };
}

function parseTradeEvent(input: unknown, path: string): TradeEvent {
  const record = parseObject(input, path);

  return {
    orderId: parseBytes32(getRequiredField(record, "orderId", path), `${path}.orderId`),
    assetId: parseUnsignedInteger(
      getRequiredField(record, "assetId", path),
      `${path}.assetId`,
      UINT256_MAX,
    ),
    epoch: parseUnsignedInteger(
      getRequiredField(record, "epoch", path),
      `${path}.epoch`,
      UINT32_MAX,
    ),
    price: parseUnsignedInteger(
      getRequiredField(record, "price", path),
      `${path}.price`,
      UINT64_MAX,
    ),
    side: parseString(getRequiredField(record, "side", path), `${path}.side`),
    size: parseUnsignedInteger(getRequiredField(record, "size", path), `${path}.size`, UINT64_MAX),
    arrivalTime: parseUnsignedInteger(
      getRequiredField(record, "arrivalTime", path),
      `${path}.arrivalTime`,
      UINT64_MAX,
    ),
    fillPrice: parseUnsignedInteger(
      getRequiredField(record, "fillPrice", path),
      `${path}.fillPrice`,
      UINT64_MAX,
    ),
    fill: parseUnsignedInteger(getRequiredField(record, "fill", path), `${path}.fill`, UINT64_MAX),
    tif: parseString(getRequiredField(record, "tif", path), `${path}.tif`),
    type: parseString(getRequiredField(record, "type", path), `${path}.type`),
  };
}

function parseCancelEvent(input: unknown, path: string): CancelEvent {
  const record = parseObject(input, path);

  return {
    orderId: parseBytes32(getRequiredField(record, "orderId", path), `${path}.orderId`),
    cancelId: parseBytes32(getRequiredField(record, "cancelId", path), `${path}.cancelId`),
    assetId: parseUnsignedInteger(
      getRequiredField(record, "assetId", path),
      `${path}.assetId`,
      UINT256_MAX,
    ),
    epoch: parseUnsignedInteger(
      getRequiredField(record, "epoch", path),
      `${path}.epoch`,
      UINT32_MAX,
    ),
    arrivalTime: parseUnsignedInteger(
      getRequiredField(record, "arrivalTime", path),
      `${path}.arrivalTime`,
      UINT64_MAX,
    ),
  };
}

function parseResolutionEvent(input: unknown, path: string): ResolutionEvent {
  const record = parseObject(input, path);

  return {
    orderId: parseBytes32(getRequiredField(record, "orderId", path), `${path}.orderId`),
    assetId: parseUnsignedInteger(
      getRequiredField(record, "assetId", path),
      `${path}.assetId`,
      UINT256_MAX,
    ),
    epoch: parseUnsignedInteger(
      getRequiredField(record, "epoch", path),
      `${path}.epoch`,
      UINT32_MAX,
    ),
    price: parseUnsignedInteger(
      getRequiredField(record, "price", path),
      `${path}.price`,
      UINT64_MAX,
    ),
    arrivalTime: parseUnsignedInteger(
      getRequiredField(record, "arrivalTime", path),
      `${path}.arrivalTime`,
      UINT64_MAX,
    ),
  };
}

export function parseEip712Order(input: unknown): Eip712Order {
  return eip712OrderSchema.parse(input);
}

export function parseEip712Cancel(input: unknown): Eip712Cancel {
  return eip712CancelSchema.parse(input);
}

export function parseEip712CancelReplace(input: unknown): Eip712CancelReplace {
  return eip712CancelReplaceSchema.parse(input);
}

export function parseEip712Claim(input: unknown): Eip712Claim {
  return eip712ClaimSchema.parse(input);
}

export function parseEip712Deposit(input: unknown): Eip712Deposit {
  return eip712DepositSchema.parse(input);
}

export function parseEip712Withdrawal(input: unknown): Eip712Withdrawal {
  return eip712WithdrawalSchema.parse(input);
}

export function parseEip712ApproveAgent(input: unknown): Eip712ApproveAgent {
  return eip712ApproveAgentSchema.parse(input);
}

export function parseEip712RevokeAgent(input: unknown): Eip712RevokeAgent {
  return eip712RevokeAgentSchema.parse(input);
}

export function parseEip712Resolution(input: unknown): Eip712Resolution {
  return eip712ResolutionSchema.parse(input);
}

export function parseEip712Pause(input: unknown): Eip712Pause {
  return eip712PauseSchema.parse(input);
}

export function parseEip712Invalidate(input: unknown): Eip712Invalidate {
  return eip712InvalidateSchema.parse(input);
}

export function parseEip712OnchainDeposit(input: unknown): Eip712OnchainDeposit {
  return eip712OnchainDepositSchema.parse(input);
}

export function parseEip712AgentApproval(input: unknown): Eip712AgentApproval {
  return eip712AgentApprovalSchema.parse(input);
}

export function parseExchangeContracts(input: unknown): ExchangeContracts {
  return exchangeContractsSchema.parse(input);
}

export function parseExchangeChainConfig(input: unknown): ExchangeChainConfig {
  return exchangeChainConfigSchema.parse(input);
}

export function parseEip712Action(input: unknown): Eip712Action {
  const record = parseObject(input, "$");
  const typ = parseUnsignedInteger(record.typ, "$.typ", UINT8_MAX);

  if (typ === OrderType.DEPOSIT) return parseEip712Deposit(input);
  if (typ === OrderType.WITHDRAWAL) return parseEip712Withdrawal(input);
  if (typ === OrderType.FILL) return parseEip712Order(input);
  if (typ === OrderType.CANCEL) return parseEip712Cancel(input);
  if (typ === OrderType.CANCEL_REPLACE) return parseEip712CancelReplace(input);
  if (typ === OrderType.RESOLUTION) return parseEip712Resolution(input);
  if (typ === OrderType.CLAIM) return parseEip712Claim(input);
  if (typ === OrderType.PAUSE) return parseEip712Pause(input);
  if (typ === OrderType.ONCHAIN_DEPOSIT) return parseEip712OnchainDeposit(input);
  if (typ === OrderType.INVALIDATE) return parseEip712Invalidate(input);
  if (typ === OrderType.AGENT_APPROVE) return parseEip712ApproveAgent(input);
  if (typ === OrderType.AGENT_REVOKE) return parseEip712RevokeAgent(input);

  throw createProtocolValidationError("invalid_value", "$.typ", "unknown action type");
}

export function parseSignedOrderMessage(input: unknown): SignedOrderMessage {
  return signedOrderMessageSchema.parse(input);
}

export function parseSignedCancelMessage(input: unknown): SignedCancelMessage {
  return signedCancelMessageSchema.parse(input);
}

export function parseSignedCancelReplaceMessage(input: unknown): SignedCancelReplaceMessage {
  return signedCancelReplaceMessageSchema.parse(input);
}

export function parseSignedClaimMessage(input: unknown): SignedClaimMessage {
  return signedClaimMessageSchema.parse(input);
}

export function parseSignedDepositMessage(input: unknown): SignedDepositMessage {
  return signedDepositMessageSchema.parse(input);
}

export function parseSignedWithdrawalMessage(input: unknown): SignedWithdrawalMessage {
  return signedWithdrawalMessageSchema.parse(input);
}

export function parseSignedApproveAgentMessage(input: unknown): SignedApproveAgentMessage {
  return signedApproveAgentMessageSchema.parse(input);
}

export function parseSignedRevokeAgentMessage(input: unknown): SignedRevokeAgentMessage {
  return signedRevokeAgentMessageSchema.parse(input);
}

export function parseSignedResolutionMessage(input: unknown): SignedResolutionMessage {
  return signedResolutionMessageSchema.parse(input);
}

export function parseSignedPauseMessage(input: unknown): SignedPauseMessage {
  return signedPauseMessageSchema.parse(input);
}

export function parseSignedInvalidateMessage(input: unknown): SignedInvalidateMessage {
  return signedInvalidateMessageSchema.parse(input);
}

export function toJsonEip712Order(value: Eip712Order): ProtocolJson<Eip712Order> {
  return eip712OrderSchema.serialize(value);
}

export function toJsonEip712Cancel(value: Eip712Cancel): ProtocolJson<Eip712Cancel> {
  return eip712CancelSchema.serialize(value);
}

export function toJsonEip712CancelReplace(
  value: Eip712CancelReplace,
): ProtocolJson<Eip712CancelReplace> {
  return eip712CancelReplaceSchema.serialize(value);
}

export function toJsonEip712Claim(value: Eip712Claim): ProtocolJson<Eip712Claim> {
  return eip712ClaimSchema.serialize(value);
}

export function toJsonEip712Deposit(value: Eip712Deposit): ProtocolJson<Eip712Deposit> {
  return eip712DepositSchema.serialize(value);
}

export function toJsonEip712Withdrawal(value: Eip712Withdrawal): ProtocolJson<Eip712Withdrawal> {
  return eip712WithdrawalSchema.serialize(value);
}

export function toJsonEip712ApproveAgent(
  value: Eip712ApproveAgent,
): ProtocolJson<Eip712ApproveAgent> {
  return eip712ApproveAgentSchema.serialize(value);
}

export function toJsonEip712RevokeAgent(value: Eip712RevokeAgent): ProtocolJson<Eip712RevokeAgent> {
  return eip712RevokeAgentSchema.serialize(value);
}

export function toJsonEip712Resolution(value: Eip712Resolution): ProtocolJson<Eip712Resolution> {
  return eip712ResolutionSchema.serialize(value);
}

export function toJsonEip712Pause(value: Eip712Pause): ProtocolJson<Eip712Pause> {
  return eip712PauseSchema.serialize(value);
}

export function toJsonEip712Invalidate(value: Eip712Invalidate): ProtocolJson<Eip712Invalidate> {
  return eip712InvalidateSchema.serialize(value);
}

export function toJsonEip712OnchainDeposit(
  value: Eip712OnchainDeposit,
): ProtocolJson<Eip712OnchainDeposit> {
  return eip712OnchainDepositSchema.serialize(value);
}

export function toJsonEip712AgentApproval(
  value: Eip712AgentApproval,
): ProtocolJson<Eip712AgentApproval> {
  return eip712AgentApprovalSchema.serialize(value);
}

export function toJsonExchangeContracts(value: ExchangeContracts): ProtocolJson<ExchangeContracts> {
  return exchangeContractsSchema.serialize(value);
}

export function toJsonExchangeChainConfig(
  value: ExchangeChainConfig,
): ProtocolJson<ExchangeChainConfig> {
  return exchangeChainConfigSchema.serialize(value);
}

export function toJsonEip712Action(action: Eip712Action): Eip712ActionJson {
  if (action.typ === OrderType.DEPOSIT) return toJsonEip712Deposit(action as Eip712Deposit);
  if (action.typ === OrderType.WITHDRAWAL) {
    return toJsonEip712Withdrawal(action as Eip712Withdrawal);
  }
  if (action.typ === OrderType.FILL) return toJsonEip712Order(action as Eip712Order);
  if (action.typ === OrderType.CANCEL) return toJsonEip712Cancel(action as Eip712Cancel);
  if (action.typ === OrderType.CANCEL_REPLACE) {
    return toJsonEip712CancelReplace(action as Eip712CancelReplace);
  }
  if (action.typ === OrderType.RESOLUTION) {
    return toJsonEip712Resolution(action as Eip712Resolution);
  }
  if (action.typ === OrderType.CLAIM) return toJsonEip712Claim(action as Eip712Claim);
  if (action.typ === OrderType.PAUSE) return toJsonEip712Pause(action as Eip712Pause);
  if (action.typ === OrderType.ONCHAIN_DEPOSIT) {
    return toJsonEip712OnchainDeposit(action as Eip712OnchainDeposit);
  }
  if (action.typ === OrderType.INVALIDATE) {
    return toJsonEip712Invalidate(action as Eip712Invalidate);
  }
  if (action.typ === OrderType.AGENT_APPROVE) {
    return toJsonEip712ApproveAgent(action as Eip712ApproveAgent);
  }
  if (action.typ === OrderType.AGENT_REVOKE) {
    return toJsonEip712RevokeAgent(action as Eip712RevokeAgent);
  }

  throw createProtocolValidationError("invalid_value", "$.typ", "unknown action type");
}

export function toJsonSignedOrderMessage(
  value: SignedOrderMessage,
): ProtocolJson<SignedOrderMessage> {
  return signedOrderMessageSchema.serialize(value);
}

export function toJsonSignedCancelMessage(
  value: SignedCancelMessage,
): ProtocolJson<SignedCancelMessage> {
  return signedCancelMessageSchema.serialize(value);
}

export function toJsonSignedCancelReplaceMessage(
  value: SignedCancelReplaceMessage,
): ProtocolJson<SignedCancelReplaceMessage> {
  return signedCancelReplaceMessageSchema.serialize(value);
}

export function toJsonSignedClaimMessage(
  value: SignedClaimMessage,
): ProtocolJson<SignedClaimMessage> {
  return signedClaimMessageSchema.serialize(value);
}

export function toJsonSignedDepositMessage(
  value: SignedDepositMessage,
): ProtocolJson<SignedDepositMessage> {
  return signedDepositMessageSchema.serialize(value);
}

export function toJsonSignedWithdrawalMessage(
  value: SignedWithdrawalMessage,
): ProtocolJson<SignedWithdrawalMessage> {
  return signedWithdrawalMessageSchema.serialize(value);
}

export function toJsonSignedApproveAgentMessage(
  value: SignedApproveAgentMessage,
): ProtocolJson<SignedApproveAgentMessage> {
  return signedApproveAgentMessageSchema.serialize(value);
}

export function toJsonSignedRevokeAgentMessage(
  value: SignedRevokeAgentMessage,
): ProtocolJson<SignedRevokeAgentMessage> {
  return signedRevokeAgentMessageSchema.serialize(value);
}

export function toJsonSignedResolutionMessage(
  value: SignedResolutionMessage,
): ProtocolJson<SignedResolutionMessage> {
  return signedResolutionMessageSchema.serialize(value);
}

export function toJsonSignedPauseMessage(
  value: SignedPauseMessage,
): ProtocolJson<SignedPauseMessage> {
  return signedPauseMessageSchema.serialize(value);
}

export function toJsonSignedInvalidateMessage(
  value: SignedInvalidateMessage,
): ProtocolJson<SignedInvalidateMessage> {
  return signedInvalidateMessageSchema.serialize(value);
}

export function stringifyProtocolJson(value: unknown): string {
  return JSON.stringify(value);
}
