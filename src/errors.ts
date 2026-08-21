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

export class HttpClientError extends ExchangeSdkError {
  constructor(message: string) {
    super(message);
    this.name = "HttpClientError";
  }
}

export class HttpResponseError extends HttpClientError {
  readonly status: number;
  readonly statusText: string;
  readonly data: unknown;

  constructor(status: number, statusText: string, data: unknown) {
    super(`HTTP request failed with status ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "HttpResponseError";
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

export class HttpTimeoutError extends HttpClientError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`HTTP request timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class HttpAbortError extends HttpClientError {
  readonly cause?: unknown;

  constructor(cause?: unknown) {
    super("HTTP request was aborted");
    this.name = "HttpAbortError";
    this.cause = cause;
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
