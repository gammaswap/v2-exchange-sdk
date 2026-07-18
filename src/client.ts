import { ZeroHash, type Wallet } from "ethers";
import {
  buildApproveAgent,
  buildAgentApproval,
  buildCancel,
  buildClaim,
  buildOrder,
  buildRevokeAgent,
  buildSignedApproveAgentMessage,
  buildSignedApproveAgentMessageJson,
  buildSignedCancelMessage,
  buildSignedCancelMessageJson,
  buildSignedClaimMessage,
  buildSignedClaimMessageJson,
  buildSignedOrderMessage,
  buildSignedOrderMessageJson,
  buildSignedRevokeAgentMessage,
  buildSignedRevokeAgentMessageJson,
  buildSignedWithdrawalMessage,
  buildSignedWithdrawalMessageJson,
  buildWithdrawal,
  type BuildApproveAgentInput,
  type BuildCancelInput,
  type BuildClaimInput,
  type BuildOrderInput,
  type BuildRevokeAgentInput,
  type BuildWithdrawalInput,
} from "./builders.js";
import { SignatureType } from "./constants.js";
import { HttpResponseError, createProtocolValidationError } from "./errors.js";
import {
  CHAIN_ID,
  hashAgentApprovalJS,
  hashApproveAgentOrderJS,
  hashCancelOrderJS,
  hashClaimOrderJS,
  hashFillOrderJS,
  hashRevokeAgentOrderJS,
  hashWithdrawalOrderJS,
} from "./hashing.js";
import {
  getAgentApprovalRequestSchema,
  getAssetRequestSchema,
  getBalanceRequestSchema,
  getBookOrdersRequestSchema,
  getOrderBookRequestSchema,
  getPositionRequestSchema,
  getTopOfBookRequestSchema,
} from "./schemas.js";
import { signOrderJS } from "./signing.js";
import type {
  Address,
  Eip712AgentApproval,
  Eip712AgentApprovalInput,
  GetAgentApprovalRequest,
  GetAssetRequest,
  GetBalanceRequest,
  GetBookOrdersRequest,
  GetOrderBookRequest,
  GetPositionRequest,
  GetTopOfBookRequest,
  JsonSignedApproveAgentMessage,
  JsonSignedCancelMessage,
  JsonSignedClaimMessage,
  JsonSignedOrderMessage,
  JsonSignedRevokeAgentMessage,
  JsonSignedWithdrawalMessage,
  ProtocolBigNumberish,
  ProtocolInput,
} from "./types.js";
import { NonceManager } from "./nonce-manager.js";

export interface HttpResult<T = unknown> {
  status: number;
  data: T;
}

export interface ExchangeActionResult<TRequest, TResponse = unknown> extends HttpResult<TResponse> {
  request: TRequest;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponseLike>;

export interface HttpClientOptions {
  apiUrl: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
}

export type InfoClientOptions = HttpClientOptions;

export interface ExchangeClientOptions extends HttpClientOptions {
  wallet: Wallet;
  chainId?: ProtocolBigNumberish;
  infoClient?: InfoClient;
  nonceManager?: NonceManager;
}

type DefaultSignerFields = "signer" | "signatureType" | "sender";
type AgentSignerFields = "signer" | "signatureType";

export type PlaceOrderInput = Omit<BuildOrderInput, DefaultSignerFields> &
  Partial<Pick<BuildOrderInput, DefaultSignerFields>>;

export type PlaceAgentOrderInput = Omit<BuildOrderInput, AgentSignerFields | "approvalNonce"> &
  Partial<Pick<BuildOrderInput, AgentSignerFields | "approvalNonce">>;

export type CancelOrderInput = Omit<BuildCancelInput, DefaultSignerFields> &
  Partial<Pick<BuildCancelInput, DefaultSignerFields>>;

export type CancelAllInput = Omit<CancelOrderInput, "orderHash">;

export type CancelAgentOrderInput = Omit<BuildCancelInput, AgentSignerFields | "approvalNonce"> &
  Partial<Pick<BuildCancelInput, AgentSignerFields | "approvalNonce">>;

export type CancelAllAgentInput = Omit<CancelAgentOrderInput, "orderHash">;

export type ClaimInput = Omit<BuildClaimInput, DefaultSignerFields> &
  Partial<Pick<BuildClaimInput, DefaultSignerFields>>;

export type AgentClaimInput = Omit<BuildClaimInput, AgentSignerFields | "approvalNonce"> &
  Partial<Pick<BuildClaimInput, AgentSignerFields | "approvalNonce">>;

export type WithdrawalInput = Omit<BuildWithdrawalInput, DefaultSignerFields> &
  Partial<Pick<BuildWithdrawalInput, DefaultSignerFields>>;

export type ApproveAgentInput = Omit<
  BuildApproveAgentInput,
  "signer" | "signatureType" | "sender" | "approvalSignature"
> &
  Partial<
    Pick<BuildApproveAgentInput, "signer" | "signatureType" | "sender" | "approvalSignature">
  >;

export type RevokeAgentInput = Omit<BuildRevokeAgentInput, DefaultSignerFields> &
  Partial<Pick<BuildRevokeAgentInput, DefaultSignerFields>>;

interface AgentStatusResponse {
  nonce: ProtocolBigNumberish;
}

const UINT32_MAX = 2n ** 32n - 1n;
const DECIMAL_STRING_PATTERN = /^(0|[1-9][0-9]*)$/;

export class InfoClient {
  readonly apiUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly headers: Record<string, string>;

