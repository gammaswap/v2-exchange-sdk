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
