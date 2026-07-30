import { createProtocolValidationError } from "./errors.js";

export const UINT8_MAX = 2n ** 8n - 1n;
export const UINT24_MAX = 2n ** 24n - 1n;
export const UINT32_MAX = 2n ** 32n - 1n;
export const UINT64_MAX = 2n ** 64n - 1n;
export const UINT128_MAX = 2n ** 128n - 1n;
export const UINT256_MAX = 2n ** 256n - 1n;

const DECIMAL_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/u;

interface UnsignedIntegerMessages {
  invalidDecimalString?: string;
  invalidType?: string;
  outOfRange?: (max: bigint) => string;
}

export function parseUnsignedInteger(
  input: unknown,
  path: string,
  max: bigint,
  messages: UnsignedIntegerMessages = {},
): bigint {
  const value = parseUnsignedIntegerUnchecked(input, path, messages);

  if (value < 0n || value > max) {
    throw createProtocolValidationError(
      "integer_out_of_range",
      path,
      messages.outOfRange?.(max) ?? `expected integer in range 0..${max.toString()}`,
    );
  }

  return value;
}

export function parseUint8(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT8_MAX);
}

export function parseUint24(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT24_MAX);
}

export function parseUint32(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT32_MAX);
}

export function parseUint64(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT64_MAX);
}

export function parseUint128(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT128_MAX);
}

export function parseUint256(input: unknown, path: string): bigint {
  return parseUnsignedInteger(input, path, UINT256_MAX);
}

export function parseSafeJsonUnsignedInteger(
  input: unknown,
  path: string,
  max: bigint,
  invalidNumberMessage = "expected a safe unsigned integer",
): bigint {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input < 0) {
      throw createProtocolValidationError("invalid_type", path, invalidNumberMessage);
    }

    const value = BigInt(input);
    if (value > max) {
      throw createProtocolValidationError(
        "integer_out_of_range",
        path,
        `expected integer in range 0..${max.toString()}`,
      );
    }

    return value;
  }

  return parseUnsignedInteger(input, path, max);
}

export function parseNonNegativeIntegerOption(input: number, path: string): number {
  if (!Number.isInteger(input) || input < 0) {
    throw createProtocolValidationError("invalid_value", path, "expected a non-negative integer");
  }

  return input;
}

export function parsePositiveIntegerOption(input: number, path: string): number {
  if (!Number.isInteger(input) || input <= 0) {
    throw createProtocolValidationError("invalid_value", path, "expected a positive integer");
  }

  return input;
}

function parseUnsignedIntegerUnchecked(
  input: unknown,
  path: string,
  messages: UnsignedIntegerMessages,
): bigint {
  if (typeof input === "bigint") {
    return input;
  }

  if (typeof input === "string") {
    if (!DECIMAL_INTEGER_PATTERN.test(input)) {
      throw createProtocolValidationError(
        "invalid_decimal_string",
        path,
        messages.invalidDecimalString ?? "expected a canonical unsigned decimal string",
      );
    }

    return BigInt(input);
  }

  throw createProtocolValidationError(
    "invalid_type",
    path,
    messages.invalidType ?? "expected bigint or canonical unsigned decimal string",
  );
}
