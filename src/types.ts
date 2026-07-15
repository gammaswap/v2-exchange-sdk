
export interface Eip712Order {
    typ: bigint;
    nonce: bigint;
    signer: string;
    signatureType: bigint;
    sender: string;
    epoch: bigint;
    side: boolean;
    assetId: bigint;
    size: bigint;
    price: bigint;
    timeInForce: bigint;
    approvalNonce: bigint;
}


export interface Eip712Cancel {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
    assetId: bigint;
    epoch: bigint;
    orderHash: string;
    approvalNonce: bigint;
}

export interface Eip712ApproveAgent {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
    agent: string;
    approvalNonce: bigint;
    approvalSignature: string;
}

export interface Eip712AgentApproval {
    master: string;
    agent: string;
    approvalNonce: bigint;
    approvalSignature: string;
}


export interface SignedApproveAgentMessage {
    approval: Eip712ApproveAgent;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712RevokeAgent {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
}

export interface SignedRevokeAgentMessage {
    revocation: Eip712RevokeAgent;
    chainId: bigint;
    signature: string;
    orderHash: string;
}

export interface SignedOrderMessage {
    order: Eip712Order;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712Resolution {
    typ: bigint;
    nonce: bigint;
    signer: string;
    signatureType: bigint;
    sender: string;
    assetId: bigint;
    epoch: bigint;
    price: bigint;
}

export interface SignedResolutionMessage {
    resolution: Eip712Resolution;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712Pause {
    typ: bigint;
    nonce: bigint;
    signer: string;
    signatureType: bigint;
    sender: string;
    isPause: boolean;
}

export interface SignedPauseMessage {
    pause: Eip712Pause;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712Invalidate {
    typ: bigint;
    nonce: bigint;
    signer: string;
    signatureType: bigint;
    sender: string;
    id: bigint;
}

export interface SignedInvalidateMessage {
    invalidate: Eip712Invalidate;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712OnchainDeposit {
    typ: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    arrivalTime: bigint,
    owner: string,
    amount: bigint,
    index: bigint,
    ledger: string,
}

export interface Eip712Deposit {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
    amount: bigint;
    token: string;
    ledger: string;
    permitNonce: bigint; // must be unique for every permit (needs to be put in the hash of the contract)
    permitSignature: string;
}

export interface SignedDepositMessage {
    deposit: Eip712Deposit;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712Withdrawal {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
    receiver: string;
    amount: bigint;
    ledger: string;
}

export interface SignedWithdrawalMessage {
    withdrawal: Eip712Withdrawal;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712Cancel {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
    assetId: bigint;
    epoch: bigint;
    orderHash: string;
}

export interface SignedCancelMessage {
    cancel: Eip712Cancel;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Eip712Claim {
    typ: bigint;
    nonce: bigint; // must be unique in every transaction the user sends
    signer: string;
    signatureType: bigint;
    sender: string;
    assetId: bigint;
    epoch: bigint;
    approvalNonce: bigint;
}

export interface SignedClaimMessage {
    claim: Eip712Claim;
    chainId: bigint;
    orderHash: string;
    signature: string;
}

export interface Auth {
    nonce: bigint,
    signer: string,
    signatureType: bigint, // enum SignatureType as uint8; 0 = whatever you define
    signature: string, // placeholder, you should put a real signature here
    sender: string,
    typ: bigint,
}

export interface PauseEntry {
    auth: Auth,
    arrivalTime: bigint,
    isPause: boolean, // false if unpausing
}

export interface InvalidateEntry {
    auth: Auth,
    arrivalTime: bigint,
    id: bigint, // id must equal currentTxId on chain
}

export interface RevokeAgentEntry {
    auth: Auth,
    arrivalTime: bigint,
}

export interface ApproveAgentEntry {
    auth: Auth,
    arrivalTime: bigint,
    agent: string;
    approvalNonce: bigint;
    approvalSignature: string;
}

export interface ClaimEntry {
    auth: Auth,
    arrivalTime: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    assetId: bigint,
    epoch: bigint,
    approvalNonce: bigint,
    approvalSignature: string,
}

export interface CancelEntry {
    auth: Auth,
    arrivalTime: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    assetId: bigint,
    epoch: bigint,
    orderHash: string,
    approvalNonce: bigint,
    approvalSignature: string,
}

export interface DepositEntry {
    auth: Auth,
    arrivalTime: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    amount: bigint,
    token: string,
    ledger: string,
    permitNonce: bigint,
    permitSignature: string,
}

export interface WithdrawalEntry {
    auth: Auth,
    arrivalTime: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    receiver: string,
    amount: bigint,
    ledger: string,
}

/**
 * FillEntry represents an order in the exchange.
 *
 * Market Side Derivation Strategy:
 * --------------------------------
 * FillEntry does not include a marketSide field. Instead, marketSide is derived as follows:
 *
 * For simple up/down markets (current implementation):
 *   - All orders trade on the YES side (marketSide = 'yes')
 *   - BUY (side=false): buying YES positions (betting asset price > strike)
 *   - SELL (side=true): selling YES positions (betting asset price > strike)
 *
 * For full markets (future implementation):
 *   - marketSide will be decoded from assetId
 *   - Even assetId could map to YES, odd to NO (or similar encoding)
 *   - This allows orders on both YES and NO sides of the market
 *
 * Note: The 'side' field indicates order direction (buy/sell), NOT market side (yes/no)
 */
export interface FillEntry {
    auth: Auth,
    arrivalTime: bigint,
    side: boolean,
    epoch: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    assetId: bigint,
    price: bigint,
    size: bigint,
    maxSize: bigint,
    fillPrice: bigint,
    fill: bigint,
    fillId: bigint,
    accountFee: bigint,
    exchangeFee: bigint,
    accountFeeSide: boolean,
    timeInForce: bigint,
    approvalNonce: bigint,
    approvalSignature: string,
}

export interface ResolutionEntry {
    auth: Auth,
    arrivalTime: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    assetId: bigint,
    epoch: bigint,
    price: bigint,
}

export interface OnchainDepositEntry {
    typ: bigint,
    id: bigint, // or currentTxId + 1n; up to your logic
    arrivalTime: bigint,
    owner: string,
    amount: bigint,
    index: bigint,
    ledger: string,
}




