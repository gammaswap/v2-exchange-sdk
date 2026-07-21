import { createProtocolValidationError } from "./errors.js";
import type { HumanDecimalString } from "./types.js";

export const PROTOCOL_DECIMALS = 6;
export const SIZE_AMOUNT_INPUT_DECIMALS = 2;
export const PRICE_INPUT_DECIMALS = 1;

export const MIN_PRICE_PROTOCOL_UNITS = 1_000n;
export const MAX_PRICE_PROTOCOL_UNITS = 999_000n;
export const MIN_SIZE_PROTOCOL_UNITS = 10_000n;
export const MAX_SIZE_PROTOCOL_UNITS = 1_000_000_000_000_000n;
export const MAX_AMOUNT_PROTOCOL_UNITS = MAX_SIZE_PROTOCOL_UNITS;

const PROTOCOL_SCALE = 1_000_000n;
const UINT256_MAX = 2n ** 256n - 1n;
const PRICE_TENTH_CENT_TO_PROTOCOL_UNITS = 1_000n;
const MIN_PRICE_TENTH_CENTS = 1n;
const MAX_PRICE_TENTH_CENTS = 999n;
const DECIMAL_INPUT_PATTERN = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u;

interface ParsedDecimalInput {
  whole: string;
  fraction: string;
}

export function parsePriceInput(input: HumanDecimalString, path = "$.price"): bigint {
  const parsed = parseDecimalInput(input, path, "price", PRICE_INPUT_DECIMALS);
  const tenthsOfCents =
    BigInt(parsed.whole) * 10n + BigInt(parsed.fraction.padEnd(PRICE_INPUT_DECIMALS, "0") || "0");

  if (tenthsOfCents < MIN_PRICE_TENTH_CENTS || tenthsOfCents > MAX_PRICE_TENTH_CENTS) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      "price must be between 0.1 and 99.9",
    );
  }

  return tenthsOfCents * PRICE_TENTH_CENT_TO_PROTOCOL_UNITS;
}

export function parseSizeInput(input: HumanDecimalString, path = "$.size"): bigint {
  const size = parseDecimalInputToProtocolUnits(input, path, "size", SIZE_AMOUNT_INPUT_DECIMALS);

  if (size < MIN_SIZE_PROTOCOL_UNITS || size > MAX_SIZE_PROTOCOL_UNITS) {
    throw createProtocolValidationError(
      "invalid_value",
      path,
      "size must be between 0.01 and 1000000000",
    );
  }

  return size;
}

export function parseAmountInput(input: HumanDecimalString, path = "$.amount"): bigint {
  const amount = parseDecimalInputToProtocolUnits(
    input,
    path,
    "amount",
    SIZE_AMOUNT_INPUT_DECIMALS,
  );

  if (amount > MAX_AMOUNT_PROTOCOL_UNITS) {
    throw createProtocolValidationError("invalid_value", path, "amount must be at most 1000000000");
  }

  return amount;
}

export function parsePositiveAmountInput(input: HumanDecimalString, path = "$.amount"): bigint {
  const amount = parseAmountInput(input, path);

  if (amount <= 0n) {
    throw createProtocolValidationError("invalid_value", path, "amount must be greater than zero");
  }

  return amount;
}

function parseDecimalInputToProtocolUnits(
  input: HumanDecimalString,
  path: string,
  fieldName: string,
  maxDecimalPlaces: number,
): bigint {
  const parsed = parseDecimalInput(input, path, fieldName, maxDecimalPlaces);
  const value =
    BigInt(parsed.whole) * PROTOCOL_SCALE +
    BigInt(parsed.fraction.padEnd(PROTOCOL_DECIMALS, "0") || "0");

  if (value > UINT256_MAX) {
    throw createProtocolValidationError(
      "integer_out_of_range",
      path,
      `expected integer in range 0..${UINT256_MAX.toString()}`,
    );
  }

  return value;
}

function parseDecimalInput(
  input: HumanDecimalString,
  path: string,
  fieldName: string,
  maxDecimalPlaces: number,
): ParsedDecimalInput {
  if (typeof input !== "string") {
    throw createProtocolValidationError(
      "invalid_type",
      path,
      `expected ${fieldName} as a decimal string`,
    );
  }

  const match = DECIMAL_INPUT_PATTERN.exec(input);
  if (match === null) {
    throw createProtocolValidationError(
      "invalid_decimal_string",
      path,
      `expected a canonical unsigned decimal ${fieldName} string`,
    );
  }

  const fraction = match[2] ?? "";
  if (fraction.length > maxDecimalPlaces) {
    throw createProtocolValidationError(
      "invalid_decimal_string",
      path,
      `${fieldName} supports at most ${maxDecimalPlaces.toString()} ${pluralizeDecimalPlace(
        maxDecimalPlaces,
      )}`,
    );
  }

  return {
    whole: match[1] ?? "0",
    fraction,
  };
}

function pluralizeDecimalPlace(count: number): string {
  return count === 1 ? "decimal place" : "decimal places";
}
