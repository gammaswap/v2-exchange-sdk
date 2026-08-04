import { ZeroAddress, isAddress } from "ethers";
import { createProtocolValidationError } from "./errors.js";
import type { Address, HexString } from "./types.js";

const HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/u;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/u;

export function parseAddress(input: unknown, path: string): Address {
  if (typeof input !== "string" || !isAddress(input)) {
    throw createProtocolValidationError("invalid_value", path, "expected an EVM address");
  }

  return input;
}

export function parseNonZeroAddress(input: unknown, path: string): Address {
  const address = parseAddress(input, path);
  if (sameAddress(address, ZeroAddress)) {
    throw createProtocolValidationError("invalid_value", path, "expected a non-zero EVM address");
  }

  return address;
}

export function sameAddress(left: unknown, right: unknown): boolean {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

export function parseHexData(input: unknown, path: string): HexString {
  if (typeof input !== "string" || !HEX_DATA_PATTERN.test(input)) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      "expected 0x-prefixed hex data with an even byte length",
    );
  }

  return input;
}

export function parseBytes32(input: unknown, path: string): HexString {
  if (typeof input !== "string" || !BYTES32_PATTERN.test(input)) {
    throw createProtocolValidationError("invalid_value", path, "expected a 32-byte hex string");
  }

  return input;
}
