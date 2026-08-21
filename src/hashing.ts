import { AbiCoder, keccak256, solidityPacked, type TypedDataDomain } from "ethers";
import {
  CancelEntry,
  ClaimEntry,
  DepositEntry,
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
  FillEntry,
  OnchainDepositEntry,
  PauseEntry,
  ResolutionEntry,
  WithdrawalEntry,
} from "./types.js";
import {
  AGENT_APPROVAL_TYPEHASH,
  APPROVE_AGENT_ORDER_TYPEHASH,
  CANCEL_ORDER_TYPEHASH,
  CANCEL_REPLACE_ORDER_TYPEHASH,
  CLAIM_ORDER_TYPEHASH,
  DEPOSIT_ORDER_TYPEHASH,
  DEPOSIT_SWEEP_ORDER_TYPEHASH,
  FILL_ORDER_TYPEHASH,
  INVALIDATE_ORDER_TYPEHASH,
  PAUSE_ORDER_TYPEHASH,
  RESOLUTION_ORDER_TYPEHASH,
  REVOKE_AGENT_ORDER_TYPEHASH,
  WITHDRAWAL_ORDER_TYPEHASH,
} from "./constants.js";

export const CHAIN_ID = BigInt(process.env.CHAIN_ID || "31337");

export const EXCHANGE_DOMAIN: TypedDataDomain = {
  name: "GammaSwap Exchange",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: process.env.VERIFYING_CONTRACT || "0x0000000000000000000000000000000000000000",
};

const abi = new AbiCoder();

export function getExchangeDomain(
  chainId: string | number | bigint = CHAIN_ID,
  verifyingContract: string = String(EXCHANGE_DOMAIN.verifyingContract),
): TypedDataDomain {
  return {
    name: "GammaSwap Exchange",
    version: "2",
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

function getDomainSeparator(domain: TypedDataDomain = EXCHANGE_DOMAIN) {
  const EIP712_DOMAIN_TYPEHASH = keccak256(
    Buffer.from(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    ),
  );

  return keccak256(
    abi.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(Buffer.from("GammaSwap Exchange")),
        keccak256(Buffer.from("2")),
        domain.chainId,
        domain.verifyingContract,
      ],
    ),
  );
}

function getAgentApprovalStructHash(approval: Eip712AgentApproval): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "address", // master
        "address", // agent
        "uint32", // nonce
      ],
      [AGENT_APPROVAL_TYPEHASH, approval.master, approval.agent, approval.approvalNonce],
    ),
  );
}

function getApproveAgentOrderStructHash(order: Eip712ApproveAgent): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "address", // agent
        "uint32", // approvalNonce
        "bytes32", // approvalSignature
      ],
      [
        APPROVE_AGENT_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.agent,
        order.approvalNonce,
        keccak256(order.approvalSignature),
      ],
    ),
  );
}

function getRevokeAgentOrderStructHash(order: Eip712RevokeAgent): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
      ],
      [
        REVOKE_AGENT_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
      ],
    ),
  );
}

export function hashTypedDataStruct(
  structHash: string,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  return keccak256(
    solidityPacked(
      ["string", "bytes32", "bytes32"],
      ["\x19\x01", getDomainSeparator(domain), structHash],
    ),
  );
}

function getOnchainDepositEntryStructHash(order: OnchainDepositEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "address", // owner
        "uint64", // amount
        "uint128", // index
        "address", // ledger
      ],
      [
        DEPOSIT_SWEEP_ORDER_TYPEHASH,
        order.typ,
        order.owner,
        order.amount,
        order.index,
        order.ledger,
      ],
    ),
  );
}

function getOnchainDepositStructHash(order: Eip712OnchainDeposit): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "address", // owner
        "uint64", // amount
        "uint128", // index
        "address", // ledger
      ],
      [
        DEPOSIT_SWEEP_ORDER_TYPEHASH,
        order.typ,
        order.owner,
        order.amount,
        order.index,
        order.ledger,
      ],
    ),
  );
}

function getDepositEntryStructHash(order: DepositEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint64", // amount
        "address", // token
        "address", // ledger
        "uint32", // permitNonce
        "bytes32", // permitSignature
      ],
      [
        DEPOSIT_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.amount,
        order.token,
        order.ledger,
        order.permitNonce,
        keccak256(order.permitSignature),
      ],
    ),
  );
}

function getDepositStructHash(order: Eip712Deposit): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint64", // amount
        "address", // token
        "address", // ledger
        "uint32", // permitNonce
        "bytes32", // permitSignature
      ],
      [
        DEPOSIT_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.amount,
        order.token,
        order.ledger,
        order.permitNonce,
        keccak256(order.permitSignature),
      ],
    ),
  );
}

function getWithdrawalEntryStructHash(order: WithdrawalEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "address", // receiver
        "uint64", // amount
        "address", // ledger
      ],
      [
        WITHDRAWAL_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.receiver,
        order.amount,
        order.ledger,
      ],
    ),
  );
}

function getWithdrawalStructHash(order: Eip712Withdrawal): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "address", // receiver
        "uint64", // amount
        "address", // ledger
      ],
      [
        WITHDRAWAL_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.receiver,
        order.amount,
        order.ledger,
      ],
    ),
  );
}

function getFillEntryStructHash(order: FillEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint32", // epoch
        "bool", // side
        "uint256", // assetId
        "uint64", // size
        "uint24", // price
        "uint8", // timeInForce
        "uint32", // approvalNonce
      ],
      [
        FILL_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.epoch,
        order.side,
        order.assetId,
        order.size,
        order.price,
        order.timeInForce,
        order.approvalNonce,
      ],
    ),
  );
}

