import {
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  applicationError,
  BillionSendError,
  errorFromResponse,
} from "./errors.js";
import {
  IDEMPOTENT_METHODS,
  newIdempotencyKey,
  retryable as retryableError,
  retryDelayMs,
  sleep,
} from "./retry.js";
import type {
  ApiPath,
  HttpMethod,
  MethodOf,
  PathParams,
  QueryParams,
  RequestBody,
  ResponseBody,
} from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.billionsend.com";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;

/** Response headers, with lower-case names. */
export type ResponseHeaders = Record<string, string>;

/**
 * What every method resolves to. It never rejects: failures come back in `error`. A successful reply with
 * no body (a 204) has `data: null`; no operation of the published API answers that way today.
 */
export type Result<T> =
  | { data: T; error: null; headers: ResponseHeaders }
  | { data: null; error: BillionSendError; headers: ResponseHeaders | null };

export interface BillionSendOptions {
  /** The API key (`bs_...`). Defaults to the `BILLIONSEND_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `BILLIONSEND_BASE_URL`, then `https://api.billionsend.com`. */
  baseUrl?: string;
  /** A `fetch` implementation; defaults to the global one. */
  fetch?: typeof fetch;
  /** Per-attempt timeout in milliseconds (default 60000). Event streams are timed only until they connect. */
  timeoutMs?: number;
  /**
   * Retries for 429, 5xx, timeouts and network failures (default 2). Only
   * requests safe to repeat are retried: `GET`, `PUT` and `DELETE`, and the
   * sending operations, which always carry an `Idempotency-Key`.
   */
  maxRetries?: number;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  /** Aborts the request (and its retries). */
  signal?: AbortSignal;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
  /** Overrides the client's `timeoutMs` for this request. */
  timeoutMs?: number;
  /** Overrides the client's `maxRetries` for this request. */
  maxRetries?: number;
}

export interface IdempotentRequestOptions extends RequestOptions {
  /**
   * Sent as the `Idempotency-Key` header (1 to 256 characters): a repeat with
   * the same key and payload answers the first result instead of sending
   * again. Without one the client makes a new key for each call (a UUID), and
   * that call's retries reuse it; pass your own to make the send safe across
   * calls and processes too, such as `welcome/${user.id}`.
   */
  idempotencyKey?: string;
}

/** An open `text/event-stream` response. */
export interface StreamConnection {
  response: Response;
  close(): void;
}

export interface CallInit<P extends ApiPath, M extends HttpMethod> {
  path?: PathParams<P, M>;
  query?: QueryParams<P, M>;
  body?: RequestBody<P, M>;
  /** The body of an operation that takes `multipart/form-data`; the content type, with its boundary, is set by `fetch`. */
  form?: FormData;
  headers?: Record<string, string | undefined>;
  /** The operation honours `Idempotency-Key`: one is always sent, `idempotencyKey` or a new one. */
  idempotent?: boolean;
  idempotencyKey?: string;
  options?: RequestOptions;
  /** `false` for the few operations that take no API key. */
  auth?: boolean;
}

interface Attempt {
  result: Result<unknown>;
  retryAfter?: string | null;
}

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = env?.[name];
  return value === undefined || value === "" ? undefined : value;
}

function failure(error: BillionSendError, headers: ResponseHeaders | null = null): Result<never> {
  return { data: null, error, headers };
}

function headersOf(response: Response): ResponseHeaders {
  const out: ResponseHeaders = {};
  response.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    const inner = (cause as { cause?: unknown }).cause;
    return inner instanceof Error ? `${cause.message} (${inner.message})` : cause.message;
  }
  return String(cause);
}

function lowerCaseKeys(headers: Record<string, string | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) out[key.toLowerCase()] = value;
  }
  return out;
}

/**
 * Fills `{name}` placeholders, or explains which parameter is missing, empty or a dot segment (`.` and
 * `..` are not ids, and a URL folds them into another route: `/emails/..` is `/`).
 */
function fillPath(template: string, params: Record<string, unknown> | undefined): string | BillionSendError {
  let missing: string | undefined;
  let dotted: string | undefined;
  const filled = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || String(value) === "") {
      missing ??= name;
      return "";
    }
    const text = String(value);
    if (text === "." || text === "..") dotted ??= name;
    return encodeURIComponent(text);
  });
  if (missing !== undefined) return applicationError(`Missing path parameter "${missing}"`);
  if (dotted !== undefined) {
    return applicationError(`Invalid path parameter "${dotted}": "." and ".." are not ids`);
  }
  return filled;
}

function queryString(query: object | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      // The document's list parameters are comma-separated in one key (style form, explode false).
      // An empty list names nothing: it is left out, as `domain_id=` would be refused as an empty id.
      if (value.length > 0) params.append(key, value.map(String).join(","));
    } else {
      params.append(key, String(value));
    }
  }
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** The HTTP layer shared by every resource. */
export class Core {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly #apiKey: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #headers: Record<string, string>;

  constructor(options: BillionSendOptions) {
    this.#apiKey = options.apiKey ?? readEnv("BILLIONSEND_API_KEY");
    this.baseUrl = (options.baseUrl ?? readEnv("BILLIONSEND_BASE_URL") ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const fetchImpl = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (typeof fetchImpl !== "function") {
      throw new TypeError("No fetch implementation: use Node.js 18 or later, or pass `fetch` in the options");
    }
    if (!(this.timeoutMs > 0)) throw new TypeError("timeoutMs must be a positive number");
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new TypeError("maxRetries must be a non-negative integer");
    }
    this.#fetch = fetchImpl;
    this.#headers = lowerCaseKeys(options.headers);
  }

