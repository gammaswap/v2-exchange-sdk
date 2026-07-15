import { OrderType } from "./constants.js";
import {
  parseEip712AgentApproval,
  parseEip712ApproveAgent,
  parseEip712Cancel,
  parseEip712Claim,
  parseEip712Deposit,
  parseEip712Invalidate,
  parseEip712OnchainDeposit,
  parseEip712Order,
  parseEip712Pause,
  parseEip712Resolution,
  parseEip712RevokeAgent,
  parseEip712Withdrawal,
  parseSignedApproveAgentMessage,
  parseSignedCancelMessage,
  parseSignedClaimMessage,
  parseSignedDepositMessage,
  parseSignedInvalidateMessage,
  parseSignedOrderMessage,
  parseSignedPauseMessage,
  parseSignedResolutionMessage,
  parseSignedRevokeAgentMessage,
  parseSignedWithdrawalMessage,
  toJsonEip712AgentApproval,
  toJsonEip712ApproveAgent,
  toJsonEip712Cancel,
  toJsonEip712Claim,
  toJsonEip712Deposit,
  toJsonEip712Invalidate,
  toJsonEip712OnchainDeposit,
  toJsonEip712Order,
  toJsonEip712Pause,
  toJsonEip712Resolution,
  toJsonEip712RevokeAgent,
  toJsonEip712Withdrawal,
  toJsonSignedApproveAgentMessage,
  toJsonSignedCancelMessage,
  toJsonSignedClaimMessage,
  toJsonSignedDepositMessage,
  toJsonSignedInvalidateMessage,
  toJsonSignedOrderMessage,
  toJsonSignedPauseMessage,
  toJsonSignedResolutionMessage,
  toJsonSignedRevokeAgentMessage,
  toJsonSignedWithdrawalMessage,
} from "./schemas.js";
import type {
  Eip712AgentApproval,
  Eip712AgentApprovalInput,
  Eip712ApproveAgent,
  Eip712ApproveAgentInput,
  Eip712Cancel,
  Eip712CancelInput,
  Eip712Claim,
  Eip712ClaimInput,
  Eip712Deposit,
  Eip712DepositInput,
  Eip712Invalidate,
  Eip712InvalidateInput,
  Eip712OnchainDeposit,
  Eip712OnchainDepositInput,
  Eip712Order,
  Eip712OrderInput,
  Eip712Pause,
  Eip712PauseInput,
  Eip712Resolution,
  Eip712ResolutionInput,
  Eip712RevokeAgent,
  Eip712RevokeAgentInput,
  Eip712Withdrawal,
  Eip712WithdrawalInput,
  JsonEip712AgentApproval,
  JsonEip712ApproveAgent,
  JsonEip712Cancel,
  JsonEip712Claim,
  JsonEip712Deposit,
  JsonEip712Invalidate,
  JsonEip712OnchainDeposit,
  JsonEip712Order,
  JsonEip712Pause,
  JsonEip712Resolution,
  JsonEip712RevokeAgent,
  JsonEip712Withdrawal,
  JsonSignedApproveAgentMessage,
  JsonSignedCancelMessage,
  JsonSignedClaimMessage,
  JsonSignedDepositMessage,
  JsonSignedInvalidateMessage,
  JsonSignedOrderMessage,
  JsonSignedPauseMessage,
  JsonSignedResolutionMessage,
  JsonSignedRevokeAgentMessage,
  JsonSignedWithdrawalMessage,
  ProtocolInput,
  SignedApproveAgentMessage,
  SignedCancelMessage,
  SignedClaimMessage,
  SignedDepositMessage,
  SignedInvalidateMessage,
  SignedOrderMessage,
  SignedPauseMessage,
  SignedResolutionMessage,
  SignedRevokeAgentMessage,
  SignedWithdrawalMessage,
} from "./types.js";

export type BuildOrderInput = Omit<Eip712OrderInput, "typ">;
export type BuildCancelInput = Omit<Eip712CancelInput, "typ">;
export type BuildClaimInput = Omit<Eip712ClaimInput, "typ">;
export type BuildDepositInput = Omit<Eip712DepositInput, "typ">;
export type BuildWithdrawalInput = Omit<Eip712WithdrawalInput, "typ">;
export type BuildApproveAgentInput = Omit<Eip712ApproveAgentInput, "typ">;
export type BuildRevokeAgentInput = Omit<Eip712RevokeAgentInput, "typ">;
export type BuildResolutionInput = Omit<Eip712ResolutionInput, "typ">;
export type BuildPauseInput = Omit<Eip712PauseInput, "typ">;
export type BuildInvalidateInput = Omit<Eip712InvalidateInput, "typ">;
export type BuildOnchainDepositInput = Omit<Eip712OnchainDepositInput, "typ">;

export function buildOrder(input: BuildOrderInput): Eip712Order {
  return parseEip712Order({ ...input, typ: OrderType.FILL });
}

export const buildFillOrder = buildOrder;