  constructor(options: InfoClientOptions) {
    this.apiUrl = normalizeApiUrl(options.apiUrl);
    this.fetchFn = options.fetch ?? defaultFetch;
    this.headers = options.headers ?? {};
  }

  async getAsset(
    input: ProtocolInput<GetAssetRequest> | ProtocolBigNumberish,
  ): Promise<HttpResult> {
    const request = getAssetRequestSchema.parse(
      typeof input === "object" && input !== null ? input : { assetId: input },
    );
    return this.get(`/asset/${encodePathSegment(request.assetId)}`);
  }

  async getBalance(input: ProtocolInput<GetBalanceRequest> | Address): Promise<HttpResult> {
    const request = getBalanceRequestSchema.parse(
      typeof input === "string" ? { account: input } : input,
    );
    return this.get(`/balance/${encodePathSegment(request.account)}`);
  }

  async getOrderBook(input: ProtocolInput<GetOrderBookRequest>): Promise<HttpResult> {
    const request = getOrderBookRequestSchema.parse(input);
    return this.get(
      `/book/${encodePathSegment(request.assetId)}/${encodePathSegment(request.epoch)}`,
    );
  }

  async getBookOrders(input: ProtocolInput<GetBookOrdersRequest>): Promise<HttpResult> {
    const request = getBookOrdersRequestSchema.parse(input);
    return this.get(
      `/book/${encodePathSegment(request.assetId)}/${encodePathSegment(
        request.epoch,
      )}/${encodePathSegment(request.account)}`,
    );
  }

  async getTopOfBook(input: ProtocolInput<GetTopOfBookRequest>): Promise<HttpResult> {
    const request = getTopOfBookRequestSchema.parse(input);
    return this.get(
      `/book/market/top/${encodePathSegment(request.assetId)}/${encodePathSegment(request.epoch)}`,
    );
  }

  async getPosition(input: ProtocolInput<GetPositionRequest>): Promise<HttpResult> {
    const request = getPositionRequestSchema.parse(input);
    return this.get(
      `/position/${encodePathSegment(request.account)}/${encodePathSegment(
        request.assetId,
      )}/${encodePathSegment(request.epoch)}`,
    );
  }

  async getAgentApproval(
    input: ProtocolInput<GetAgentApprovalRequest> | Address,
  ): Promise<HttpResult> {
    const request = getAgentApprovalRequestSchema.parse(
      typeof input === "string" ? { account: input } : input,
    );
    return this.get(`/agents/status/${encodePathSegment(request.account)}`);
  }

  async getAgentApprovalNonce(
    input: ProtocolInput<GetAgentApprovalRequest> | Address,
  ): Promise<bigint> {
    const response = await this.getAgentApproval(input);
    const status = parseAgentStatusResponse(response.data);
    return BigInt(status.nonce);
  }

