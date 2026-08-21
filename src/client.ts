import { ZeroHash, type TypedDataDomain, type Wallet } from "ethers";
import {
  buildApproveAgent,
  buildAgentApproval,
  buildCancel,
  buildCancelReplace,
  buildClaim,
  buildOrder,
  buildRevokeAgent,
  buildSignedApproveAgentMessage,
  buildSignedApproveAgentMessageJson,
  buildSignedCancelMessage,
  buildSignedCancelMessageJson,
  buildSignedCancelReplaceMessage,
  buildSignedCancelReplaceMessageJson,
  buildSignedClaimMessage,
  buildSignedClaimMessageJson,
  buildSignedOrderMessage,
  buildSignedOrderMessageJson,
  buildSignedRevokeAgentMessage,
  buildSignedRevokeAgentMessageJson,
  buildSignedWithdrawalMessage,
  buildSignedWithdrawalMessageJson,
  buildWithdrawal,
  type BuildCancelInput,
  type BuildCancelReplaceInput,
  type BuildClaimInput,
} from "./builders.js";
import { SignatureType, TimeInForce } from "./constants.js";
import { getDefaultExchangeChainConfig } from "./config.js";
import { parsePositiveAmountInput, parsePriceInput, parseSizeInput } from "./decimal-inputs.js";
import {
  HttpAbortError,
  HttpResponseError,
  HttpTimeoutError,
  createProtocolValidationError,
} from "./errors.js";
import {
  getExchangeDomain,
  hashAgentApprovalJS,
  hashApproveAgentOrderJS,
  hashCancelReplaceOrderJS,
  hashCancelOrderJS,
  hashClaimOrderJS,
  hashFillOrderJS,
  hashRevokeAgentOrderJS,
  hashWithdrawalOrderJS,
} from "./hashing.js";
import {
  getAgentApprovalRequestSchema,
  getAssetRequestSchema,
  getAssetAtEpochRequestSchema,
  parseAssetSnapshot,
  parseAgentApprovalResponse,
  parseBalanceResponse,
  parseBookOrdersResponse,
  parseClaimableResponse,
  parseHealthResponse,
  parseMarkPriceResponse,
  parseOrderBookResponse,
  parsePositionResponse,
  parseResolutionPriceResponse,
  parseSettlementPriceResponse,
  parseTopOfBookResponse,
  getBalanceRequestSchema,
  getBookOrdersRequestSchema,
  getExchangeConfigRequestSchema,
  getLastResolutionPriceRequestSchema,
  getOrderBookRequestSchema,
  getPositionRequestSchema,
  getClaimableRequestSchema,
  getMarkPriceRequestSchema,
  getSettlementPriceRequestSchema,
  getResolutionPriceRequestSchema,
  getTopOfBookRequestSchema,
  parseExchangeChainConfig,
  parseExchangeContracts,
  toJsonExchangeChainConfig,
} from "./schemas.js";
import { signOrderJS } from "./signing.js";
import { UINT32_MAX, parsePositiveIntegerOption, parseUnsignedInteger } from "./integer-inputs.js";
import { sameAddress } from "./string-inputs.js";
import type {
  Address,
  Eip712AgentApproval,
  ExchangeContracts,
  ExchangeContractsInput,
  GetAgentApprovalRequest,
  GetAssetRequest,
  GetAssetAtEpochRequest,
  GetBalanceRequest,
  GetBookOrdersRequest,
  GetExchangeConfigRequest,
  GetLastResolutionPriceRequest,
  GetOrderBookRequest,
  GetPositionRequest,
  GetClaimableRequest,
  GetMarkPriceRequest,
  GetSettlementPriceRequest,
  GetResolutionPriceRequest,
  GetTopOfBookRequest,
  JsonExchangeChainConfig,
  AssetSnapshot,
  AgentApprovalResponse,
  BalanceResponse,
  BookOrdersResponse,
  ClaimableResponse,
  HealthResponse,
  MarkPriceResponse,
  OrderBookResponse,
  PositionResponse,
  ResolutionPriceResponse,
  SettlementPriceResponse,
  TopOfBookResponse,
  JsonSignedApproveAgentMessage,
  JsonSignedCancelMessage,
  JsonSignedCancelReplaceMessage,
  JsonSignedClaimMessage,
  JsonSignedOrderMessage,
  JsonSignedRevokeAgentMessage,
  JsonSignedWithdrawalMessage,
  ProtocolBigNumberish,
  ProtocolInput,
  PlaceOrderInput,
  PlaceAgentOrderInput,
  CancelOrderInput,
  CancelAllInput,
  CancelReplaceOrderInput,
  CancelAgentOrderInput,
  CancelReplaceAgentOrderInput,
  CancelAllAgentInput,
  ClaimInput,
  AgentClaimInput,
  WithdrawalInput,
  ApproveAgentInput,
  RevokeAgentInput,
  AgentApprovalInput,
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
  timeoutMs?: number;
}

