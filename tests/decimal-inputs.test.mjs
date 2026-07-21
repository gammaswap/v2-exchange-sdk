import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAmountInput,
  parsePositiveAmountInput,
  parsePriceInput,
  parseSizeInput,
} from "@gammaswap/v2-exchange-sdk/decimal-inputs";
import { ProtocolValidationError } from "@gammaswap/v2-exchange-sdk/errors";

function assertProtocolError(fn, code, path) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProtocolValidationError);
    assert.equal(error.issues[0]?.code, code);
    assert.equal(error.issues[0]?.path, path);
    return true;
  });
}

test("price input parser converts cents to six-decimal protocol units", () => {
  assert.equal(parsePriceInput("0.1"), 1_000n);
  assert.equal(parsePriceInput("50"), 500_000n);
  assert.equal(parsePriceInput("99.9"), 999_000n);
});

test("price input parser rejects invalid price inputs", () => {
  assertProtocolError(() => parsePriceInput(1), "invalid_type", "$.price");
  assertProtocolError(() => parsePriceInput("01"), "invalid_decimal_string", "$.price");
  assertProtocolError(() => parsePriceInput("99.89"), "invalid_decimal_string", "$.price");
  assertProtocolError(() => parsePriceInput("0"), "invalid_value", "$.price");
  assertProtocolError(() => parsePriceInput("100"), "invalid_value", "$.price");
});

test("size input parser converts decimal sizes to six-decimal protocol units", () => {
  assert.equal(parseSizeInput("0.01"), 10_000n);
  assert.equal(parseSizeInput("1"), 1_000_000n);
  assert.equal(parseSizeInput("100.25"), 100_250_000n);
  assert.equal(parseSizeInput("1000000000.00"), 1_000_000_000_000_000n);
});

test("size input parser rejects invalid size inputs", () => {
  assertProtocolError(() => parseSizeInput(1), "invalid_type", "$.size");
  assertProtocolError(() => parseSizeInput("0.001"), "invalid_decimal_string", "$.size");
  assertProtocolError(() => parseSizeInput("0"), "invalid_value", "$.size");
  assertProtocolError(() => parseSizeInput("1000000000.01"), "invalid_value", "$.size");
});

test("amount input parser converts decimal amounts to six-decimal protocol units", () => {
  assert.equal(parseAmountInput("0"), 0n);
  assert.equal(parseAmountInput("0.01"), 10_000n);
  assert.equal(parseAmountInput("100.25"), 100_250_000n);
});

test("amount input parser rejects invalid amount inputs", () => {
  assertProtocolError(() => parseAmountInput(1), "invalid_type", "$.amount");
  assertProtocolError(() => parseAmountInput("01"), "invalid_decimal_string", "$.amount");
  assertProtocolError(() => parseAmountInput("1.001"), "invalid_decimal_string", "$.amount");
  assertProtocolError(() => parsePositiveAmountInput("0"), "invalid_value", "$.amount");
});
