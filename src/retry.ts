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
