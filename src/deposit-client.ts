import {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  isAddress,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type TypedDataDomain,
  type TypedDataField,
  type Wallet,
} from "ethers";
import { getDefaultExchangeChainConfig } from "./config.js";
import { parseAmountInput, parsePositiveAmountInput } from "./decimal-inputs.js";
import { createProtocolValidationError, ExchangeSdkError } from "./errors.js";
import { getExchangeConfigRequestSchema, parseExchangeContracts } from "./schemas.js";
import type {
  Address,
  ExchangeContractsInput,
  HumanDecimalString,
  HexString,
  ProtocolBigNumberish,
  TokenApprovalInput,
  DepositTransactionInput,
  DepositPermitInput,
  DepositWithPermitInput,
} from "./types.js";
import { DEPOSIT_LEDGER_ABI, ERC20_ABI } from "./constants.js";

export interface DepositClientOptions {
  rpcUrl: string;
  wallet: Wallet;
  chainId: ProtocolBigNumberish;
  depositLedger?: Address;
  contracts?: ExchangeContractsInput;
  settlementTokenDecimals?: number;
}

export interface DepositPermit {
  owner: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  signature: HexString;
}

export interface OnchainTransactionResult {
  amount: bigint;
  tx: ContractTransactionResponse;
  receipt: ContractTransactionReceipt;
}

export interface DepositTransactionResult extends OnchainTransactionResult {
  txId: bigint;
}

const SETTLEMENT_TOKEN_DECIMALS = 6;
const UINT256_MAX = 2n ** 256n - 1n;
const DECIMAL_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;

const PERMIT2_TYPES: Record<string, TypedDataField[]> = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const depositLedgerInterface = new Interface(DEPOSIT_LEDGER_ABI);

interface DepositLedgerContract {
  SETTLEMENT_TOKEN(): Promise<Address>;
  ACCOUNT_LEDGER(): Promise<Address>;
  PERMIT2(): Promise<Address>;
  pendingBalance(): Promise<bigint>;
  processedBalance(): Promise<bigint>;
  pendingDepositCount(): Promise<bigint>;
  nextPendingDepositId(): Promise<bigint>;
  processedDepositIndex(): Promise<bigint>;
  minBlockWait(): Promise<bigint>;
  canProcessNext(): Promise<boolean>;
  deposit(amount: bigint): Promise<ContractTransactionResponse>;
  depositWithPermit(
    amount: bigint,
    nonce: bigint,
    owner: Address,
    deadline: bigint,
    signature: HexString,
  ): Promise<ContractTransactionResponse>;
}

interface Erc20Contract {
  approve(spender: Address, amount: bigint): Promise<ContractTransactionResponse>;
  allowance(owner: Address, spender: Address): Promise<bigint>;
  balanceOf(owner: Address): Promise<bigint>;
  decimals(): Promise<bigint>;
}

export class DepositClient {
  readonly rpcUrl: string;
  readonly wallet: Wallet;
  readonly provider: JsonRpcProvider;
  readonly chainId: bigint;
  readonly depositLedger: Address;
  readonly settlementTokenDecimals: number;

  private readonly depositLedgerContract: DepositLedgerContract;

  constructor(options: DepositClientOptions) {
    if (options.rpcUrl.trim() === "") {
      throw createProtocolValidationError("invalid_value", "$.rpcUrl", "rpcUrl is required");
    }

    this.chainId = getExchangeConfigRequestSchema.parse({ chainId: options.chainId }).chainId;
    this.depositLedger = resolveDepositLedger(options, this.chainId);
    this.settlementTokenDecimals = parseSettlementTokenDecimals(
      options.settlementTokenDecimals ?? SETTLEMENT_TOKEN_DECIMALS,
    );
    this.rpcUrl = options.rpcUrl;
    this.provider = new JsonRpcProvider(this.rpcUrl);
    this.wallet = options.wallet.connect(this.provider);
    this.depositLedgerContract = new Contract(
      this.depositLedger,
      DEPOSIT_LEDGER_ABI,
      this.wallet,
    ) as unknown as DepositLedgerContract;
  }

  async getSettlementToken(): Promise<Address> {
    await this.assertRpcChainId();
    return validateAddress(
      await this.depositLedgerContract.SETTLEMENT_TOKEN(),
      "$.settlementToken",
    );
  }

  async getPermit2(): Promise<Address> {
    await this.assertRpcChainId();
    return validateAddress(await this.depositLedgerContract.PERMIT2(), "$.permit2");
  }

  async getAccountLedger(): Promise<Address> {
    await this.assertRpcChainId();
    return validateAddress(await this.depositLedgerContract.ACCOUNT_LEDGER(), "$.accountLedger");
  }

