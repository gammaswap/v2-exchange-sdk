import assert from "node:assert/strict";
import test from "node:test";
import { Wallet, ZeroAddress } from "ethers";
import {
  createDepositClient,
  parseSettlementTokenAmount,
  ProtocolValidationError,
} from "@gammaswap/v2-exchange-sdk";
import { ChainId } from "@gammaswap/v2-exchange-sdk/constants";

const WALLET = new Wallet(`0x${"11".repeat(32)}`);

function assertProtocolError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProtocolValidationError);
    assert.equal(error.issues[0]?.code, code);
    return true;
  });
}

test("settlement token amount parser converts decimal strings to six-decimal base units", () => {
  assert.equal(parseSettlementTokenAmount("100"), 100_000_000n);
  assert.equal(parseSettlementTokenAmount("100.25"), 100_250_000n);
  assert.equal(parseSettlementTokenAmount("0.01"), 10_000n);
  assert.equal(parseSettlementTokenAmount("1000000000.00"), 1_000_000_000_000_000n);
  assert.equal(parseSettlementTokenAmount("0"), 0n);
});

test("settlement token amount parser rejects unsafe amount inputs", () => {
  assertProtocolError(() => parseSettlementTokenAmount(100), "invalid_type");
  assertProtocolError(() => parseSettlementTokenAmount("01"), "invalid_decimal_string");
  assertProtocolError(() => parseSettlementTokenAmount("1.001"), "invalid_decimal_string");
  assertProtocolError(() => parseSettlementTokenAmount("-1"), "invalid_decimal_string");
  assertProtocolError(() => parseSettlementTokenAmount("1", 18), "invalid_value");
  assertProtocolError(() => parseSettlementTokenAmount("1000000000.01"), "invalid_value");
});

test("DepositClient resolves the default localhost DepositLedger address", () => {
  const client = createDepositClient({
    rpcUrl: "http://localhost:8545",
    wallet: WALLET,
    chainId: ChainId.LOCALHOST,
  });

  assert.equal(client.depositLedger, "0xCF9C83be89ac927F9D98F0CaFB9ED7fDea2fD459");
  assert.equal(client.parseAmount("100.25"), 100_250_000n);
});

test("DepositClient rejects missing or zero DepositLedger address", () => {
  assertProtocolError(
    () =>
      createDepositClient({
        rpcUrl: "http://localhost:8545",
        wallet: WALLET,
        chainId: ChainId.BASE_SEPOLIA,
      }),
    "missing_field",
  );

  assertProtocolError(
    () =>
      createDepositClient({
        rpcUrl: "http://localhost:8545",
        wallet: WALLET,
        chainId: ChainId.BASE_SEPOLIA,
        depositLedger: ZeroAddress,
      }),
    "invalid_value",
  );
});