function getFillStructHash(order: Eip712Order): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint32", // epoch
        "bool", // side
        "uint256", // assetId
        "uint64", // size
        "uint24", // price
        "uint8", // timeInForce
        "uint32", // approvalNonce
      ],
      [
        FILL_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.epoch,
        order.side,
        order.assetId,
        order.size,
        order.price,
        order.timeInForce,
        order.approvalNonce,
      ],
    ),
  );
}

function getCancelEntryStructHash(order: CancelEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "bytes32", // orderHash
        "uint32", // approvalNonce
      ],
      [
        CANCEL_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.assetId,
        order.epoch,
        order.orderHash, // MUST be 32 bytes
        order.approvalNonce,
      ],
    ),
  );
}

function getCancelStructHash(order: Eip712Cancel): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "bytes32", // orderHash
        "uint32", // approvalNonce
      ],
      [
        CANCEL_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.assetId,
        order.epoch,
        order.orderHash, // MUST be 32 bytes
        order.approvalNonce,
      ],
    ),
  );
}

function getCancelReplaceStructHash(order: Eip712CancelReplace): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "bytes32", // cancelOrderHash
        "bytes32", // replacementOrderHash
        "uint32", // approvalNonce
        "bool", // allOrNothing
      ],
      [
        CANCEL_REPLACE_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.assetId,
        order.epoch,
        order.cancelOrderHash,
        order.replacementOrderHash,
        order.approvalNonce,
        order.allOrNothing,
      ],
    ),
  );
}

function getClaimEntryStructHash(order: ClaimEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "uint32", // approvalNonce
      ],
      [
        CLAIM_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.assetId,
        order.epoch,
        order.approvalNonce,
      ],
    ),
  );
}

function getClaimStructHash(order: Eip712Claim): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "uint32", // approvalNonce
      ],
      [
        CLAIM_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.assetId,
        order.epoch,
        order.approvalNonce,
      ],
    ),
  );
}

function getResolutionEntryStructHash(order: ResolutionEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "uint64", // price
      ],
      [
        RESOLUTION_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.assetId,
        order.epoch,
        order.price,
      ],
    ),
  );
}

function getResolutionStructHash(order: Eip712Resolution): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint256", // assetId
        "uint32", // epoch
        "uint64", // price
      ],
      [
        RESOLUTION_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.assetId,
        order.epoch,
        order.price,
      ],
    ),
  );
}

function getPauseEntryStructHash(order: PauseEntry): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "bool", // isPause
      ],
      [
        PAUSE_ORDER_TYPEHASH,
        order.auth.typ,
        order.auth.nonce,
        order.auth.signer,
        order.auth.signatureType,
        order.auth.sender,
        order.isPause,
      ],
    ),
  );
}

function getPauseStructHash(order: Eip712Pause): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "bool", // isPause
      ],
      [
        PAUSE_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.isPause,
      ],
    ),
  );
}

function getInvalidateStructHash(order: Eip712Invalidate): string {
  return keccak256(
    abi.encode(
      [
        "bytes32",
        "uint8", // typ
        "uint64", // nonce
        "address", // signer
        "uint8", // signatureType
        "address", // sender
        "uint128", // id
      ],
      [
        INVALIDATE_ORDER_TYPEHASH,
        order.typ,
        order.nonce,
        order.signer,
        order.signatureType,
        order.sender,
        order.id,
      ],
    ),
  );
}

export function hashCancelReplaceOrderJS(
  order: Eip712CancelReplace,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  return hashTypedDataStruct(getCancelReplaceStructHash(order), domain);
}

export function hashInvalidateOrderJS(
  order: Eip712Invalidate,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getInvalidateStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashRevokeAgentOrderJS(
  order: Eip712RevokeAgent,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getRevokeAgentOrderStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashApproveAgentOrderJS(
  order: Eip712ApproveAgent,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getApproveAgentOrderStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashAgentApprovalJS(
  order: Eip712AgentApproval,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getAgentApprovalStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashPauseOrderEntryJS(
  order: PauseEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getPauseEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashPauseOrderJS(
  order: Eip712Pause,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getPauseStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashOnchainDepositOrderEntryJS(
  order: OnchainDepositEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getOnchainDepositEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashOnchainDepositOrderJS(
  order: Eip712OnchainDeposit,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getOnchainDepositStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashDepositOrderEntryJS(
  order: DepositEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getDepositEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashDepositOrderJS(
  order: Eip712Deposit,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getDepositStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashWithdrawalOrderEntryJS(
  order: WithdrawalEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getWithdrawalEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashWithdrawalOrderJS(
  order: Eip712Withdrawal,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getWithdrawalStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashFillOrderEntryJS(
  order: FillEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getFillEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashFillOrderJS(
  order: Eip712Order,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getFillStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashCancelOrderEntryJS(
  order: CancelEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getCancelEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashCancelOrderJS(
  order: Eip712Cancel,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getCancelStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashClaimOrderEntryJS(
  order: ClaimEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getClaimEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashClaimOrderJS(
  order: Eip712Claim,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getClaimStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashResolutionOrderEntry(
  order: ResolutionEntry,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getResolutionEntryStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}

export function hashResolutionOrderJS(
  order: Eip712Resolution,
  domain: TypedDataDomain = EXCHANGE_DOMAIN,
): string {
  const structHash = getResolutionStructHash(order);
  return hashTypedDataStruct(structHash, domain);
}