  private async get(path: string): Promise<HttpResult> {
    const response = await this.fetchFn(buildUrl(this.apiUrl, path), {
      method: "GET",
      headers: this.headers,
    });
    return readHttpResult(response);
  }
}

export class ExchangeClient {
  readonly apiUrl: string;
  readonly wallet: Wallet;
  readonly info: InfoClient;
  private readonly fetchFn: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly chainId: ProtocolBigNumberish;
  private readonly nonceManager: NonceManager;

  constructor(options: ExchangeClientOptions) {
    this.apiUrl = normalizeApiUrl(options.apiUrl);
    this.wallet = options.wallet;
    this.fetchFn = options.fetch ?? defaultFetch;
    this.headers = options.headers ?? {};
    this.chainId = options.chainId ?? CHAIN_ID;
    this.info =
      options.infoClient ??
      new InfoClient({
        apiUrl: this.apiUrl,
        fetch: this.fetchFn,
        headers: this.headers,
      });
    this.nonceManager = options.nonceManager ?? new NonceManager();
  }

  async placeOrder(input: PlaceOrderInput): Promise<ExchangeActionResult<JsonSignedOrderMessage>> {
    const order = buildOrder({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.EOA,
      sender: input.sender ?? this.wallet.address,
    });
    const orderHash = hashFillOrderJS(order);
    const message = buildSignedOrderMessage({
      order,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedOrderMessageJson(message);
    const response = await this.post("/orders", request);
    return { ...response, request };
  }

  async placeAgentOrder(
    input: PlaceAgentOrderInput,
  ): Promise<ExchangeActionResult<JsonSignedOrderMessage>> {
    const approvalNonce =
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender));
    const order = buildOrder({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.AGENT,
      approvalNonce,
    });
    const orderHash = hashFillOrderJS(order);
    const message = buildSignedOrderMessage({
      order,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedOrderMessageJson(message);
    const response = await this.post("/orders", request);
    return { ...response, request };
  }

  async cancelOrder(
    input: CancelOrderInput,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    return this.signAndPostCancel({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.EOA,
      sender: input.sender ?? this.wallet.address,
    });
  }

  async cancelAll(input: CancelAllInput): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    return this.cancelOrder({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      orderHash: ZeroHash
    });
  }

  async cancelAgentOrder(
    input: CancelAgentOrderInput,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    const approvalNonce =
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender));
    return this.signAndPostCancel({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.AGENT,
      approvalNonce,
    });
  }

  async cancelAllAgent(
    input: CancelAllAgentInput,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    return this.cancelAgentOrder({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      orderHash: ZeroHash
    });
  }

  async claim(input: ClaimInput): Promise<ExchangeActionResult<JsonSignedClaimMessage>> {
    return this.signAndPostClaim({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.EOA,
      sender: input.sender ?? this.wallet.address,
    });
  }