  /** Calls one operation and parses its JSON answer. */
  request<P extends ApiPath, M extends MethodOf<P>>(
    method: M,
    path: P,
    init: CallInit<P, M> = {},
  ): Promise<Result<ResponseBody<P, M>>> {
    return this.#execute(method, path, init, false) as Promise<Result<ResponseBody<P, M>>>;
  }

  /** Opens an event stream; the connection is timed only until the response headers arrive. */
  openStream<P extends ApiPath, M extends MethodOf<P>>(
    method: M,
    path: P,
    init: CallInit<P, M> = {},
  ): Promise<Result<StreamConnection>> {
    return this.#execute(method, path, init, true) as Promise<Result<StreamConnection>>;
  }

  async #execute(
    lowerMethod: HttpMethod,
    template: string,
    init: CallInit<ApiPath, HttpMethod>,
    stream: boolean,
  ): Promise<Result<unknown>> {
    const method = lowerMethod.toUpperCase();
    const options = init.options ?? {};
    const auth = init.auth !== false;
    if (auth && this.#apiKey === undefined) {
      return failure(
        new AuthenticationError({
          name: "missing_api_key",
          message: "No API key: pass one to new BillionSend() or set BILLIONSEND_API_KEY",
        }),
      );
    }
    const path = fillPath(template, init.path as Record<string, unknown> | undefined);
    if (typeof path !== "string") return failure(path);
    const url = `${this.baseUrl}${path}${queryString(init.query as object | undefined)}`;

    const headers: Record<string, string> = {
      accept: stream ? "text/event-stream" : "application/json",
      "user-agent": `billionsend-node/${VERSION}`,
      ...this.#headers,
      ...lowerCaseKeys(options.headers),
      ...lowerCaseKeys(init.headers),
    };
    let body: string | FormData | undefined;
    if (init.form !== undefined) {
      body = init.form;
      delete headers["content-type"];
    } else if (init.body !== undefined) {
      body = JSON.stringify(init.body);
      headers["content-type"] = "application/json";
    }
    if (init.idempotencyKey !== undefined) headers["idempotency-key"] = init.idempotencyKey;
    else if (init.idempotent && headers["idempotency-key"] === undefined) {
      headers["idempotency-key"] = newIdempotencyKey();
    }
    if (auth) headers.authorization = `Bearer ${this.#apiKey}`;
    else delete headers.authorization;

    const keyed = headers["idempotency-key"] !== undefined;
    const retryable = IDEMPOTENT_METHODS.has(method) || keyed;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (let attempt = 0; ; attempt++) {
      const outcome = await this.#attempt(method, url, headers, body, timeoutMs, options.signal, stream);
      const error = outcome.result.error;
      if (error === null || !retryable || attempt >= maxRetries || !retryableError(error, keyed)) {
        return outcome.result;
      }
      const delay = retryDelayMs(attempt, outcome.retryAfter);
      if (delay === undefined) return outcome.result;
      if (!(await sleep(delay, options.signal))) return failure(applicationError("Request was aborted"));
    }
  }

  async #attempt(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | FormData | undefined,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    stream: boolean,
  ): Promise<Attempt> {
    // A caller that already gave up gets no request, whatever the fetch implementation does with the signal.
    if (signal?.aborted) return { result: failure(applicationError("Request was aborted")) };
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const release = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    try {
      const response = await this.#fetch(url, { method, headers, body, signal: controller.signal });
      const responseHeaders = headersOf(response);

      if (stream && response.ok) {
        clearTimeout(timer);
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          release();
          controller.abort();
          return {
            result: failure(
              new BillionSendError({
                message: `Expected an event stream, got ${contentType || "no content type"}`,
                statusCode: response.status,
                requestId: responseHeaders["x-request-id"] ?? null,
              }),
              responseHeaders,
            ),
          };
        }
        let closed = false;
        const connection: StreamConnection = {
          response,
          close: () => {
            if (closed) return;
            closed = true;
            release();
            controller.abort();
          },
        };
        return { result: { data: connection, error: null, headers: responseHeaders } };
      }

      const text = await response.text();
      release();
      if (response.ok) {
        // A success with no body (a 204) has nothing to parse: it is not a JSON error.
        if (text.trim() === "")
          return { result: { data: null as never, error: null, headers: responseHeaders } };
        try {
          return { result: { data: JSON.parse(text), error: null, headers: responseHeaders } };
        } catch {
          return {
            result: failure(
              new BillionSendError({
                message: "The response body is not valid JSON",
                statusCode: response.status,
                requestId: responseHeaders["x-request-id"] ?? null,
              }),
              responseHeaders,
            ),
          };
        }
      }
      return {
        result: failure(
          errorFromResponse(response.status, response.statusText, text, responseHeaders),
          responseHeaders,
        ),
        retryAfter: response.headers.get("retry-after"),
      };
    } catch (cause) {
      release();
      if (signal?.aborted) return { result: failure(applicationError("Request was aborted")) };
      if (timedOut)
        return { result: failure(new APITimeoutError(`Request timed out after ${timeoutMs} ms`)) };
      return { result: failure(new APIConnectionError(`Network error: ${describe(cause)}`)) };
    }
  }
}