export function buildCancel(input: BuildCancelInput): Eip712Cancel {
  return parseEip712Cancel({ ...input, typ: OrderType.CANCEL });
}

export function buildClaim(input: BuildClaimInput): Eip712Claim {
  return parseEip712Claim({ ...input, typ: OrderType.CLAIM });
}

export function buildDeposit(input: BuildDepositInput): Eip712Deposit {
  return parseEip712Deposit({ ...input, typ: OrderType.DEPOSIT });
}

export function buildWithdrawal(input: BuildWithdrawalInput): Eip712Withdrawal {
  return parseEip712Withdrawal({ ...input, typ: OrderType.WITHDRAWAL });
}

export function buildApproveAgent(input: BuildApproveAgentInput): Eip712ApproveAgent {
  return parseEip712ApproveAgent({ ...input, typ: OrderType.AGENT_APPROVE });
}

export function buildRevokeAgent(input: BuildRevokeAgentInput): Eip712RevokeAgent {
  return parseEip712RevokeAgent({ ...input, typ: OrderType.AGENT_REVOKE });
}

export function buildResolution(input: BuildResolutionInput): Eip712Resolution {
  return parseEip712Resolution({ ...input, typ: OrderType.RESOLUTION });
}

export function buildPause(input: BuildPauseInput): Eip712Pause {
  return parseEip712Pause({ ...input, typ: OrderType.PAUSE });
}

export function buildInvalidate(input: BuildInvalidateInput): Eip712Invalidate {
  return parseEip712Invalidate({ ...input, typ: OrderType.INVALIDATE });
}

export function buildOnchainDeposit(input: BuildOnchainDepositInput): Eip712OnchainDeposit {
  return parseEip712OnchainDeposit({ ...input, typ: OrderType.ONCHAIN_DEPOSIT });
}

export function buildAgentApproval(input: Eip712AgentApprovalInput): Eip712AgentApproval {
  return parseEip712AgentApproval(input);
}

export interface BuildSignedOrderMessageInput extends Omit<
  ProtocolInput<SignedOrderMessage>,
  "order"
> {
  order: Eip712OrderInput;
}

export interface BuildSignedCancelMessageInput extends Omit<
  ProtocolInput<SignedCancelMessage>,
  "cancel"
> {
  cancel: Eip712CancelInput;
}

export interface BuildSignedClaimMessageInput extends Omit<
  ProtocolInput<SignedClaimMessage>,
  "claim"
> {
  claim: Eip712ClaimInput;
}

export interface BuildSignedDepositMessageInput extends Omit<
  ProtocolInput<SignedDepositMessage>,
  "deposit"
> {
  deposit: Eip712DepositInput;
}

export interface BuildSignedWithdrawalMessageInput extends Omit<
  ProtocolInput<SignedWithdrawalMessage>,
  "withdrawal"
> {
  withdrawal: Eip712WithdrawalInput;
}

export interface BuildSignedApproveAgentMessageInput extends Omit<
  ProtocolInput<SignedApproveAgentMessage>,
  "approval"
> {
  approval: Eip712ApproveAgentInput;
}

export interface BuildSignedRevokeAgentMessageInput extends Omit<
  ProtocolInput<SignedRevokeAgentMessage>,
  "revocation"
> {
  revocation: Eip712RevokeAgentInput;
}

export interface BuildSignedResolutionMessageInput extends Omit<
  ProtocolInput<SignedResolutionMessage>,
  "resolution"
> {
  resolution: Eip712ResolutionInput;
}

export interface BuildSignedPauseMessageInput extends Omit<
  ProtocolInput<SignedPauseMessage>,
  "pause"
> {
  pause: Eip712PauseInput;
}

export interface BuildSignedInvalidateMessageInput extends Omit<
  ProtocolInput<SignedInvalidateMessage>,
  "invalidate"
> {
  invalidate: Eip712InvalidateInput;
}

export function buildSignedOrderMessage(input: BuildSignedOrderMessageInput): SignedOrderMessage {
  return parseSignedOrderMessage(input);
}

export function buildSignedCancelMessage(
  input: BuildSignedCancelMessageInput,
): SignedCancelMessage {
  return parseSignedCancelMessage(input);
}

export function buildSignedClaimMessage(input: BuildSignedClaimMessageInput): SignedClaimMessage {
  return parseSignedClaimMessage(input);
}

export function buildSignedDepositMessage(
  input: BuildSignedDepositMessageInput,
): SignedDepositMessage {
  return parseSignedDepositMessage(input);
}

export function buildSignedWithdrawalMessage(
  input: BuildSignedWithdrawalMessageInput,
): SignedWithdrawalMessage {
  return parseSignedWithdrawalMessage(input);
}

export function buildSignedApproveAgentMessage(
  input: BuildSignedApproveAgentMessageInput,
): SignedApproveAgentMessage {
  return parseSignedApproveAgentMessage(input);
}

