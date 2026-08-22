import { keccak256 } from "ethers";

export const SignatureType = {
  EOA: 0n,
  PROXY: 1n,
  GNOSIS_SAFE: 2n,
  EIP_1271: 3n,
  AGENT: 4n,
} as const;

export const OrderType = {
  DEPOSIT: 0n,
  WITHDRAWAL: 1n,
  FILL: 2n,
  CANCEL: 3n,
  RESOLUTION: 4n,
  CLAIM: 5n,
  PAUSE: 6n,
  ONCHAIN_DEPOSIT: 7n,
  INVALIDATE: 60n,
  AGENT_APPROVE: 61n,
  AGENT_REVOKE: 62n,
  CANCEL_REPLACE: 63n,
};

export const ChainId = {
  BASE: 8453n,
  BASE_SEPOLIA: 84532n,
  LOCALHOST: 31337n,
} as const;

export const TimeInForce = {
  GTC: 0n,
  FOK: 1n,
  IOC: 2n,
  ALO: 3n,
} as const;

export const OrderSide = {
  BUY: false,
  SELL: true,
} as const;

// Compatibility: the on-chain deposit hash intentionally keeps the original
// DepositSweepOrder struct string so typ-7 journal replay idempotency is stable.
export const DEPOSIT_SWEEP_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "DepositSweepOrder(uint8 typ,address owner,uint64 amount,uint128 index,address ledger)",
  ),
);

export const DEPOSIT_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "DepositOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint64 amount,address token,address ledger,uint64 permitNonce,bytes32 permitSignature)",
  ),
);

export const WITHDRAWAL_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "WithdrawalOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,address receiver,uint64 amount,address ledger)",
  ),
);

export const FILL_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "FillOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint32 epoch,bool side,uint256 assetId,uint64 size,uint24 price,uint8 timeInForce,uint32 approvalNonce)",
  ),
);

export const CANCEL_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "CancelOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint256 assetId,uint32 epoch,bytes32 orderHash,uint32 approvalNonce)",
  ),
);

export const CANCEL_REPLACE_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "CancelReplaceOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint256 assetId,uint32 epoch,bytes32 cancelOrderHash,bytes32 replacementOrderHash,uint32 approvalNonce,bool allOrNothing)",
  ),
);

export const RESOLUTION_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "ResolutionOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint256 assetId,uint32 epoch,uint64 price)",
  ),
);

export const CLAIM_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "ClaimOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint256 assetId,uint32 epoch,uint32 approvalNonce)",
  ),
);

export const PAUSE_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "PauseOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,bool isPause)",
  ),
);

export const INVALIDATE_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "InvalidateOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,uint128 id)",
  ),
);

export const APPROVE_AGENT_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "ApproveAgentOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender,address agent,uint32 approvalNonce,bytes32 approvalSignature)",
  ),
);

export const REVOKE_AGENT_ORDER_TYPEHASH = keccak256(
  Buffer.from(
    "RevokeAgentOrder(uint8 typ,uint64 nonce,address signer,uint8 signatureType,address sender)",
  ),
);

export const AGENT_APPROVAL_TYPEHASH = keccak256(
  Buffer.from("AgentApproval(address master,address agent,uint32 nonce)"),
);

export const DEPOSIT_LEDGER_ABI = [
  "event DepositQueued(uint256 indexed index,address indexed user,uint256 amount)",
  "function SETTLEMENT_TOKEN() view returns (address)",
  "function ACCOUNT_LEDGER() view returns (address)",
  "function PERMIT2() view returns (address)",
  "function pendingBalance() view returns (uint256)",
  "function processedBalance() view returns (uint256)",
  "function pendingDepositCount() view returns (uint128)",
  "function nextPendingDepositId() view returns (uint128)",
  "function processedDepositIndex() view returns (uint128)",
  "function minBlockWait() view returns (uint256)",
  "function canProcessNext() view returns (bool)",
  "function deposit(uint256 amount)",
  "function depositWithPermit(uint256 amount,uint256 nonce,address owner,uint256 deadline,bytes signature)",
] as const;

export const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;
