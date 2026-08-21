export type Address = string;
export type DecimalString = string;
export type HumanDecimalString = string;
export type HexString = string;
export type ProtocolBigNumberish = bigint | DecimalString;

export type ProtocolInput<T> = {
  [K in keyof T]: T[K] extends bigint
    ? ProtocolBigNumberish
    : T[K] extends object
      ? ProtocolInput<T[K]>
      : T[K];
};

export type ProtocolJson<T> = {
  [K in keyof T]: T[K] extends bigint
    ? DecimalString
    : T[K] extends object
      ? ProtocolJson<T[K]>
      : T[K];
};

export interface Auth {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  signature: HexString;
  sender: Address;
}

export interface Eip712Order {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  epoch: bigint;
  side: boolean;
  assetId: bigint;
  size: bigint;
  price: bigint;
  timeInForce: bigint;
  approvalNonce: bigint;
}

export type Eip712FillOrder = Eip712Order;

export interface Eip712Cancel {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  assetId: bigint;
  epoch: bigint;
  orderHash: HexString;
  approvalNonce: bigint;
}

export interface Eip712CancelReplace {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  assetId: bigint;
  epoch: bigint;
  cancelOrderHash: HexString;
  replacementOrderHash: HexString;
  approvalNonce: bigint;
  allOrNothing: boolean;
}

export interface Eip712Claim {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  assetId: bigint;
  epoch: bigint;
  approvalNonce: bigint;
}

export interface Eip712Deposit {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  amount: bigint;
  token: Address;
  ledger: Address;
  permitNonce: bigint;
  permitSignature: HexString;
}

export interface Eip712Withdrawal {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  receiver: Address;
  amount: bigint;
  ledger: Address;
}

export interface Eip712ApproveAgent {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  agent: Address;
  approvalNonce: bigint;
  approvalSignature: HexString;
}

export interface Eip712RevokeAgent {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
}

export interface Eip712Resolution {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  assetId: bigint;
  epoch: bigint;
  price: bigint;
}

export interface Eip712Pause {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  isPause: boolean;
}

export interface Eip712Invalidate {
  typ: bigint;
  nonce: bigint;
  signer: Address;
  signatureType: bigint;
  sender: Address;
  id: bigint;
}

export interface Eip712OnchainDeposit {
  typ: bigint;
  id: bigint;
  arrivalTime: bigint;
  owner: Address;
  amount: bigint;
  index: bigint;
  ledger: Address;
}

export interface Eip712AgentApproval {
  master: Address;
  agent: Address;
  approvalNonce: bigint;
  approvalSignature: HexString;
}