  async claimAgent(input: AgentClaimInput): Promise<ExchangeActionResult<JsonSignedClaimMessage>> {
    const approvalNonce =
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender));
    return this.signAndPostClaim({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.AGENT,
      approvalNonce,
    });
  }

  async withdraw(
    input: WithdrawalInput,
  ): Promise<ExchangeActionResult<JsonSignedWithdrawalMessage>> {
    const withdrawal = buildWithdrawal({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.EOA,
      sender: input.sender ?? this.wallet.address,
    });
    const orderHash = hashWithdrawalOrderJS(withdrawal);
    const message = buildSignedWithdrawalMessage({
      withdrawal,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedWithdrawalMessageJson(message);
    const response = await this.post("/withdrawals", request);
    return { ...response, request };
  }

  async approveAgent(
    input: ApproveAgentInput,
  ): Promise<ExchangeActionResult<JsonSignedApproveAgentMessage>> {
    const sender = input.sender ?? this.wallet.address;
    const approvalSignature =
      input.approvalSignature ??
      this.signAgentApproval({
        master: sender,
        agent: input.agent,
        approvalNonce: input.approvalNonce,
        approvalSignature: "0x",
      });
    const approval = buildApproveAgent({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.EOA,
      sender,
      approvalSignature,
    });
    const orderHash = hashApproveAgentOrderJS(approval);
    const message = buildSignedApproveAgentMessage({
      approval,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedApproveAgentMessageJson(message);
    const response = await this.post("/agents/approve", request);
    return { ...response, request };
  }

  async revokeAgent(
    input: RevokeAgentInput,
  ): Promise<ExchangeActionResult<JsonSignedRevokeAgentMessage>> {
    const revocation = buildRevokeAgent({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: input.signer ?? this.wallet.address,
      signatureType: input.signatureType ?? SignatureType.EOA,
      sender: input.sender ?? this.wallet.address,
    });
    const orderHash = hashRevokeAgentOrderJS(revocation);
    const message = buildSignedRevokeAgentMessage({
      revocation,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedRevokeAgentMessageJson(message);
    const response = await this.post("/agents/revoke", request);
    return { ...response, request };
  }

  signAgentApproval(approval: Eip712AgentApprovalInput): string {
    const parsedApproval: Eip712AgentApproval = buildAgentApproval(approval);
    const approvalHash = hashAgentApprovalJS(parsedApproval);
    return signOrderJS(approvalHash, this.wallet);
  }

  private async signAndPostCancel(
    input: BuildCancelInput,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    const cancel = buildCancel(input);
    const orderHash = hashCancelOrderJS(cancel);
    const message = buildSignedCancelMessage({
      cancel,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedCancelMessageJson(message);
    const response = await this.post("/cancels", request);
    return { ...response, request };
  }

  private async signAndPostClaim(
    input: BuildClaimInput,
  ): Promise<ExchangeActionResult<JsonSignedClaimMessage>> {
    const claim = buildClaim(input);
    const orderHash = hashClaimOrderJS(claim);
    const message = buildSignedClaimMessage({
      claim,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedClaimMessageJson(message);
    const response = await this.post("/claim", request);
    return { ...response, request };
  }

  private async post(path: string, body: unknown): Promise<HttpResult> {
    const response = await this.fetchFn(buildUrl(this.apiUrl, path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(body),
    });
    return readHttpResult(response);
  }
}

export function createInfoClient(options: InfoClientOptions): InfoClient {
  return new InfoClient(options);
}

export function createExchangeClient(options: ExchangeClientOptions): ExchangeClient {
  return new ExchangeClient(options);
}

function normalizeApiUrl(apiUrl: string): string {
  if (apiUrl.trim() === "") {
    throw createProtocolValidationError("invalid_value", "$.apiUrl", "apiUrl is required");
  }

  return apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
}

function buildUrl(apiUrl: string, path: string): string {
  return new URL(path.replace(/^\//u, ""), apiUrl).toString();
}

function encodePathSegment(value: string | bigint): string {
  return encodeURIComponent(value.toString());
}

const defaultFetch: FetchLike = async (url, init) => {
  return fetch(url, init);
};

async function readHttpResult(response: FetchResponseLike): Promise<HttpResult> {
  const data = await readResponseData(response);

  if (!response.ok) {
    throw new HttpResponseError(response.status, response.statusText, data);
  }

  return {
    status: response.status,
    data,
  };
}

async function readResponseData(response: FetchResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    const text = await response.text();
    return text === "" ? undefined : text;
  }
}

function parseAgentStatusResponse(data: unknown): AgentStatusResponse {
  if (typeof data !== "object" || data === null || !("nonce" in data)) {
    throw createProtocolValidationError(
      "missing_field",
      "$.nonce",
      "agent status response must include nonce",
    );
  }

  const nonce = data.nonce;
  if (typeof nonce !== "string" && typeof nonce !== "bigint") {
    throw createProtocolValidationError(
      "invalid_type",
      "$.nonce",
      "agent status nonce must be a bigint or decimal string",
    );
  }

  if (typeof nonce === "string" && !DECIMAL_STRING_PATTERN.test(nonce)) {
    throw createProtocolValidationError(
      "invalid_decimal_string",
      "$.nonce",
      "agent status nonce must be a canonical unsigned decimal string",
    );
  }

  const value = BigInt(nonce);
  if (value < 0n || value > UINT32_MAX) {
    throw createProtocolValidationError(
      "integer_out_of_range",
      "$.nonce",
      `agent status nonce must be in range 0..${UINT32_MAX.toString()}`,
    );
  }

  return { nonce: value };
}
