import { describe, expect, it } from "vitest";
import { MAX_RETRY_AFTER_MS, retryDelayMs, sleep } from "../src/retry.js";

describe("retryDelayMs", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");

  it("uses retry-after seconds", () => {
    expect(retryDelayMs(0, "2", now)).toBe(2000);
    expect(retryDelayMs(0, "0.25", now)).toBe(250);
    expect(retryDelayMs(0, "0", now)).toBe(0);
  });

  it("uses a retry-after HTTP date", () => {
    expect(retryDelayMs(0, "Mon, 16 Nov 2026 12:00:05 GMT", now)).toBe(5000);
    expect(retryDelayMs(0, "Mon, 16 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });

  it("gives up on a retry-after past the cap", () => {
    expect(retryDelayMs(0, String(MAX_RETRY_AFTER_MS / 1000 + 1), now)).toBeUndefined();
  });

  it("backs off exponentially with jitter when there is no usable retry-after", () => {
    expect(retryDelayMs(0, null, now, () => 0)).toBe(500);
    expect(retryDelayMs(1, undefined, now, () => 0)).toBe(1000);
    expect(retryDelayMs(2, "soon", now, () => 0)).toBe(2000);
    expect(retryDelayMs(10, null, now, () => 0)).toBe(8000);
    expect(retryDelayMs(0, null, now, () => 1)).toBe(375);
  });
});

describe("sleep", () => {
  it("resolves false when aborted", async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
    const aborted = new AbortController();
    aborted.abort();
    expect(await sleep(10_000, aborted.signal)).toBe(false);
    expect(await sleep(1)).toBe(true);
  });
});

describe("BillionSendRequestError", () => {
  it("carries the error fields and serialises to them", async () => {
    const { BillionSendRequestError } = await import("../src/index.js");
    const error = new BillionSendRequestError({
      statusCode: 429,
      name: "rate_limit_exceeded",
      message: "Slow down",
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Slow down");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      statusCode: 429,
      name: "rate_limit_exceeded",
      message: "Slow down",
    });
  });
});