  async getPendingBalance(): Promise<bigint> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.pendingBalance();
  }

  async getProcessedBalance(): Promise<bigint> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.processedBalance();
  }

  async getPendingDepositCount(): Promise<bigint> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.pendingDepositCount();
  }

  async getNextPendingDepositId(): Promise<bigint> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.nextPendingDepositId();
  }

  async getProcessedDepositIndex(): Promise<bigint> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.processedDepositIndex();
  }

  async getMinBlockWait(): Promise<bigint> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.minBlockWait();
  }

  async canProcessNext(): Promise<boolean> {
    await this.assertRpcChainId();
    return this.depositLedgerContract.canProcessNext();
  }

  async getSettlementTokenBalance(owner: Address = this.wallet.address): Promise<bigint> {
    await this.assertRpcChainId();
    return (await this.getSettlementTokenContract()).balanceOf(validateAddress(owner, "$.owner"));
  }

  async getSettlementTokenAllowance(
    spender: Address = this.depositLedger,
    owner: Address = this.wallet.address,
  ): Promise<bigint> {
    await this.assertRpcChainId();
    return (await this.getSettlementTokenContract()).allowance(
      validateAddress(owner, "$.owner"),
      validateAddress(spender, "$.spender"),
    );
  }

  async approveDepositLedger(input: TokenApprovalInput): Promise<OnchainTransactionResult> {
    await this.assertRpcChainId();
    const amount = this.parseAmount(input.amount);
    const tx = await (await this.getSettlementTokenContract()).approve(this.depositLedger, amount);
    const receipt = await waitForReceipt(tx, input.confirmations);
    return { amount, tx, receipt };
  }

  async approvePermit2(input: TokenApprovalInput): Promise<OnchainTransactionResult> {
    await this.assertRpcChainId();
    const amount = this.parseAmount(input.amount);
    const permit2 = await this.getPermit2();
    const tx = await (await this.getSettlementTokenContract()).approve(permit2, amount);
    const receipt = await waitForReceipt(tx, input.confirmations);
    return { amount, tx, receipt };
  }

  async deposit(input: DepositTransactionInput): Promise<DepositTransactionResult> {
    await this.assertRpcChainId();
    const amount = parsePositiveAmountInput(input.amount);
    const tx = await this.depositLedgerContract.deposit(amount);
    return this.waitForDeposit(tx, amount, input.confirmations, input.logTxId);
  }

  async signDepositPermit(input: DepositPermitInput): Promise<DepositPermit> {
    await this.assertRpcChainId();
    const amount = parsePositiveAmountInput(input.amount);
    const nonce = parseUnsignedInteger(input.nonce, "$.nonce", UINT256_MAX);
    const deadline = parseUnsignedInteger(input.deadline, "$.deadline", UINT256_MAX);
    const owner = validateAddress(input.owner ?? this.wallet.address, "$.owner");

    if (!sameAddress(owner, this.wallet.address)) {
      throw createProtocolValidationError(
        "invalid_value",
        "$.owner",
        "owner must match the configured wallet when signing a Permit2 deposit permit",
      );
    }

    const token = await this.getSettlementToken();
    const permit2 = await this.getPermit2();
    const signature = await this.wallet.signTypedData(
      getPermit2Domain(this.chainId, permit2),
      PERMIT2_TYPES,
      {
        permitted: {
          token,
          amount,
        },
        spender: this.depositLedger,
        nonce,
        deadline,
      },
    );

    return {
      owner,
      token,
      spender: this.depositLedger,
      amount,
      nonce,
      deadline,
      signature,
    };
  }

  async depositWithPermit(input: DepositWithPermitInput): Promise<DepositTransactionResult> {
    await this.assertRpcChainId();
    const permit =
      input.signature === undefined
        ? await this.signDepositPermit(input)
        : {
            owner: validateAddress(input.owner ?? this.wallet.address, "$.owner"),
            amount: parsePositiveAmountInput(input.amount),
            nonce: parseUnsignedInteger(input.nonce, "$.nonce", UINT256_MAX),
            deadline: parseUnsignedInteger(input.deadline, "$.deadline", UINT256_MAX),
            signature: validateHexData(input.signature, "$.signature"),
          };

    const tx = await this.depositLedgerContract.depositWithPermit(
      permit.amount,
      permit.nonce,
      permit.owner,
      permit.deadline,
      permit.signature,
    );
    return this.waitForDeposit(tx, permit.amount, input.confirmations, input.logTxId);
  }

  parseAmount(amount: HumanDecimalString): bigint {
    return parseSettlementTokenAmount(amount);
  }

  private async getSettlementTokenContract(): Promise<Erc20Contract> {
    const settlementToken = await this.getSettlementToken();
    return new Contract(settlementToken, ERC20_ABI, this.wallet) as unknown as Erc20Contract;
  }

  private async waitForDeposit(
    tx: ContractTransactionResponse,
    amount: bigint,
    confirmations: number | undefined,
    logTxId: boolean | undefined,
  ): Promise<DepositTransactionResult> {
    const receipt = await waitForReceipt(tx, confirmations);
    const txId = getDepositQueuedTxId(receipt);

    if (txId === undefined) {
      throw new ExchangeSdkError("DepositQueued event not found in transaction receipt");
    }

    if (logTxId !== false) {
      console.log(`Deposit txId: ${txId.toString()}`);
    }

    return { amount, tx, receipt, txId };
  }

  private async assertRpcChainId(): Promise<void> {
    const network = await this.provider.getNetwork();
    if (network.chainId !== this.chainId) {
      throw createProtocolValidationError(
        "invalid_value",
        "$.chainId",
        `RPC chainId ${network.chainId.toString()} does not match configured chainId ${this.chainId.toString()}`,
      );
    }
  }
}

