/**
 * An error, in the shape of the API's `ErrorResponse`. Failures that never got
 * an answer from the API (network errors, timeouts, aborts, unreadable bodies)
 * use the same shape with `name: "application_error"`; `statusCode` is then
 * `null` when there was no HTTP response at all.
 */
export interface BillionSendError {
  statusCode: number | null;
  name: string;
  message: string;
}

/**
 * Thrown only by the iterating helpers (`listAll`, `searchAll`, event streams),
 * which cannot return a `{ data, error }` result for every item. It carries the
 * same three fields as {@link BillionSendError}.
 */
export class BillionSendRequestError extends Error implements BillionSendError {
  readonly statusCode: number | null;
  override readonly name: string;

  constructor(error: BillionSendError) {
    super(error.message);
    this.statusCode = error.statusCode;
    this.name = error.name;
  }

  toJSON(): BillionSendError {
    return { statusCode: this.statusCode, name: this.name, message: this.message };
  }
}

export function applicationError(message: string, statusCode: number | null = null): BillionSendError {
  return { statusCode, name: "application_error", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Maps a non-2xx answer to an error, keeping the API's own `ErrorResponse` when it sent one. */
export function errorFromResponse(status: number, statusText: string, text: string): BillionSendError {
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (isRecord(body) && typeof body.name === "string" && typeof body.message === "string") {
    return {
      statusCode: typeof body.statusCode === "number" ? body.statusCode : status,
      name: body.name,
      message: body.message,
    };
  }
  const detail = text.trim().slice(0, 200);
  const label = `${status}${statusText ? ` ${statusText}` : ""}`;
  return applicationError(
    detail ? `Unexpected ${label} response: ${detail}` : `Unexpected ${label} response`,
    status,
  );
}
