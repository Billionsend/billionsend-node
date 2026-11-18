/** The API's error body (`ErrorResponse`). */
export interface ErrorShape {
  statusCode: number | null;
  name: string;
  message: string;
}

export interface BillionSendErrorInit {
  message: string;
  /** The API's error name, such as `"validation_error"`; `"application_error"` when the API sent none. */
  name?: string;
  statusCode?: number | null;
  requestId?: string | null;
}

/**
 * Every error the SDK returns (in `{ error }`) or throws (from the iterators,
 * event streams and {@link verifyWebhook}). Tell the kinds apart with
 * `instanceof`: {@link ValidationError}, {@link AuthenticationError},
 * {@link PermissionDeniedError}, {@link NotFoundError}, {@link ConflictError},
 * {@link RateLimitError}, {@link APIError}, {@link APIConnectionError} and
 * {@link APITimeoutError}.
 *
 * `name` is the API's error name (`"validation_error"`, `"invalid_api_key"`,
 * …), not the class name; failures that never got an API answer use
 * `"application_error"`, with `statusCode` `null` when there was no HTTP
 * response at all. `requestId` is the answer's `x-request-id` (the id of the
 * request on the dashboard's Logs page), `null` without one.
 */
export class BillionSendError extends Error implements ErrorShape {
  readonly statusCode: number | null;
  override readonly name: string;
  readonly requestId: string | null;

  constructor(init: BillionSendErrorInit) {
    super(init.message);
    this.name = init.name ?? "application_error";
    this.statusCode = init.statusCode ?? null;
    this.requestId = init.requestId ?? null;
  }

  toJSON(): ErrorShape & { requestId: string | null } {
    return { statusCode: this.statusCode, name: this.name, message: this.message, requestId: this.requestId };
  }
}

/** 400 or 422: the request was refused as invalid. */
export class ValidationError extends BillionSendError {}

/** 401, or no API key configured (`missing_api_key`, `statusCode` `null`): the key is missing, malformed or revoked. */
export class AuthenticationError extends BillionSendError {}

/** 403: the key, its scope, the role or the plan does not allow this. */
export class PermissionDeniedError extends BillionSendError {}

/** 404: no such resource or endpoint. */
export class NotFoundError extends BillionSendError {}

/** 409: the request conflicts with the current state, or with an earlier use of its idempotency key. */
export class ConflictError extends BillionSendError {}

export interface RateLimitErrorInit extends BillionSendErrorInit {
  retryAfter?: number | null;
}

/** 429: a rate limit, a sending quota or a stream cap. `retryAfter` is the server's hint in seconds. */
export class RateLimitError extends BillionSendError {
  readonly retryAfter: number | null;

  constructor(init: RateLimitErrorInit) {
    super(init);
    this.retryAfter = init.retryAfter ?? null;
  }
}

/** 5xx: the API failed to answer the request. `retryAfter` is the server's hint in seconds. */
export class APIError extends BillionSendError {
  readonly retryAfter: number | null;

  constructor(init: RateLimitErrorInit) {
    super(init);
    this.retryAfter = init.retryAfter ?? null;
  }
}

/** The request never got an answer: DNS, connection, TLS or protocol failure. `statusCode` is `null`. */
export class APIConnectionError extends BillionSendError {
  constructor(message = "Connection error") {
    super({ message });
  }
}

/** The request timed out before the answer arrived. */
export class APITimeoutError extends APIConnectionError {
  constructor(message = "Request timed out") {
    super(message);
  }
}

/** A webhook whose signature, timestamp or body did not verify ({@link verifyWebhook}). */
export class WebhookVerificationError extends BillionSendError {
  constructor(message: string) {
    super({ message, name: "webhook_verification_error" });
  }
}

/** An error the client made up without an API answer (`name: "application_error"`). */
export function applicationError(message: string, statusCode: number | null = null): BillionSendError {
  return new BillionSendError({ message, statusCode });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Seconds from a `retry-after` value (seconds or an HTTP date), or `null`. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value == null || value.trim() === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, (at - now) / 1000);
}

/** The error class for a 4xx status (a 429 and a 5xx carry their own fields: see {@link errorFromResponse}). */
export function errorClass(status: number): typeof BillionSendError {
  switch (status) {
    case 400:
    case 422:
      return ValidationError;
    case 401:
      return AuthenticationError;
    case 403:
      return PermissionDeniedError;
    case 404:
      return NotFoundError;
    case 409:
      return ConflictError;
    default:
      return BillionSendError;
  }
}

/**
 * Maps a non-2xx answer to its error class, keeping the API's own
 * `ErrorResponse` when it sent one. `headers` are lower-case.
 */
export function errorFromResponse(
  status: number,
  statusText: string,
  text: string,
  headers: Record<string, string> = {},
): BillionSendError {
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  let name = "application_error";
  let message: string;
  if (isRecord(body) && typeof body.name === "string" && typeof body.message === "string") {
    name = body.name;
    message = body.message;
  } else {
    const detail = text.trim().slice(0, 200);
    const label = `${status}${statusText ? ` ${statusText}` : ""}`;
    message = detail ? `Unexpected ${label} response: ${detail}` : `Unexpected ${label} response`;
  }
  const init = { message, name, statusCode: status, requestId: headers["x-request-id"] ?? null };
  if (status === 429)
    return new RateLimitError({ ...init, retryAfter: parseRetryAfter(headers["retry-after"]) });
  if (status >= 500) return new APIError({ ...init, retryAfter: parseRetryAfter(headers["retry-after"]) });
  return new (errorClass(status))(init);
}
