import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAddress,
  parseBytes32,
  parseHexData,
  parseNonZeroAddress,
  sameAddress,
} from "@gammaswap/v2-exchange-sdk/string-inputs";
import { ProtocolValidationError } from "@gammaswap/v2-exchange-sdk/errors";

const ADDRESS = "0x756C91877892068383292Dd66b347640db5fE426";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function assertProtocolError(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof ProtocolValidationError && error.issues[0]?.code === code,
  );
}

test("address parser accepts EVM addresses and rejects invalid values", () => {
  assert.equal(parseAddress(ADDRESS, "$.address"), ADDRESS);
  assertProtocolError(() => parseAddress("not-an-address", "$.address"), "invalid_value");
});

test("non-zero address parser rejects the zero address", () => {
  assert.equal(parseNonZeroAddress(ADDRESS, "$.address"), ADDRESS);
  assertProtocolError(() => parseNonZeroAddress(ZERO_ADDRESS, "$.address"), "invalid_value");
});

test("sameAddress compares addresses case-insensitively without throwing on non-strings", () => {
  assert.equal(sameAddress(ADDRESS, ADDRESS.toLowerCase()), true);
  assert.equal(sameAddress(ADDRESS, ZERO_ADDRESS), false);
  assert.equal(sameAddress(undefined, ADDRESS), false);
});

test("hex data parser accepts 0x-prefixed even-byte hex data", () => {
  assert.equal(parseHexData("0x", "$.signature"), "0x");
  assert.equal(parseHexData("0x1234abcd", "$.signature"), "0x1234abcd");
  assertProtocolError(() => parseHexData("0x123", "$.signature"), "invalid_value");
  assertProtocolError(() => parseHexData("1234", "$.signature"), "invalid_value");
});

test("bytes32 parser accepts exactly 32-byte hex strings", () => {
  const bytes32 = `0x${"ab".repeat(32)}`;
  assert.equal(parseBytes32(bytes32, "$.orderHash"), bytes32);
  assertProtocolError(() => parseBytes32("0x", "$.orderHash"), "invalid_value");
});