export function buildSignedRevokeAgentMessage(
  input: BuildSignedRevokeAgentMessageInput,
): SignedRevokeAgentMessage {
  return parseSignedRevokeAgentMessage(input);
}

export function buildSignedResolutionMessage(
  input: BuildSignedResolutionMessageInput,
): SignedResolutionMessage {
  return parseSignedResolutionMessage(input);
}

export function buildSignedPauseMessage(input: BuildSignedPauseMessageInput): SignedPauseMessage {
  return parseSignedPauseMessage(input);
}

export function buildSignedInvalidateMessage(
  input: BuildSignedInvalidateMessageInput,
): SignedInvalidateMessage {
  return parseSignedInvalidateMessage(input);
}

export function buildOrderJson(input: BuildOrderInput): JsonEip712Order {
  return toJsonEip712Order(buildOrder(input));
}

export function buildCancelJson(input: BuildCancelInput): JsonEip712Cancel {
  return toJsonEip712Cancel(buildCancel(input));
}

export function buildClaimJson(input: BuildClaimInput): JsonEip712Claim {
  return toJsonEip712Claim(buildClaim(input));
}

export function buildDepositJson(input: BuildDepositInput): JsonEip712Deposit {
  return toJsonEip712Deposit(buildDeposit(input));
}

export function buildWithdrawalJson(input: BuildWithdrawalInput): JsonEip712Withdrawal {
  return toJsonEip712Withdrawal(buildWithdrawal(input));
}

export function buildApproveAgentJson(input: BuildApproveAgentInput): JsonEip712ApproveAgent {
  return toJsonEip712ApproveAgent(buildApproveAgent(input));
}

export function buildRevokeAgentJson(input: BuildRevokeAgentInput): JsonEip712RevokeAgent {
  return toJsonEip712RevokeAgent(buildRevokeAgent(input));
}

export function buildResolutionJson(input: BuildResolutionInput): JsonEip712Resolution {
  return toJsonEip712Resolution(buildResolution(input));
}

export function buildPauseJson(input: BuildPauseInput): JsonEip712Pause {
  return toJsonEip712Pause(buildPause(input));
}

export function buildInvalidateJson(input: BuildInvalidateInput): JsonEip712Invalidate {
  return toJsonEip712Invalidate(buildInvalidate(input));
}

export function buildOnchainDepositJson(input: BuildOnchainDepositInput): JsonEip712OnchainDeposit {
  return toJsonEip712OnchainDeposit(buildOnchainDeposit(input));
}

export function buildAgentApprovalJson(input: Eip712AgentApprovalInput): JsonEip712AgentApproval {
  return toJsonEip712AgentApproval(buildAgentApproval(input));
}

export function buildSignedOrderMessageJson(
  input: BuildSignedOrderMessageInput,
): JsonSignedOrderMessage {
  return toJsonSignedOrderMessage(buildSignedOrderMessage(input));
}

export function buildSignedCancelMessageJson(
  input: BuildSignedCancelMessageInput,
): JsonSignedCancelMessage {
  return toJsonSignedCancelMessage(buildSignedCancelMessage(input));
}

export function buildSignedClaimMessageJson(
  input: BuildSignedClaimMessageInput,
): JsonSignedClaimMessage {
  return toJsonSignedClaimMessage(buildSignedClaimMessage(input));
}

export function buildSignedDepositMessageJson(
  input: BuildSignedDepositMessageInput,
): JsonSignedDepositMessage {
  return toJsonSignedDepositMessage(buildSignedDepositMessage(input));
}

export function buildSignedWithdrawalMessageJson(
  input: BuildSignedWithdrawalMessageInput,
): JsonSignedWithdrawalMessage {
  return toJsonSignedWithdrawalMessage(buildSignedWithdrawalMessage(input));
}

export function buildSignedApproveAgentMessageJson(
  input: BuildSignedApproveAgentMessageInput,
): JsonSignedApproveAgentMessage {
  return toJsonSignedApproveAgentMessage(buildSignedApproveAgentMessage(input));
}

export function buildSignedRevokeAgentMessageJson(
  input: BuildSignedRevokeAgentMessageInput,
): JsonSignedRevokeAgentMessage {
  return toJsonSignedRevokeAgentMessage(buildSignedRevokeAgentMessage(input));
}

export function buildSignedResolutionMessageJson(
  input: BuildSignedResolutionMessageInput,
): JsonSignedResolutionMessage {
  return toJsonSignedResolutionMessage(buildSignedResolutionMessage(input));
}

export function buildSignedPauseMessageJson(
  input: BuildSignedPauseMessageInput,
): JsonSignedPauseMessage {
  return toJsonSignedPauseMessage(buildSignedPauseMessage(input));
}

export function buildSignedInvalidateMessageJson(
  input: BuildSignedInvalidateMessageInput,
): JsonSignedInvalidateMessage {
  return toJsonSignedInvalidateMessage(buildSignedInvalidateMessage(input));
}