export interface SignedOrderMessage {
  order: Eip712Order;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedCancelMessage {
  cancel: Eip712Cancel;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedCancelReplaceMessage {
  cancelReplace: Eip712CancelReplace;
  replacement: Eip712Order;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
  replacementOrderHash: HexString;
  replacementSignature: HexString;
}

export interface SignedClaimMessage {
  claim: Eip712Claim;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedDepositMessage {
  deposit: Eip712Deposit;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedWithdrawalMessage {
  withdrawal: Eip712Withdrawal;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedApproveAgentMessage {
  approval: Eip712ApproveAgent;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedRevokeAgentMessage {
  revocation: Eip712RevokeAgent;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedResolutionMessage {
  resolution: Eip712Resolution;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedPauseMessage {
  pause: Eip712Pause;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface SignedInvalidateMessage {
  invalidate: Eip712Invalidate;
  chainId: bigint;
  orderHash: HexString;
  signature: HexString;
}

export interface PauseEntry {
  auth: Auth;
  arrivalTime: bigint;
  isPause: boolean;
}

export interface InvalidateEntry {
  auth: Auth;
  arrivalTime: bigint;
  id: bigint;
}

export interface RevokeAgentEntry {
  auth: Auth;
  arrivalTime: bigint;
}

export interface ApproveAgentEntry {
  auth: Auth;
  arrivalTime: bigint;
  agent: Address;
  approvalNonce: bigint;
  approvalSignature: HexString;
}

export interface ClaimEntry {
  auth: Auth;
  arrivalTime: bigint;
  id: bigint;
  assetId: bigint;
  epoch: bigint;
  approvalNonce: bigint;
  approvalSignature: HexString;
}

export interface CancelEntry {
  auth: Auth;
  arrivalTime: bigint;
  id: bigint;
  assetId: bigint;
  epoch: bigint;
  orderHash: HexString;
  approvalNonce: bigint;
  approvalSignature: HexString;
}

export interface DepositEntry {
  auth: Auth;
  arrivalTime: bigint;
  id: bigint;
  amount: bigint;
  token: Address;
  ledger: Address;
  permitNonce: bigint;
  permitSignature: HexString;
}

export interface WithdrawalEntry {
  auth: Auth;
  arrivalTime: bigint;
  id: bigint;
  receiver: Address;
  amount: bigint;
  ledger: Address;
}

/**
 * FillEntry represents an order in the exchange.
 *
 * The `side` field indicates order direction, not market side. Any market-side
 * derivation from `assetId` belongs outside this entry shape.
 */
export interface FillEntry {
  auth: Auth;
  arrivalTime: bigint;
  side: boolean;
  epoch: bigint;
  id: bigint;
  assetId: bigint;
  price: bigint;
  size: bigint;
  maxSize: bigint;
  fillPrice: bigint;
  fill: bigint;
  fillId: bigint;
  accountFee: bigint;
  exchangeFee: bigint;
  accountFeeSide: boolean;
  timeInForce: bigint;
  approvalNonce: bigint;
  approvalSignature: HexString;
}

export interface ResolutionEntry {
  auth: Auth;
  arrivalTime: bigint;
  id: bigint;
  assetId: bigint;
  epoch: bigint;
  price: bigint;
}

export interface OnchainDepositEntry {
  typ: bigint;
  id: bigint;
  arrivalTime: bigint;
  owner: Address;
  amount: bigint;
  index: bigint;
  ledger: Address;
}

export type JsonAuth = ProtocolJson<Auth>;
export type JsonEip712Order = ProtocolJson<Eip712Order>;
export type JsonEip712Cancel = ProtocolJson<Eip712Cancel>;
export type JsonEip712CancelReplace = ProtocolJson<Eip712CancelReplace>;
export type JsonEip712Claim = ProtocolJson<Eip712Claim>;
export type JsonEip712Deposit = ProtocolJson<Eip712Deposit>;
export type JsonEip712Withdrawal = ProtocolJson<Eip712Withdrawal>;
export type JsonEip712ApproveAgent = ProtocolJson<Eip712ApproveAgent>;
export type JsonEip712RevokeAgent = ProtocolJson<Eip712RevokeAgent>;
export type JsonEip712Resolution = ProtocolJson<Eip712Resolution>;
export type JsonEip712Pause = ProtocolJson<Eip712Pause>;
export type JsonEip712Invalidate = ProtocolJson<Eip712Invalidate>;
export type JsonEip712OnchainDeposit = ProtocolJson<Eip712OnchainDeposit>;
export type JsonEip712AgentApproval = ProtocolJson<Eip712AgentApproval>;

export type JsonSignedOrderMessage = ProtocolJson<SignedOrderMessage>;
export type JsonSignedCancelMessage = ProtocolJson<SignedCancelMessage>;
export type JsonSignedCancelReplaceMessage = ProtocolJson<SignedCancelReplaceMessage>;
export type JsonSignedClaimMessage = ProtocolJson<SignedClaimMessage>;
export type JsonSignedDepositMessage = ProtocolJson<SignedDepositMessage>;
export type JsonSignedWithdrawalMessage = ProtocolJson<SignedWithdrawalMessage>;
export type JsonSignedApproveAgentMessage = ProtocolJson<SignedApproveAgentMessage>;
export type JsonSignedRevokeAgentMessage = ProtocolJson<SignedRevokeAgentMessage>;
export type JsonSignedResolutionMessage = ProtocolJson<SignedResolutionMessage>;
export type JsonSignedPauseMessage = ProtocolJson<SignedPauseMessage>;
export type JsonSignedInvalidateMessage = ProtocolJson<SignedInvalidateMessage>;

export type Eip712OrderInput = ProtocolInput<Eip712Order>;
export type Eip712CancelInput = ProtocolInput<Eip712Cancel>;
export type Eip712CancelReplaceInput = ProtocolInput<Eip712CancelReplace>;
export type Eip712ClaimInput = ProtocolInput<Eip712Claim>;
export type Eip712DepositInput = ProtocolInput<Eip712Deposit>;
export type Eip712WithdrawalInput = ProtocolInput<Eip712Withdrawal>;
export type Eip712ApproveAgentInput = ProtocolInput<Eip712ApproveAgent>;
export type Eip712RevokeAgentInput = ProtocolInput<Eip712RevokeAgent>;
export type Eip712ResolutionInput = ProtocolInput<Eip712Resolution>;
export type Eip712PauseInput = ProtocolInput<Eip712Pause>;
export type Eip712InvalidateInput = ProtocolInput<Eip712Invalidate>;
export type Eip712OnchainDepositInput = ProtocolInput<Eip712OnchainDeposit>;
export type Eip712AgentApprovalInput = ProtocolInput<Eip712AgentApproval>;

export interface GetAssetRequest {
  assetId: bigint;
}

export interface GetAssetAtEpochRequest {
  assetId: bigint;
  epoch: bigint;
}

export interface GetResolutionPriceRequest {
  assetId: bigint;
  epoch: bigint;
}

export interface GetLastResolutionPriceRequest {
  assetId: bigint;
}

export interface GetBalanceRequest {
  account: Address;
}

export interface GetOrderBookRequest {
  assetId: bigint;
  epoch: bigint;
}

export interface GetBookOrdersRequest {
  assetId: bigint;
  epoch: bigint;
  account: Address;
}

export interface GetTopOfBookRequest {
  assetId: bigint;
  epoch: bigint;
}

export interface GetPositionRequest {
  account: Address;
  assetId: bigint;
  epoch: bigint;
}

export interface GetClaimableRequest {
  account: Address;
  assetId: bigint;
  epoch: bigint;
}

export interface GetMarkPriceRequest {
  assetId: bigint;
}

export interface GetSettlementPriceRequest {
  assetId: bigint;
  epoch: bigint;
}

export interface AssetSnapshot {
  assetId: bigint;
  epoch: bigint;
  registered: boolean;
  expiration: bigint;
  assetType: bigint;
  strikePrice: bigint;
  resolutionPrice: bigint;
  isResolved: boolean;
  ledger: Address;
}

export type JsonAssetSnapshot = ProtocolJson<AssetSnapshot>;

export interface HealthResponse {
  status: "ok";
}

export interface BalanceResponse {
  account: Address;
  ts: bigint;
  balance: bigint;
  pending: bigint;
}

export interface PositionResponse {
  account: Address;
  assetId: bigint;
  epoch: bigint;
  ts: bigint;
  size: bigint;
  margin: bigint;
  balance: bigint;
  pnl: bigint;
  side: boolean;
  bSide: boolean;
  mSide: boolean;
  pSide: boolean;
}

export interface OrderBookOrder {
  id: string;
  size: bigint;
  price: bigint;
  time?: bigint;
  account?: Address;
}

export interface OrderBookLevel {
  price: bigint;
  size: bigint;
  orderCount: bigint;
  orders?: OrderBookOrder[];
}

export interface OrderBookResponse {
  assetId: bigint;
  epoch: bigint;
  ts: bigint;
  seqId: bigint;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface TopOfBookResponse {
  assetId: bigint;
  epoch: bigint;
  seqId: bigint;
  ts: bigint;
  bid: OrderBookLevel;
  ask: OrderBookLevel;
  last: bigint;
  lastTs: bigint;
}

export interface BookOrdersResponse {
  assetId: bigint;
  epoch: bigint;
  seqId: bigint;
  ts: bigint;
  buys: OrderBookOrder[];
  sells: OrderBookOrder[];
}

export interface ClaimableResponse {
  account: Address;
  assetId: bigint;
  epoch: bigint;
  claimable: bigint;
}

export interface MarkPriceResponse {
  assetId: bigint;
  id: bigint;
  ts: bigint;
  price: bigint;
}

export interface SettlementPriceResponse {
  assetId: bigint;
  epoch: bigint;
  id: bigint;
  ts: bigint;
  expirationTime: bigint;
  settlementPrice: bigint;
}

export interface ResolutionPriceResponse {
  assetId: bigint;
  epoch: bigint;
  id: bigint;
  ts: bigint;
  price: bigint;
  isNull: boolean;
}

export interface AgentApprovalResponse {
  agent: string;
  nonce: bigint;
  status: "active" | "inactive" | "expired";
}

export interface GetAgentApprovalRequest {
  account: Address;
}

export interface GetExchangeConfigRequest {
  chainId: bigint;
}

export interface ExchangeContracts {
  exchange: Address;
  ledger: Address;
  depositLedger?: Address;
  settlementToken?: Address;
  permit2?: Address;
}

export interface ExchangeChainConfig {
  chainId: bigint;
  contracts: ExchangeContracts;
}

export type JsonExchangeContracts = ProtocolJson<ExchangeContracts>;
export type JsonExchangeChainConfig = ProtocolJson<ExchangeChainConfig>;
export type ExchangeContractsInput = ProtocolInput<ExchangeContracts>;
export type ExchangeChainConfigInput = ProtocolInput<ExchangeChainConfig>;

export type PlaceOrderInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  side: boolean;
  price: HumanDecimalString;
  size: HumanDecimalString;
  timeInForce?: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
};

export type PlaceAgentOrderInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  side: boolean;
  price: HumanDecimalString;
  size: HumanDecimalString;
  timeInForce?: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
  sender: Address;
  approvalNonce?: ProtocolBigNumberish;
};

export type CancelOrderInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  orderHash: HexString;
  nonce?: ProtocolBigNumberish;
};

export type CancelReplaceOrderInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  cancelOrderHash: HexString;
  side: boolean;
  price: HumanDecimalString;
  size: HumanDecimalString;
  timeInForce?: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
  replacementNonce?: ProtocolBigNumberish;
  allOrNothing?: boolean;
};

export type CancelAllInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
};

export type CancelAgentOrderInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  orderHash: HexString;
  nonce?: ProtocolBigNumberish;
  sender: Address;
  approvalNonce?: ProtocolBigNumberish;
};

export type CancelReplaceAgentOrderInput = CancelReplaceOrderInput & {
  sender: Address;
  approvalNonce?: ProtocolBigNumberish;
};

export type CancelAllAgentInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
  sender: Address;
  approvalNonce?: ProtocolBigNumberish;
};

export type ClaimInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
};

export type AgentClaimInput = {
  assetId: ProtocolBigNumberish;
  epoch: ProtocolBigNumberish;
  sender: Address;
  nonce?: ProtocolBigNumberish;
  approvalNonce?: ProtocolBigNumberish;
};

export type WithdrawalInput = {
  amount: HumanDecimalString;
  nonce?: ProtocolBigNumberish;
  receiver?: Address;
};

export type ApproveAgentInput = {
  agent: Address;
  approvalNonce?: ProtocolBigNumberish;
  nonce?: ProtocolBigNumberish;
};

export type RevokeAgentInput = {
  nonce?: ProtocolBigNumberish;
};

export type AgentApprovalInput = {
  master: Address;
  agent: Address;
  approvalNonce: ProtocolBigNumberish;
};

export type DepositTransactionInput = {
  amount: HumanDecimalString;
  confirmations?: number;
  logTxId?: boolean;
};

export type TokenApprovalInput = {
  amount: HumanDecimalString;
  confirmations?: number;
};

export type DepositPermitInput = {
  amount: HumanDecimalString;
  nonce: ProtocolBigNumberish;
  deadline: ProtocolBigNumberish;
  owner?: Address;
};

export type DepositWithPermitInput = {
  signature?: HexString;
  confirmations?: number;
  logTxId?: boolean;
} & DepositPermitInput;

export interface OrderEvent {
  orderId: string;
  assetId: bigint;
  epoch: bigint;
  price: bigint;
  side: string;
  size: bigint;
  arrivalTime: bigint;
  tif: string;
  type: string;
}

export interface TradeEvent {
  orderId: string;
  assetId: bigint;
  epoch: bigint;
  price: bigint;
  side: string;
  size: bigint;
  arrivalTime: bigint;
  fillPrice: bigint;
  fill: bigint;
  tif: string;
  type: string;
}

export interface CancelEvent {
  orderId: string;
  cancelId: string; // orderId of order being cancelled
  assetId: bigint;
  epoch: bigint;
  arrivalTime: bigint;
}

export interface ResolutionEvent {
  orderId: string;
  assetId: bigint;
  epoch: bigint;
  price: bigint;
  arrivalTime: bigint;
}

export interface ClaimEvent {
  orderId: string;
  assetId: bigint;
  epoch: bigint;
  arrivalTime: bigint;
}

export type WebSocketMarketEventType = "order" | "trade" | "cancel" | "resolution";

export type WebSocketConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface WebSocketConnectedMessage {
  type: "connected";
  message: string;
}

export interface WebSocketSubscribedMessage {
  type: "subscribed";
  assetId: string;
}

export interface WebSocketUnsubscribedMessage {
  type: "unsubscribed";
  assetId: string;
}

export interface WebSocketErrorMessage {
  type: "error";
  message: string;
}

export type WebSocketControlMessage =
  | WebSocketConnectedMessage
  | WebSocketSubscribedMessage
  | WebSocketUnsubscribedMessage
  | WebSocketErrorMessage;

export interface WebSocketOrderUpdate {
  type: "order";
  seqId: bigint;
  assetId: bigint;
  epoch: bigint;
  data: OrderEvent;
}

export interface WebSocketTradeUpdate {
  type: "trade";
  seqId: bigint;
  assetId: bigint;
  epoch: bigint;
  data: TradeEvent;
}

export interface WebSocketCancelUpdate {
  type: "cancel";
  seqId: bigint;
  assetId: bigint;
  epoch: bigint;
  data: CancelEvent;
}

export interface WebSocketResolutionUpdate {
  type: "resolution";
  seqId: bigint;
  assetId: bigint;
  epoch: bigint;
  data: ResolutionEvent;
}

export type WebSocketMarketUpdate =
  WebSocketOrderUpdate | WebSocketTradeUpdate | WebSocketCancelUpdate | WebSocketResolutionUpdate;

export type WebSocketMessage = WebSocketControlMessage | WebSocketMarketUpdate;

export interface OrderBookSubscriptionHandlers {
  onUpdate?: (update: WebSocketMarketUpdate) => void;
  onOrder?: (update: WebSocketOrderUpdate) => void;
  onTrade?: (update: WebSocketTradeUpdate) => void;
  onCancel?: (update: WebSocketCancelUpdate) => void;
  onResolution?: (update: WebSocketResolutionUpdate) => void;
  onError?: (error: unknown) => void;
  onResyncRequired?: (assetId: string) => void;
}

export type Unsubscribe = () => Promise<void>;

export interface OracleWebSocketConnectedMessage {
  type: "connected";
  message: string;
}

export interface OracleWebSocketSubscribedMessage {
  type: "subscribed";
  symbolId: string;
}

export interface OracleWebSocketUnsubscribedMessage {
  type: "unsubscribed";
  symbolId: string;
  reason?: string;
}

export interface OracleWebSocketErrorMessage {
  type: "error";
  message: string;
}

export type OracleWebSocketControlMessage =
  | OracleWebSocketConnectedMessage
  | OracleWebSocketSubscribedMessage
  | OracleWebSocketUnsubscribedMessage
  | OracleWebSocketErrorMessage;

export interface OraclePriceUpdate {
  type: "price";
  symbolId: bigint;
  price: bigint;
  ts: bigint;
}

export type OracleWebSocketMessage = OracleWebSocketControlMessage | OraclePriceUpdate;

export interface OraclePriceSubscriptionHandlers {
  onPrice?: (update: OraclePriceUpdate) => void;
  onError?: (error: unknown) => void;
  onStale?: (symbolId: string) => void;
}

/**
 * AssetId encoding/decoding utilities
 *
 * Matches PackedAssetId.sol (MarginExchange): LSB-first bit packing.
 * - id: 64 bits (0-63)
 * - marketType: 8 bits (64-71)
 * - startTime: 32 bits (72-103)
 * - periodLength: 32 bits (104-135)
 * - strike: 48 bits (136-183) — strike
 * - strike: 16 bits (184-199) — range
 * - reserved: 56 bits (200-255)
 *
 * expiration (not packed) = startTime + periodLength (when the market settles).
 */
export interface DecodedAssetId {
    id: string;           // uint64 — base asset id
    marketType: number;   // uint8 — asset type (1 = up/down, etc.)
    startTime: number;    // uint32 — market start timestamp
    periodLength: number; // uint32 — period in seconds (e.g. 900 for 15m)
    strike: string;       // uint48 — strike/priceChange per asset type
    range: number;        // uint16 — range
    reserved: string;     // uint56 — reserved
    expiration: number;   // startTime + periodLength (convenience)
}
