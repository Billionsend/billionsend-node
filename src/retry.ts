import { APIConnectionError, type BillionSendError } from "./errors.js";

/** A `retry-after` longer than this is not waited for: the error is returned instead. */
export const MAX_RETRY_AFTER_MS = 60_000;

const BASE_DELAY_MS = 500;
const MAX_BACKOFF_MS = 8_000;

/** Methods safe to repeat without an `Idempotency-Key`. */
export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/**
 * How long to wait before retry number `attempt + 1`: the server's
 * `retry-after` (seconds or an HTTP date) when it sent one, otherwise an
 * exponential backoff with jitter. `undefined` means "do not retry", which is
 * the answer for a `retry-after` longer than {@link MAX_RETRY_AFTER_MS}.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter: string | null | undefined,
  now: number = Date.now(),
  random: () => number = Math.random,
): number | undefined {
  if (retryAfter != null && retryAfter.trim() !== "") {
    let ms: number | undefined;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      ms = Math.max(0, seconds * 1000);
    } else {
      const at = Date.parse(retryAfter);
      if (!Number.isNaN(at)) ms = Math.max(0, at - now);
    }
    if (ms !== undefined) return ms > MAX_RETRY_AFTER_MS ? undefined : Math.ceil(ms);
  }
  const backoff = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(backoff * (1 - random() * 0.25));
}

/**
 * Whether a failed attempt may be retried: a 429, a 5xx, a timeout or a
 * network failure; and, for a request that carries an `Idempotency-Key`, the
 * `409 concurrent_idempotent_requests` the API answers while the first attempt
 * with that key is still being processed (other 409s are final).
 */
export function retryable(error: BillionSendError, idempotencyKey: boolean): boolean {
  if (error instanceof APIConnectionError) return true;
  const status = error.statusCode;
  if (status === null) return false;
  if (status === 429 || status >= 500) return true;
  return idempotencyKey && status === 409 && error.name === "concurrent_idempotent_requests";
}

/** A new idempotency key: a random UUID (version 4). */
export function newIdempotencyKey(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") webCrypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Resolves `true` after `ms`, or `false` as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