export interface HttpRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type InfoClientOptions = HttpClientOptions;

export interface ExchangeClientOptions extends HttpClientOptions {
  wallet: Wallet;
  chainId: ProtocolBigNumberish;
  contracts?: ExchangeContractsInput;
  infoClient?: InfoClient;
  nonceManager?: NonceManager;
}

type ExactInput<Allowed, Actual extends Allowed> = Actual &
  Record<Exclude<keyof Actual, keyof Allowed>, never>;

interface AgentStatusResponse {
  nonce: ProtocolBigNumberish;
}

interface ResolvedExchangeClientConfig {
  chainId: bigint;
  contracts: ExchangeContracts;
}

interface CancelReplaceSigningInput extends Omit<BuildCancelReplaceInput, "replacementOrderHash"> {
  replacementNonce: ProtocolBigNumberish;
  side: boolean;
  price: ProtocolBigNumberish;
  size: ProtocolBigNumberish;
  timeInForce: ProtocolBigNumberish;
}

const MIN_AGENT_ACTION_APPROVAL_NONCE = 1_780_272_000n;
const APPROVE_AGENT_MIN_FUTURE_SECONDS = 10n;
const APPROVE_AGENT_MAX_FUTURE_SECONDS = 5n * 60n;
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

export class InfoClient {
  readonly apiUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: InfoClientOptions) {
    this.apiUrl = normalizeApiUrl(options.apiUrl);
    this.fetchFn = options.fetch ?? defaultFetch;
    this.headers = options.headers ?? {};
    this.timeoutMs = parseHttpTimeout(options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS, "$.timeoutMs");
  }

  async getHealth(options?: HttpRequestOptions): Promise<HttpResult<HealthResponse>> {
    const response = await this.get("/health", options);
    return { ...response, data: parseHealthResponse(response.data) };
  }

  async getAsset(
    input: ProtocolInput<GetAssetRequest> | ProtocolBigNumberish,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<AssetSnapshot>> {
    const request = getAssetRequestSchema.parse(
      typeof input === "object" && input !== null ? input : { assetId: input },
    );
    const response = await this.get(`/asset/${encodePathSegment(request.assetId)}`, options);
    return { ...response, data: parseAssetSnapshot(response.data) };
  }

  async getAssetAtEpoch(
    input: ProtocolInput<GetAssetAtEpochRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<AssetSnapshot>> {
    const request = getAssetAtEpochRequestSchema.parse(input);
    const response = await this.get(
      `/asset/${encodePathSegment(request.assetId)}/${encodePathSegment(request.epoch)}`,
      options,
    );
    return { ...response, data: parseAssetSnapshot(response.data) };
  }

  async getResolutionPrice(
    input: ProtocolInput<GetResolutionPriceRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<ResolutionPriceResponse>> {
    const request = getResolutionPriceRequestSchema.parse(input);
    const response = await this.get(
      `/resolve/${encodePathSegment(request.assetId)}/${encodePathSegment(request.epoch)}`,
      options,
    );
    return { ...response, data: parseResolutionPriceResponse(response.data) };
  }

  async getLastResolutionPrice(
    input: ProtocolInput<GetLastResolutionPriceRequest> | ProtocolBigNumberish,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<ResolutionPriceResponse>> {
    const request = getLastResolutionPriceRequestSchema.parse(
      typeof input === "object" && input !== null ? input : { assetId: input },
    );
    const response = await this.get(
      `/resolve/last/epoch/${encodePathSegment(request.assetId)}`,
      options,
    );
    return { ...response, data: parseResolutionPriceResponse(response.data) };
  }

  async getBalance(
    input: ProtocolInput<GetBalanceRequest> | Address,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<BalanceResponse>> {
    const request = getBalanceRequestSchema.parse(
      typeof input === "string" ? { account: input } : input,
    );
    const response = await this.get(`/balance/${encodePathSegment(request.account)}`, options);
    return { ...response, data: parseBalanceResponse(response.data) };
  }

  async getOrderBook(
    input: ProtocolInput<GetOrderBookRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<OrderBookResponse>> {
    const request = getOrderBookRequestSchema.parse(input);
    const response = await this.get(
      `/book/${encodePathSegment(request.assetId)}/${encodePathSegment(request.epoch)}`,
      options,
    );
    return { ...response, data: parseOrderBookResponse(response.data) };
  }

  async getBookOrders(
    input: ProtocolInput<GetBookOrdersRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<BookOrdersResponse>> {
    const request = getBookOrdersRequestSchema.parse(input);
    const response = await this.get(
      `/book/${encodePathSegment(request.assetId)}/${encodePathSegment(
        request.epoch,
      )}/${encodePathSegment(request.account)}`,
      options,
    );
    return { ...response, data: parseBookOrdersResponse(response.data) };
  }

  async getTopOfBook(
    input: ProtocolInput<GetTopOfBookRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<TopOfBookResponse>> {
    const request = getTopOfBookRequestSchema.parse(input);
    const response = await this.get(
      `/book/market/top/${encodePathSegment(request.assetId)}/${encodePathSegment(request.epoch)}`,
      options,
    );
    return { ...response, data: parseTopOfBookResponse(response.data) };
  }

  async getPosition(
    input: ProtocolInput<GetPositionRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<PositionResponse>> {
    const request = getPositionRequestSchema.parse(input);
    const response = await this.get(
      `/position/${encodePathSegment(request.account)}/${encodePathSegment(
        request.assetId,
      )}/${encodePathSegment(request.epoch)}`,
      options,
    );
    return { ...response, data: parsePositionResponse(response.data) };
  }

  async getClaimable(
    input: ProtocolInput<GetClaimableRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<ClaimableResponse>> {
    const request = getClaimableRequestSchema.parse(input);
    const response = await this.get(
      `/claim/${encodePathSegment(request.assetId)}/${encodePathSegment(
        request.epoch,
      )}/${encodePathSegment(request.account)}`,
      options,
    );
    return { ...response, data: parseClaimableResponse(response.data) };
  }

  async getMarkPrice(
    input: ProtocolInput<GetMarkPriceRequest> | ProtocolBigNumberish,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<MarkPriceResponse>> {
    const request = getMarkPriceRequestSchema.parse(
      typeof input === "object" && input !== null ? input : { assetId: input },
    );
    const response = await this.get(`/resolve/mark/${encodePathSegment(request.assetId)}`, options);
    return { ...response, data: parseMarkPriceResponse(response.data) };
  }

  async getSettlementPrice(
    input: ProtocolInput<GetSettlementPriceRequest>,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<SettlementPriceResponse>> {
    const request = getSettlementPriceRequestSchema.parse(input);
    const response = await this.get(
      `/resolve/settlement/${encodePathSegment(request.assetId)}/${encodePathSegment(
        request.epoch,
      )}`,
      options,
    );
    return { ...response, data: parseSettlementPriceResponse(response.data) };
  }

  async getAgentApproval(
    input: ProtocolInput<GetAgentApprovalRequest> | Address,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<AgentApprovalResponse>> {
    const request = getAgentApprovalRequestSchema.parse(
      typeof input === "string" ? { account: input } : input,
    );
    const response = await this.get(
      `/agents/status/${encodePathSegment(request.account)}`,
      options,
    );
    return { ...response, data: parseAgentApprovalResponse(response.data) };
  }

  async getAgentApprovalNonce(
    input: ProtocolInput<GetAgentApprovalRequest> | Address,
    options?: HttpRequestOptions,
  ): Promise<bigint> {
    const response = await this.getAgentApproval(input, options);
    const status = parseAgentStatusResponse(response.data);
    return BigInt(status.nonce);
  }

  async getExchangeConfig(
    input: ProtocolInput<GetExchangeConfigRequest> | ProtocolBigNumberish,
    options?: HttpRequestOptions,
  ): Promise<HttpResult<JsonExchangeChainConfig>> {
    const request = getExchangeConfigRequestSchema.parse(
      typeof input === "object" && input !== null ? input : { chainId: input },
    );
    const response = await this.get(
      `/config/chains/${encodePathSegment(request.chainId)}`,
      options,
    );
    const config = parseExchangeChainConfig(response.data);
    return { ...response, data: toJsonExchangeChainConfig(config) };
  }

  private async get(path: string, options?: HttpRequestOptions): Promise<HttpResult> {
    return requestWithOptions(
      this.fetchFn,
      buildUrl(this.apiUrl, path),
      {
        method: "GET",
        headers: this.headers,
      },
      this.timeoutMs,
      readHttpResult,
      options,
    );
  }
}

export class ExchangeClient {
  readonly apiUrl: string;
  readonly wallet: Wallet;
  readonly info: InfoClient;
  private readonly fetchFn: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly chainId: bigint;
  private readonly contracts: ExchangeContracts;
  private readonly exchangeDomain: TypedDataDomain;
  private readonly nonceManager: NonceManager;

  constructor(options: ExchangeClientOptions) {
    const config = resolveExchangeClientConfig(options);

    this.apiUrl = normalizeApiUrl(options.apiUrl);
    this.wallet = options.wallet;
    this.fetchFn = options.fetch ?? defaultFetch;
    this.headers = options.headers ?? {};
    this.timeoutMs = parseHttpTimeout(options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS, "$.timeoutMs");
    this.chainId = config.chainId;
    this.contracts = config.contracts;
    this.exchangeDomain = getExchangeDomain(this.chainId, this.contracts.exchange);
    this.info =
      options.infoClient ??
      new InfoClient({
        apiUrl: this.apiUrl,
        fetch: this.fetchFn,
        headers: this.headers,
        timeoutMs: this.timeoutMs,
      });
    this.nonceManager = options.nonceManager ?? new NonceManager();
  }

  async placeOrder<const TInput extends PlaceOrderInput>(
    input: ExactInput<PlaceOrderInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedOrderMessage>> {
    const order = buildOrder({
      ...input,
      price: parsePriceInput(input.price),
      size: parseSizeInput(input.size),
      timeInForce: input.timeInForce ?? TimeInForce.GTC,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: this.wallet.address,
      signatureType: SignatureType.EOA,
      sender: this.wallet.address,
      approvalNonce: 0n,
    });
    const orderHash = hashFillOrderJS(order, this.exchangeDomain);
    const message = buildSignedOrderMessage({
      order,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedOrderMessageJson(message);
    const response = await this.post("/orders", request, options);
    return { ...response, request };
  }

  async placeAgentOrder<const TInput extends PlaceAgentOrderInput>(
    input: ExactInput<PlaceAgentOrderInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedOrderMessage>> {
    const approvalNonce = parseAgentActionApprovalNonce(
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender, options)),
    );
    const order = buildOrder({
      ...input,
      price: parsePriceInput(input.price),
      size: parseSizeInput(input.size),
      timeInForce: input.timeInForce ?? TimeInForce.GTC,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: this.wallet.address,
      signatureType: SignatureType.AGENT,
      approvalNonce,
    });
    const orderHash = hashFillOrderJS(order, this.exchangeDomain);
    const message = buildSignedOrderMessage({
      order,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedOrderMessageJson(message);
    const response = await this.post("/orders", request, options);
    return { ...response, request };
  }

  async cancelOrder<const TInput extends CancelOrderInput>(
    input: ExactInput<CancelOrderInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    return this.signAndPostCancel(
      {
        ...input,
        nonce: input.nonce ?? this.nonceManager.next(),
        signer: this.wallet.address,
        signatureType: SignatureType.EOA,
        sender: this.wallet.address,
        approvalNonce: 0n,
      },
      options,
    );
  }

  async cancelAll<const TInput extends CancelAllInput>(
    input: ExactInput<CancelAllInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    return this.cancelOrder(
      {
        ...input,
        nonce: input.nonce ?? this.nonceManager.next(),
        orderHash: ZeroHash,
      },
      options,
    );
  }

  async cancelReplaceOrder<const TInput extends CancelReplaceOrderInput>(
    input: ExactInput<CancelReplaceOrderInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelReplaceMessage>> {
    assertNonZeroCancelReplaceHash(input.cancelOrderHash);

    return this.signAndPostCancelReplace(
      {
        ...input,
        price: parsePriceInput(input.price),
        size: parseSizeInput(input.size),
        timeInForce: input.timeInForce ?? TimeInForce.GTC,
        replacementNonce: input.replacementNonce ?? this.nonceManager.next(),
        nonce: input.nonce ?? this.nonceManager.next(),
        signer: this.wallet.address,
        signatureType: SignatureType.EOA,
        sender: this.wallet.address,
        approvalNonce: 0n,
        allOrNothing: input.allOrNothing ?? false,
      },
      options,
    );
  }

  async cancelAgentOrder<const TInput extends CancelAgentOrderInput>(
    input: ExactInput<CancelAgentOrderInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    const approvalNonce = parseAgentActionApprovalNonce(
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender, options)),
    );
    return this.signAndPostCancel(
      {
        ...input,
        nonce: input.nonce ?? this.nonceManager.next(),
        signer: this.wallet.address,
        signatureType: SignatureType.AGENT,
        approvalNonce,
      },
      options,
    );
  }

  async cancelAllAgent<const TInput extends CancelAllAgentInput>(
    input: ExactInput<CancelAllAgentInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    return this.cancelAgentOrder(
      {
        ...input,
        nonce: input.nonce ?? this.nonceManager.next(),
        orderHash: ZeroHash,
      },
      options,
    );
  }

  async cancelReplaceAgentOrder<const TInput extends CancelReplaceAgentOrderInput>(
    input: ExactInput<CancelReplaceAgentOrderInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelReplaceMessage>> {
    assertNonZeroCancelReplaceHash(input.cancelOrderHash);

    const approvalNonce = parseAgentActionApprovalNonce(
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender, options)),
    );
    return this.signAndPostCancelReplace(
      {
        ...input,
        price: parsePriceInput(input.price),
        size: parseSizeInput(input.size),
        timeInForce: input.timeInForce ?? TimeInForce.GTC,
        replacementNonce: input.replacementNonce ?? this.nonceManager.next(),
        nonce: input.nonce ?? this.nonceManager.next(),
        signer: this.wallet.address,
        signatureType: SignatureType.AGENT,
        approvalNonce,
        allOrNothing: input.allOrNothing ?? false,
      },
      options,
    );
  }

  async claim<const TInput extends ClaimInput>(
    input: ExactInput<ClaimInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedClaimMessage>> {
    return this.signAndPostClaim(
      {
        ...input,
        nonce: input.nonce ?? this.nonceManager.next(),
        signer: this.wallet.address,
        signatureType: SignatureType.EOA,
        sender: this.wallet.address,
        approvalNonce: 0n,
      },
      options,
    );
  }

  async claimAgent<const TInput extends AgentClaimInput>(
    input: ExactInput<AgentClaimInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedClaimMessage>> {
    const approvalNonce = parseAgentActionApprovalNonce(
      input.approvalNonce ?? (await this.info.getAgentApprovalNonce(input.sender, options)),
    );
    return this.signAndPostClaim(
      {
        ...input,
        nonce: input.nonce ?? this.nonceManager.next(),
        signer: this.wallet.address,
        signatureType: SignatureType.AGENT,
        approvalNonce,
      },
      options,
    );
  }

  async withdraw<const TInput extends WithdrawalInput>(
    input: ExactInput<WithdrawalInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedWithdrawalMessage>> {
    const withdrawal = buildWithdrawal({
      ...input,
      amount: parsePositiveAmountInput(input.amount),
      receiver: input.receiver ?? this.wallet.address,
      ledger: this.contracts.ledger,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: this.wallet.address,
      signatureType: SignatureType.EOA,
      sender: this.wallet.address,
    });
    const orderHash = hashWithdrawalOrderJS(withdrawal, this.exchangeDomain);
    const message = buildSignedWithdrawalMessage({
      withdrawal,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedWithdrawalMessageJson(message);
    const response = await this.post("/withdrawals", request, options);
    return { ...response, request };
  }

  async approveAgent<const TInput extends ApproveAgentInput>(
    input: ExactInput<ApproveAgentInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedApproveAgentMessage>> {
    const sender = this.wallet.address;
    const approvalNonce = parseApproveAgentApprovalNonce(
      input.approvalNonce ??
        BigInt(Date.now() + 120 * 1000 + Math.floor(Math.random() * 100 * 1000)) / 1000n,
    );
    if (sameAddress(input.agent, sender)) {
      throw createProtocolValidationError(
        "invalid_value",
        "$.agent",
        "agent must be different from master",
      );
    }
    const approvalSignature = this.signAgentApproval({
      master: sender,
      agent: input.agent,
      approvalNonce,
    });
    const approval = buildApproveAgent({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: this.wallet.address,
      signatureType: SignatureType.EOA,
      sender,
      approvalSignature,
      approvalNonce,
    });
    const orderHash = hashApproveAgentOrderJS(approval, this.exchangeDomain);
    const message = buildSignedApproveAgentMessage({
      approval,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedApproveAgentMessageJson(message);
    const response = await this.post("/agents/approve", request, options);
    return { ...response, request };
  }

  async revokeAgent<const TInput extends RevokeAgentInput>(
    input: ExactInput<RevokeAgentInput, TInput>,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedRevokeAgentMessage>> {
    const revocation = buildRevokeAgent({
      ...input,
      nonce: input.nonce ?? this.nonceManager.next(),
      signer: this.wallet.address,
      signatureType: SignatureType.EOA,
      sender: this.wallet.address,
    });
    const orderHash = hashRevokeAgentOrderJS(revocation, this.exchangeDomain);
    const message = buildSignedRevokeAgentMessage({
      revocation,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedRevokeAgentMessageJson(message);
    const response = await this.post("/agents/revoke", request, options);
    return { ...response, request };
  }

  signAgentApproval(approval: AgentApprovalInput): string {
    const parsedApproval: Eip712AgentApproval = buildAgentApproval(approval);
    const approvalHash = hashAgentApprovalJS(parsedApproval, this.exchangeDomain);
    return signOrderJS(approvalHash, this.wallet);
  }

  private async signAndPostCancel(
    input: BuildCancelInput,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelMessage>> {
    const cancel = buildCancel(input);
    const orderHash = hashCancelOrderJS(cancel, this.exchangeDomain);
    const message = buildSignedCancelMessage({
      cancel,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedCancelMessageJson(message);
    const response = await this.post("/cancels", request, options);
    return { ...response, request };
  }

  private async signAndPostCancelReplace(
    input: CancelReplaceSigningInput,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedCancelReplaceMessage>> {
    const replacement = buildOrder({
      nonce: input.replacementNonce,
      signer: input.signer,
      signatureType: input.signatureType,
      sender: input.sender,
      epoch: input.epoch,
      side: input.side,
      assetId: input.assetId,
      size: input.size,
      price: input.price,
      timeInForce: input.timeInForce,
      approvalNonce: input.approvalNonce,
    });
    const replacementOrderHash = hashFillOrderJS(replacement, this.exchangeDomain);
    const replacementSignature = signOrderJS(replacementOrderHash, this.wallet);
    const cancelReplace = buildCancelReplace({
      nonce: input.nonce,
      signer: input.signer,
      signatureType: input.signatureType,
      sender: input.sender,
      assetId: input.assetId,
      epoch: input.epoch,
      cancelOrderHash: input.cancelOrderHash,
      replacementOrderHash,
      approvalNonce: input.approvalNonce,
      allOrNothing: input.allOrNothing,
    });
    const orderHash = hashCancelReplaceOrderJS(cancelReplace, this.exchangeDomain);
    const message = buildSignedCancelReplaceMessage({
      cancelReplace,
      replacement,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
      replacementOrderHash,
      replacementSignature,
    });
    const request = buildSignedCancelReplaceMessageJson(message);
    const response = await this.post("/cancel-replace", request, options);
    return { ...response, request };
  }

  private async signAndPostClaim(
    input: BuildClaimInput,
    options?: HttpRequestOptions,
  ): Promise<ExchangeActionResult<JsonSignedClaimMessage>> {
    const claim = buildClaim(input);
    const orderHash = hashClaimOrderJS(claim, this.exchangeDomain);
    const message = buildSignedClaimMessage({
      claim,
      chainId: this.chainId,
      orderHash,
      signature: signOrderJS(orderHash, this.wallet),
    });
    const request = buildSignedClaimMessageJson(message);
    const response = await this.post("/claim", request, options);
    return { ...response, request };
  }

  private async post(
    path: string,
    body: unknown,
    options?: HttpRequestOptions,
  ): Promise<HttpResult> {
    return requestWithOptions(
      this.fetchFn,
      buildUrl(this.apiUrl, path),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify(body),
      },
      this.timeoutMs,
      readHttpResult,
      options,
    );
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

function resolveExchangeClientConfig(options: ExchangeClientOptions): ResolvedExchangeClientConfig {
  const chainId = parseChainId(options.chainId);
  if (options.contracts !== undefined) {
    return {
      chainId,
      contracts: parseExchangeContracts(options.contracts),
    };
  }

  const config = getDefaultExchangeChainConfig(chainId);
  if (config === undefined) {
    throw createProtocolValidationError(
      "invalid_value",
      "$.chainId",
      "no default exchange config for chainId; provide contracts",
    );
  }

  return config;
}

function parseChainId(input: ProtocolBigNumberish): bigint {
  return getExchangeConfigRequestSchema.parse({ chainId: input }).chainId;
}

function assertNonZeroCancelReplaceHash(orderHash: unknown): void {
  if (typeof orderHash === "string" && orderHash.toLowerCase() === ZeroHash.toLowerCase()) {
    throw createProtocolValidationError(
      "invalid_value",
      "$.cancelOrderHash",
      "cancelReplace does not support cancel-all zero hash",
    );
  }
}

const defaultFetch: FetchLike = async (url, init) => {
  return fetch(url, init);
};

function parseHttpTimeout(input: number, path: string): number {
  return parsePositiveIntegerOption(input, path);
}

async function requestWithOptions<T>(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
  defaultTimeoutMs: number,
  readResponse: (response: FetchResponseLike) => Promise<T>,
  options?: HttpRequestOptions,
): Promise<T> {
  const timeoutMs = parseHttpTimeout(options?.timeoutMs ?? defaultTimeoutMs, "$.timeoutMs");
  const controller = new AbortController();
  const callerSignal = options?.signal;
  let didTimeout = false;
  if (callerSignal?.aborted) {
    throw new HttpAbortError(callerSignal.reason);
  }

  const abortFromCaller = (): void => {
    controller.abort(callerSignal?.reason);
  };

  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new HttpTimeoutError(timeoutMs));
  }, timeoutMs);
  let rejectOnAbort: ((reason?: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject;
  });
  void abortPromise.catch(() => undefined);
  const rejectResponseOnAbort = (): void => {
    rejectOnAbort?.(controller.signal.reason);
  };
  controller.signal.addEventListener("abort", rejectResponseOnAbort, { once: true });

  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    return await Promise.race([readResponse(response), abortPromise]);
  } catch (error) {
    if (didTimeout) {
      throw new HttpTimeoutError(timeoutMs);
    }
    if (controller.signal.aborted) {
      throw new HttpAbortError(callerSignal?.reason ?? error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
    controller.signal.removeEventListener("abort", rejectResponseOnAbort);
  }
}

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

  const value = parseUnsignedInteger(data.nonce, "$.nonce", UINT32_MAX, {
    invalidType: "agent status nonce must be a bigint or decimal string",
    invalidDecimalString: "agent status nonce must be a canonical unsigned decimal string",
    outOfRange: (max) => `agent status nonce must be in range 0..${max.toString()}`,
  });

  return { nonce: value };
}

function parseAgentActionApprovalNonce(input: unknown, path = "$.approvalNonce"): bigint {
  const value = parseApprovalNonceInteger(input, path);

  if (value <= MIN_AGENT_ACTION_APPROVAL_NONCE) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      `approvalNonce must be greater than ${MIN_AGENT_ACTION_APPROVAL_NONCE.toString()}`,
    );
  }

  return value;
}

function parseApproveAgentApprovalNonce(input: unknown, path = "$.approvalNonce"): bigint {
  const value = parseApprovalNonceInteger(input, path);
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const minApprovalNonce = nowSeconds + APPROVE_AGENT_MIN_FUTURE_SECONDS;
  const maxApprovalNonce = nowSeconds + APPROVE_AGENT_MAX_FUTURE_SECONDS;

  if (value <= minApprovalNonce || value >= maxApprovalNonce) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      `approvalNonce must be greater than ${minApprovalNonce.toString()} and less than ${maxApprovalNonce.toString()}`,
    );
  }

  return value;
}

function parseApprovalNonceInteger(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT32_MAX, {
    invalidType: "approvalNonce must be a bigint or decimal string",
    invalidDecimalString: "approvalNonce must be a canonical unsigned decimal string",
    outOfRange: (max) => `approvalNonce must be in range 0..${max.toString()}`,
  });
}
