export type ProtocolValidationCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_decimal_string"
  | "integer_out_of_range"
  | "missing_field"
  | "unknown_field";

export interface ProtocolValidationIssue {
  code: ProtocolValidationCode;
  path: string;
  message: string;
}

export class ExchangeSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExchangeSdkError";
  }
}

export class ProtocolValidationError extends ExchangeSdkError {
  readonly issues: readonly ProtocolValidationIssue[];

  constructor(issues: readonly ProtocolValidationIssue[]) {
    super(formatValidationMessage(issues));
    this.name = "ProtocolValidationError";
    this.issues = issues;
  }
}

export function createProtocolValidationError(
  code: ProtocolValidationCode,
  path: string,
  message: string,
): ProtocolValidationError {
  return new ProtocolValidationError([{ code, path, message }]);
}

function formatValidationMessage(issues: readonly ProtocolValidationIssue[]): string {
  if (issues.length === 0) {
    return "Protocol validation failed";
  }

  return `Protocol validation failed: ${issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ")}`;
}
