import { applicationError, type BillionSendError, errorFromResponse } from "./errors.js";
import { IDEMPOTENT_METHODS, retryDelayMs, sleep } from "./retry.js";
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

/** What every method resolves to. It never rejects: failures come back in `error`. */
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
  /** Retries for 429, 5xx and network failures on idempotent requests (default 2). */
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
   * Sent as the `Idempotency-Key` header (1 to 256 characters). A repeat with
   * the same key and payload answers the first result, and it makes the
   * request safe to retry.
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
  headers?: Record<string, string | undefined>;
  idempotencyKey?: string;
  options?: RequestOptions;
  /** `false` for the few operations that take no API key. */
  auth?: boolean;
}

interface Attempt {
  result: Result<unknown>;
  retry: boolean;
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

/** Fills `{name}` placeholders, or explains which parameter is missing or empty. */
function fillPath(template: string, params: Record<string, unknown> | undefined): string | BillionSendError {
  let missing: string | undefined;
  const filled = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || String(value) === "") {
      missing ??= name;
      return "";
    }
    return encodeURIComponent(String(value));
  });
  return missing === undefined ? filled : applicationError(`Missing path parameter "${missing}"`);
}

function queryString(query: object | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
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

  /** Whether an API key is configured. */
  get hasApiKey(): boolean {
    return this.#apiKey !== undefined;
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
      return failure({
        statusCode: null,
        name: "missing_api_key",
        message: "No API key: pass one to new BillionSend() or set BILLIONSEND_API_KEY",
      });
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
    let body: string | undefined;
    if (init.body !== undefined) {
      body = JSON.stringify(init.body);
      headers["content-type"] = "application/json";
    }
    if (init.idempotencyKey !== undefined) headers["idempotency-key"] = init.idempotencyKey;
    if (auth) headers.authorization = `Bearer ${this.#apiKey}`;
    else delete headers.authorization;

    const retryable = IDEMPOTENT_METHODS.has(method) || init.idempotencyKey !== undefined;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (let attempt = 0; ; attempt++) {
      const outcome = await this.#attempt(method, url, headers, body, timeoutMs, options.signal, stream);
      if (outcome.result.error === null || !outcome.retry || !retryable || attempt >= maxRetries) {
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
    body: string | undefined,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    stream: boolean,
  ): Promise<Attempt> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", onAbort, { once: true });
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
              applicationError(
                `Expected an event stream, got ${contentType || "no content type"}`,
                response.status,
              ),
              responseHeaders,
            ),
            retry: false,
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
        return { result: { data: connection, error: null, headers: responseHeaders }, retry: false };
      }

      const text = await response.text();
      release();
      if (response.ok) {
        try {
          return { result: { data: JSON.parse(text), error: null, headers: responseHeaders }, retry: false };
        } catch {
          return {
            result: failure(
              applicationError("The response body is not valid JSON", response.status),
              responseHeaders,
            ),
            retry: false,
          };
        }
      }
      return {
        result: failure(errorFromResponse(response.status, response.statusText, text), responseHeaders),
        retry: response.status === 429 || response.status >= 500,
        retryAfter: response.headers.get("retry-after"),
      };
    } catch (cause) {
      release();
      if (signal?.aborted) return { result: failure(applicationError("Request was aborted")), retry: false };
      if (timedOut) {
        return { result: failure(applicationError(`Request timed out after ${timeoutMs} ms`)), retry: true };
      }
      return { result: failure(applicationError(`Network error: ${describe(cause)}`)), retry: true };
    }
  }
}