export function createDepositClient(options: DepositClientOptions): DepositClient {
  return new DepositClient(options);
}

export function parseSettlementTokenAmount(
  amount: HumanDecimalString,
  decimals: number = SETTLEMENT_TOKEN_DECIMALS,
): bigint {
  parseSettlementTokenDecimals(decimals);
  return parseAmountInput(amount);
}

function resolveDepositLedger(options: DepositClientOptions, chainId: bigint): Address {
  const contracts =
    options.contracts !== undefined
      ? parseExchangeContracts(options.contracts)
      : getDefaultExchangeChainConfig(chainId)?.contracts;
  const depositLedger = options.depositLedger ?? contracts?.depositLedger;

  if (depositLedger === undefined) {
    throw createProtocolValidationError(
      "missing_field",
      "$.depositLedger",
      "depositLedger is required when no default depositLedger exists for chainId",
    );
  }

  return validateAddress(depositLedger, "$.depositLedger", false);
}

function validateAddress(input: unknown, path: string, allowZeroAddress = true): Address {
  if (typeof input !== "string" || !isAddress(input)) {
    throw createProtocolValidationError("invalid_value", path, "expected an EVM address");
  }

  if (!allowZeroAddress && sameAddress(input, ZeroAddress)) {
    throw createProtocolValidationError("invalid_value", path, "expected a non-zero EVM address");
  }

  return input;
}

function validateHexData(input: unknown, path: string): HexString {
  if (typeof input !== "string" || !HEX_DATA_PATTERN.test(input)) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      "expected 0x-prefixed hex data with an even byte length",
    );
  }

  return input;
}

function parseUnsignedInteger(input: unknown, path: string, max: bigint): bigint {
  let value: bigint;

  if (typeof input === "bigint") {
    value = input;
  } else if (typeof input === "string") {
    if (!DECIMAL_INTEGER_PATTERN.test(input)) {
      throw createProtocolValidationError(
        "invalid_decimal_string",
        path,
        "expected a canonical unsigned decimal string",
      );
    }
    value = BigInt(input);
  } else {
    throw createProtocolValidationError(
      "invalid_type",
      path,
      "expected bigint or canonical unsigned decimal string",
    );
  }

  if (value < 0n || value > max) {
    throw createProtocolValidationError(
      "integer_out_of_range",
      path,
      `expected integer in range 0..${max.toString()}`,
    );
  }

  return value;
}

function parseSettlementTokenDecimals(decimals: number): number {
  if (decimals !== SETTLEMENT_TOKEN_DECIMALS) {
    throw createProtocolValidationError(
      "invalid_value",
      "$.settlementTokenDecimals",
      "settlementTokenDecimals must be 6",
    );
  }

  return decimals;
}

function getPermit2Domain(chainId: bigint, verifyingContract: Address): TypedDataDomain {
  return {
    name: "Permit2",
    chainId,
    verifyingContract,
  };
}

async function waitForReceipt(
  tx: ContractTransactionResponse,
  confirmations: number | undefined,
): Promise<ContractTransactionReceipt> {
  const receipt = await tx.wait(confirmations);
  if (receipt === null) {
    throw new ExchangeSdkError("Transaction receipt was not available");
  }

  return receipt;
}

function getDepositQueuedTxId(receipt: ContractTransactionReceipt): bigint | undefined {
  for (const log of receipt.logs) {
    const parsed = depositLedgerInterface.parseLog({
      topics: Array.from(log.topics),
      data: log.data,
    });

    if (parsed?.name === "DepositQueued") {
      return parseUnsignedInteger(String(parsed.args.index), "$.txId", UINT256_MAX);
    }
  }

  return undefined;
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
