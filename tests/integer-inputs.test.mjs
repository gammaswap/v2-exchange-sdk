import assert from "node:assert/strict";
import test from "node:test";
import {
  UINT8_MAX,
  UINT64_MAX,
  parseNonNegativeIntegerOption,
  parsePositiveIntegerOption,
  parseSafeJsonUnsignedInteger,
  parseUnsignedInteger,
} from "@gammaswap/v2-exchange-sdk/integer-inputs";
import { ProtocolValidationError } from "@gammaswap/v2-exchange-sdk/errors";

function assertProtocolError(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof ProtocolValidationError && error.issues[0]?.code === code,
  );
}

test("unsigned integer parser accepts bigint and canonical decimal strings", () => {
  assert.equal(parseUnsignedInteger(0n, "$.value", UINT8_MAX), 0n);
  assert.equal(parseUnsignedInteger("255", "$.value", UINT8_MAX), 255n);
});

test("unsigned integer parser rejects numbers, non-canonical decimals, and out-of-range values", () => {
  assertProtocolError(() => parseUnsignedInteger(1, "$.value", UINT8_MAX), "invalid_type");
  assertProtocolError(
    () => parseUnsignedInteger("01", "$.value", UINT8_MAX),
    "invalid_decimal_string",
  );
  assertProtocolError(
    () => parseUnsignedInteger("-1", "$.value", UINT8_MAX),
    "invalid_decimal_string",
  );
  assertProtocolError(
    () => parseUnsignedInteger(256n, "$.value", UINT8_MAX),
    "integer_out_of_range",
  );
});

test("safe JSON unsigned integer parser accepts safe unsigned numbers", () => {
  assert.equal(parseSafeJsonUnsignedInteger(42, "$.seqId", UINT64_MAX), 42n);
  assert.equal(parseSafeJsonUnsignedInteger("43", "$.seqId", UINT64_MAX), 43n);
});

test("safe JSON unsigned integer parser rejects unsafe or negative numbers", () => {
  assertProtocolError(
    () => parseSafeJsonUnsignedInteger(Number.MAX_SAFE_INTEGER + 1, "$.seqId", UINT64_MAX),
    "invalid_type",
  );
  assertProtocolError(
    () => parseSafeJsonUnsignedInteger(-1, "$.seqId", UINT64_MAX),
    "invalid_type",
  );
});

test("integer option parsers validate runtime number options", () => {
  assert.equal(parseNonNegativeIntegerOption(0, "$.reconnectDelayMs"), 0);
  assert.equal(parsePositiveIntegerOption(1, "$.ackTimeoutMs"), 1);
  assertProtocolError(
    () => parseNonNegativeIntegerOption(-1, "$.reconnectDelayMs"),
    "invalid_value",
  );
  assertProtocolError(() => parsePositiveIntegerOption(0, "$.ackTimeoutMs"), "invalid_value");
});
