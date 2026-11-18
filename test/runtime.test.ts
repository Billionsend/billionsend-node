// The hand-written runtime, one behaviour at a time: how the client reads its settings, builds a
// request, retries, times out, turns failures into errors, uploads files and watches a stream.
// The calls go to a stub `fetch` (exact control of every answer and every wait) or to a real local
// HTTP server where the bytes on the wire are the point. Answers that stand for an operation's
// result are built from the OpenAPI schema (`okBody`), never typed by hand.
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BillionSend,
  BillionSendError,
  type BillionSendOptions,
  DEFAULT_BASE_URL,
  NotFoundError,
  type RateLimitError,
  VERSION,
} from "../src/index.js";
import { newIdempotencyKey } from "../src/retry.js";
import { okBody } from "./helpers.js";

// The originals, taken before any test replaces them.
const REAL_SET_TIMEOUT = globalThis.setTimeout;
const REAL_CRYPTO = globalThis.crypto;

const KEY = "bs_runtime_test";
const BASE = "https://api.test";
const usage = okBody("GET /usage");
const refused = (status: number, name = "refused", message = "No") => ({ statusCode: status, name, message });

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
  at: number;
}

/** A client whose fetch is a script: `answers` are used in order, the last one repeats. */
function scripted(
  answers: (Response | Error | ((call: Call) => Response | Promise<Response>))[],
  options: BillionSendOptions = {},
) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body,
      at: Date.now(),
    });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    const call = calls.at(-1) as Call;
    return typeof answer === "function" ? answer(call) : (answer as Response).clone();
  }) as typeof fetch;
  const bs = new BillionSend({ apiKey: KEY, baseUrl: BASE, fetch: fetchImpl, ...options });
  return { bs, calls };
}

function portOf(server: Server | undefined): number {
  if (!server) throw new Error("no server");
  return (server.address() as AddressInfo).port;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("configuration", () => {
  it("prefers the options over the environment, and the environment over the defaults", async () => {
    vi.stubEnv("BILLIONSEND_API_KEY", "bs_env");
    vi.stubEnv("BILLIONSEND_BASE_URL", "https://env.test");
    const fromEnv = scripted([json(200, usage)], { apiKey: undefined, baseUrl: undefined });
    await fromEnv.bs.usage.get();
    expect(fromEnv.calls[0]?.url.href).toBe("https://env.test/usage");
    expect(fromEnv.calls[0]?.headers.get("authorization")).toBe("Bearer bs_env");

    const fromOptions = scripted([json(200, usage)], { apiKey: "bs_option", baseUrl: "https://option.test" });
    await fromOptions.bs.usage.get();
    expect(fromOptions.calls[0]?.url.href).toBe("https://option.test/usage");
    expect(fromOptions.calls[0]?.headers.get("authorization")).toBe("Bearer bs_option");
  });

  it("falls back to the default base URL and treats an empty environment variable as unset", () => {
    vi.stubEnv("BILLIONSEND_BASE_URL", "");
    vi.stubEnv("BILLIONSEND_API_KEY", "");
    expect(new BillionSend().baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("trims trailing slashes from the base URL and keeps a path prefix", async () => {
    const { bs, calls } = scripted([json(200, usage)], { baseUrl: "https://gateway.test/billionsend///" });
    expect(bs.baseUrl).toBe("https://gateway.test/billionsend");
    await bs.usage.get();
    expect(calls[0]?.url.href).toBe("https://gateway.test/billionsend/usage");
  });

  it("reports a missing key as an AuthenticationError without making a request", async () => {
    vi.stubEnv("BILLIONSEND_API_KEY", "");
    const { bs, calls } = scripted([json(200, usage)], { apiKey: undefined });
    const result = await bs.usage.get();
    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error?.name).toBe("missing_api_key");
    expect(result.error?.message).toMatch(/BILLIONSEND_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("works where there is no process object (a browser or an edge runtime)", async () => {
    vi.stubGlobal("process", undefined);
    const { bs, calls } = scripted([json(200, usage)]);
    expect((await bs.usage.get()).error).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("refuses to start without a fetch", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => new BillionSend({ apiKey: KEY })).toThrow(/No fetch implementation/);
  });

  it("sends the package's own version as the user agent", async () => {
    const { bs, calls } = scripted([json(200, usage)]);
    await bs.usage.get();
    const pkg = (await import("../package.json", { with: { type: "json" } })).default as { version: string };
    expect(VERSION).toBe(pkg.version);
    expect(calls[0]?.headers.get("user-agent")).toBe(`billionsend-node/${pkg.version}`);
  });
});

describe("building a request", () => {
  const get = async (id: string) => {
    const { bs, calls } = scripted([json(404, refused(404, "not_found"))]);
    await bs.templates.get(id);
    return calls[0]?.url.pathname ?? "";
  };

  it("encodes every character a path id may carry as one segment", async () => {
    expect(await get("a/b")).toBe("/templates/a%2Fb");
    expect(await get("a b")).toBe("/templates/a%20b");
    expect(await get("100%41")).toBe("/templates/100%2541");
    expect(await get("日本語")).toBe("/templates/%E6%97%A5%E6%9C%AC%E8%AA%9E");
    expect(await get("ü?x=1#y")).toBe("/templates/%C3%BC%3Fx%3D1%23y");
    expect(await get("ana+tag@example.com")).toBe("/templates/ana%2Btag%40example.com");
  });

  it("round-trips an id through the path", async () => {
    for (const id of ["a/b", "a b", "100%41", "日本語", "x+y@z.co"]) {
      expect(decodeURIComponent((await get(id)).slice("/templates/".length))).toBe(id);
    }
  });

  it("refuses a missing, empty or null path parameter before any request", async () => {
    const { bs, calls } = scripted([json(200, usage)]);
    for (const id of ["", undefined as never, null as never]) {
      const result = await bs.templates.get(id);
      expect(result.error).toMatchObject({
        name: "application_error",
        message: 'Missing path parameter "id"',
      });
    }
    expect(calls).toHaveLength(0);
  });

  it("encodes query values: booleans, zero, lists, special characters; leaves out undefined, null and empty lists", async () => {
    const { bs, calls } = scripted([json(200, okBody("GET /inboxes/{inbox_id}/threads"))]);
    await bs.inboxes.threads.list("inbox", {
      read: false,
      starred: true,
      limit: 0,
      after: undefined,
      before: null as never,
      folders: "a&b=c d",
    } as never);
    await bs.emails.metrics({ metrics: [], domain_id: ["a,b", "c"] } as never);
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      read: "false",
      starred: "true",
      limit: "0",
      folders: "a&b=c d",
    });
    expect(calls[0]?.url.search).toContain("folders=a%26b%3Dc+d");
    expect(calls[1]?.url.searchParams.has("metrics")).toBe(false);
    expect(calls[1]?.url.searchParams.getAll("domain_id")).toEqual(["a,b,c"]);
  });

  it("layers headers: client, then call, then the SDK's own; the key and the content type are the SDK's", async () => {
    const { bs, calls } = scripted([json(200, okBody("POST /domains"))], {
      headers: { "X-Layer": "client", Authorization: "Bearer leaked", "Content-Type": "text/plain" },
    });
    await bs.domains.create({ name: "example.com" }, { headers: { "x-layer": "call", "X-Other": "1" } });
    const headers = calls[0]?.headers;
    expect(headers?.get("x-layer")).toBe("call");
    expect(headers?.get("x-other")).toBe("1");
    expect(headers?.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers?.get("content-type")).toBe("application/json");
    expect(headers?.get("accept")).toBe("application/json");
    expect(calls[0]?.body).toBe(JSON.stringify({ name: "example.com" }));
  });

  it("sends no body and no content type for a request without one", async () => {
    const { bs, calls } = scripted([json(200, usage)]);
    await bs.usage.get();
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.has("content-type")).toBe(false);
  });

  it("passes unknown fields, nulls and nesting of an answer through untouched", async () => {
    const answer = {
      ...(usage as object),
      future_field: { nested: [1, null, { deep: "x" }] },
      nothing: null,
    };
    const result = await scripted([json(200, answer)]).bs.usage.get();
    expect(result.data).toEqual(answer);
  });
});

describe("retries and waits", () => {
  /** Runs `start()` with every timer resolved at once and returns what each wait was asked to be. */
  async function waits<T>(
    start: () => Promise<T>,
    timeoutMs: number,
  ): Promise<{ delays: number[]; value: T }> {
    const delays: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      if (ms !== timeoutMs) delays.push(ms ?? 0);
      return REAL_SET_TIMEOUT(fn, ms === timeoutMs ? ms : 0);
    }) as typeof setTimeout);
    return { delays, value: await start() };
  }
  const busy = (extra: Record<string, string> = {}) => json(503, refused(503, "unavailable", "Busy"), extra);

  it("waits exactly the Retry-After seconds", async () => {
    const { bs, calls } = scripted([busy({ "retry-after": "7" }), json(200, usage)], { timeoutMs: 987_654 });
    const { delays, value } = await waits(() => bs.usage.get(), 987_654);
    expect(value.error).toBeNull();
    expect(delays).toEqual([7000]);
    expect(calls).toHaveLength(2);
  });

  it("waits until a Retry-After HTTP date", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-19T10:00:00Z"), toFake: ["Date"] });
    const { bs } = scripted([busy({ "retry-after": "Thu, 19 Nov 2026 10:00:09 GMT" }), json(200, usage)], {
      timeoutMs: 987_654,
    });
    const { delays } = await waits(() => bs.usage.get(), 987_654);
    expect(delays).toEqual([9000]);
  });

  it("does not wait at all for an HTTP date in the past", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-19T10:00:00Z"), toFake: ["Date"] });
    const { bs } = scripted([busy({ "retry-after": "Thu, 19 Nov 2026 09:00:00 GMT" }), json(200, usage)], {
      timeoutMs: 987_654,
    });
    expect((await waits(() => bs.usage.get(), 987_654)).delays).toEqual([0]);
  });

  it("backs off 0.5 s, 1 s, 2 s with up to a quarter of jitter when no usable Retry-After came", async () => {
    const { bs, calls } = scripted([busy({ "retry-after": "soon" }), busy(), busy()], {
      maxRetries: 2,
      timeoutMs: 987_654,
    });
    const { delays, value } = await waits(() => bs.usage.get(), 987_654);
    expect(calls).toHaveLength(3);
    expect(value.error?.statusCode).toBe(503);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(375);
    expect(delays[0]).toBeLessThanOrEqual(500);
    expect(delays[1]).toBeGreaterThanOrEqual(750);
    expect(delays[1]).toBeLessThanOrEqual(1000);
  });

  it("returns a 429 or 5xx whose Retry-After is over a minute without waiting", async () => {
    for (const answer of [
      json(429, refused(429, "rate_limit_exceeded"), { "retry-after": "61" }),
      busy({ "retry-after": "86400" }),
    ]) {
      const { bs, calls } = scripted([answer, json(200, usage)], { timeoutMs: 987_654 });
      const { delays, value } = await waits(() => bs.usage.get(), 987_654);
      expect(value.error).toBeInstanceOf(BillionSendError);
      expect(delays).toEqual([]);
      expect(calls).toHaveLength(1);
    }
  });

  it("retries a request without Idempotency-Key only when its method is safe to repeat", async () => {
    const attempts = async (call: (bs: BillionSend) => Promise<unknown>) => {
      const { bs, calls } = scripted([busy({ "retry-after": "0" }), busy({ "retry-after": "0" })], {
        maxRetries: 1,
      });
      await call(bs);
      return calls.length;
    };
    expect(await attempts((bs) => bs.usage.get())).toBe(2); // GET
    expect(await attempts((bs) => bs.domains.delete("d"))).toBe(2); // DELETE
    expect(await attempts((bs) => bs.inboxes.threads.labels.set("i", "t", { label_ids: [] } as never))).toBe(
      2,
    ); // PUT
    expect(await attempts((bs) => bs.domains.update("d", { open_tracking: true }))).toBe(1); // PATCH
    expect(await attempts((bs) => bs.domains.create({ name: "example.com" }))).toBe(1); // POST
  });

  it("does not repeat a POST without a key after a network failure, but does repeat a keyed one", async () => {
    const down = new TypeError("fetch failed");
    const plain = scripted([down, json(200, okBody("POST /domains"))], { maxRetries: 2, timeoutMs: 987_654 });
    const first = await waits(() => plain.bs.domains.create({ name: "example.com" }), 987_654);
    expect(first.value.error).toBeInstanceOf(APIConnectionError);
    expect(plain.calls).toHaveLength(1);

    const keyed = scripted([down, json(200, okBody("POST /emails"))], { maxRetries: 2, timeoutMs: 987_654 });
    const second = await waits(
      () => keyed.bs.emails.send({ from: "a@example.com", to: "b@example.com", subject: "s", text: "t" }),
      987_654,
    );
    expect(second.value.error).toBeNull();
    expect(keyed.calls).toHaveLength(2);
    expect(keyed.calls[1]?.headers.get("idempotency-key")).toBe(
      keyed.calls[0]?.headers.get("idempotency-key"),
    );
  });

  it("never retries an answer that will not change", async () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      const { bs, calls } = scripted([json(status, refused(status, "final")), json(200, usage)]);
      const result = await bs.usage.get();
      expect(result.error?.statusCode).toBe(status);
      expect(calls).toHaveLength(1);
    }
  });

  it("stops waiting when the caller aborts during a back-off", async () => {
    const controller = new AbortController();
    const { bs, calls } = scripted([busy({ "retry-after": "30" }), json(200, usage)]);
    const pending = bs.usage.get({ signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    const result = await pending;
    expect(result.error).toMatchObject({ name: "application_error", message: "Request was aborted" });
    expect(calls).toHaveLength(1);
  });

  it("makes no request at all for a signal that is already aborted", async () => {
    const { bs, calls } = scripted([json(200, usage)]);
    const result = await bs.usage.get({ signal: AbortSignal.abort() });
    expect(result.error?.message).toBe("Request was aborted");
    expect(calls).toHaveLength(0);
  });
});

describe("errors", () => {
  it("keeps the API's ErrorResponse and the request id", async () => {
    const answer = json(422, refused(422, "validation_error", "Bad field"), { "x-request-id": "req_9" });
    const result = await scripted([answer]).bs.usage.get();
    expect(result.error?.toJSON()).toEqual({
      statusCode: 422,
      name: "validation_error",
      message: "Bad field",
      requestId: "req_9",
    });
    expect(result.headers?.["x-request-id"]).toBe("req_9");
  });

  it("turns an HTML gateway page into application_error with a clipped message", async () => {
    const page = `<html>${"x".repeat(500)}</html>`;
    const answer = new Response(page, {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "content-type": "text/html" },
    });
    const result = await scripted([answer], { maxRetries: 0 }).bs.usage.get();
    expect(result.error).toBeInstanceOf(APIError);
    expect(result.error).toMatchObject({ statusCode: 502, name: "application_error" });
    expect(result.error?.message.startsWith("Unexpected 502 Bad Gateway response: <html>")).toBe(true);
    expect(result.error?.message.length).toBeLessThan(260);
  });

  it("turns an empty or JSON-but-not-ErrorResponse error body into application_error", async () => {
    for (const body of ["", "[]", '"text"', '{"error":"x"}', '{"name":"n"}']) {
      const answer = new Response(body, { status: 500, headers: { "content-type": "application/json" } });
      const result = await scripted([answer], { maxRetries: 0 }).bs.usage.get();
      expect(result.error, body).toBeInstanceOf(APIError);
      expect(result.error?.name, body).toBe("application_error");
      expect(result.error?.message, body).toMatch(/^Unexpected 500/);
    }
  });

  it("reads Retry-After seconds and HTTP dates onto a RateLimitError and an APIError", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-19T10:00:00Z"), toFake: ["Date"] });
    const limited = await scripted([json(429, refused(429), { "retry-after": "12" })], {
      maxRetries: 0,
    }).bs.usage.get();
    expect((limited.error as RateLimitError).retryAfter).toBe(12);
    const dated = await scripted(
      [json(429, refused(429), { "retry-after": "Thu, 19 Nov 2026 10:00:30 GMT" })],
      {
        maxRetries: 0,
      },
    ).bs.usage.get();
    expect((dated.error as RateLimitError).retryAfter).toBe(30);
    const none = await scripted([json(429, refused(429))], { maxRetries: 0 }).bs.usage.get();
    expect((none.error as RateLimitError).retryAfter).toBeNull();
    const server = await scripted([json(503, refused(503), { "retry-after": "bogus" })], {
      maxRetries: 0,
    }).bs.usage.get();
    expect((server.error as APIError).retryAfter).toBeNull();
  });

  it("gives an unlisted 4xx the base class, with the API's name", async () => {
    const result = await scripted([json(418, refused(418, "teapot", "No coffee"))]).bs.usage.get();
    expect(result.error).toBeInstanceOf(BillionSendError);
    expect(result.error).not.toBeInstanceOf(NotFoundError);
    expect(result.error).toMatchObject({ statusCode: 418, name: "teapot" });
  });

  it("reports a 2xx without a JSON body as an error that names the status", async () => {
    for (const answer of [
      new Response(null, { status: 204 }),
      new Response("", { status: 200 }),
      new Response("<p>", { status: 200 }),
    ]) {
      const result = await scripted([answer]).bs.usage.get();
      expect(result.data).toBeNull();
      expect(result.error).toMatchObject({
        name: "application_error",
        message: "The response body is not valid JSON",
      });
      expect(result.error?.statusCode).toBe(answer.status);
    }
  });

  it("describes a failed fetch, with its cause, and never rejects", async () => {
    const withCause = new TypeError("fetch failed", { cause: new Error("ECONNREFUSED 127.0.0.1") });
    const a = await scripted([withCause], { maxRetries: 0 }).bs.usage.get();
    expect(a.error).toBeInstanceOf(APIConnectionError);
    expect(a.error?.message).toBe("Network error: fetch failed (ECONNREFUSED 127.0.0.1)");
    const b = await scripted([Object.assign(new Error("plain"), {})], { maxRetries: 0 }).bs.usage.get();
    expect(b.error?.message).toBe("Network error: plain");
    const c = await scripted([(() => Promise.reject("boom")) as never], { maxRetries: 0 }).bs.usage.get();
    expect(c.error?.message).toBe("Network error: boom");
    expect(c.error?.statusCode).toBeNull();
    expect(c.headers).toBeNull();
  });
});

describe("an event stream answered without any content type", () => {
  it("is refused, naming that there was none", async () => {
    const { bs } = scripted([new Response(null, { status: 200 })]);
    const result = await bs.inboxes.events.stream();
    expect(result.error?.message).toBe("Expected an event stream, got no content type");
    expect(result.error?.statusCode).toBe(200);
  });
});

describe("timeouts", () => {
  let server: Server | undefined;
  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((done) => server?.close(done));
    server = undefined;
  });

  async function stalling(): Promise<string> {
    server = createServer((_, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"object":"usage"'); // the headers and half a body, then nothing
    });
    await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
    return `http://127.0.0.1:${portOf(server)}`;
  }

  it("times out a body that stops arriving after the headers", async () => {
    const bs = new BillionSend({ apiKey: KEY, baseUrl: await stalling(), timeoutMs: 150, maxRetries: 0 });
    const started = Date.now();
    const result = await bs.usage.get();
    expect(result.error).toBeInstanceOf(APITimeoutError);
    expect(result.error?.message).toBe("Request timed out after 150 ms");
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("lets one call override the client's timeout, and times each attempt on its own", async () => {
    const bs = new BillionSend({ apiKey: KEY, baseUrl: await stalling(), timeoutMs: 60_000, maxRetries: 1 });
    const result = await bs.usage.get({ timeoutMs: 100, maxRetries: 0 });
    expect(result.error?.message).toBe("Request timed out after 100 ms");
    const retried = await bs.usage.get({ timeoutMs: 80, maxRetries: 1 });
    expect(retried.error).toBeInstanceOf(APITimeoutError);
  });
});

describe("uploads", () => {
  let server: Server | undefined;
  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((done) => server?.close(done));
    server = undefined;
  });

  interface Received {
    headers: IncomingMessage["headers"];
    form: FormData;
    bytes: number;
  }

  async function uploadTo(send: (bs: BillionSend) => Promise<unknown>): Promise<Received> {
    let received: Received | undefined;
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const raw = Buffer.concat(chunks);
        const form = await new Response(raw, {
          headers: { "content-type": String(req.headers["content-type"]) },
        }).formData();
        received = { headers: req.headers, form, bytes: raw.length };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(okBody("POST /contacts/imports")));
      });
    });
    await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
    const bs = new BillionSend({
      apiKey: KEY,
      baseUrl: `http://127.0.0.1:${portOf(server)}`,
    });
    await send(bs);
    if (!received) throw new Error("nothing arrived");
    return received;
  }

  it("uploads CSV text as a file named contacts.csv with the CSV content type and a boundary", async () => {
    const got = await uploadTo((bs) => bs.contacts.imports.create({ file: "email\nana@example.com\n" }));
    expect(String(got.headers["content-type"])).toMatch(/^multipart\/form-data; boundary=/);
    const file = got.form.get("file") as File;
    expect(file.name).toBe("contacts.csv");
    expect(file.type).toBe("text/csv");
    expect(await file.text()).toBe("email\nana@example.com\n");
  });

  it("keeps a File's own name and type, and lets `filename` win; non-ASCII names arrive intact", async () => {
    const named = await uploadTo((bs) =>
      bs.contacts.imports.create({ file: new File(["email\n"], "联系人.csv", { type: "text/plain" }) }),
    );
    expect((named.form.get("file") as File).name).toBe("联系人.csv");
    expect((named.form.get("file") as File).type).toBe("text/plain");
    await server?.close();
    const renamed = await uploadTo((bs) =>
      bs.contacts.imports.create({ file: new Blob(["email\n"]), filename: 'ü "quoted" ñ.csv' }),
    );
    expect((renamed.form.get("file") as File).name).toMatch(/ü .*quoted.* ñ\.csv$/);
  });

  it("sends the settings as the JSON text the endpoint reads, and text you encoded yourself unchanged", async () => {
    const got = await uploadTo((bs) =>
      bs.contacts.imports.create({
        file: "email\n",
        column_map: { email: "Email" },
        on_conflict: "upsert",
        segments: [{ id: "s1" }],
        topics: '[{"id":"t1","subscription":"opt_in"}]',
      }),
    );
    expect(got.form.get("column_map")).toBe('{"email":"Email"}');
    expect(got.form.get("on_conflict")).toBe("upsert");
    expect(got.form.get("segments")).toBe('[{"id":"s1"}]');
    expect(got.form.get("topics")).toBe('[{"id":"t1","subscription":"opt_in"}]');
  });

  it("uploads a large file byte for byte", async () => {
    const big = Buffer.alloc(12 * 1024 * 1024);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31) % 251;
    const got = await uploadTo((bs) =>
      bs.contacts.imports.create({ file: new Blob([big]), filename: "big.csv" }),
    );
    const file = got.form.get("file") as File;
    expect(file.size).toBe(big.length);
    expect(
      createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex"),
    ).toBe(createHash("sha256").update(big).digest("hex"));
    expect(got.headers.authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("a stream that goes silent", () => {
  let server: Server | undefined;
  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise((done) => server?.close(done));
    server = undefined;
  });

  type Handler = (n: number, req: IncomingMessage, write: (text: string) => void, end: () => void) => void;

  async function serve(handler: Handler): Promise<{ bs: BillionSend; connections: IncomingMessage[] }> {
    const connections: IncomingMessage[] = [];
    server = createServer((req, res) => {
      connections.push(req);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      handler(
        connections.length,
        req,
        (text) => res.write(text),
        () => res.end(),
      );
    });
    await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
    const bs = new BillionSend({
      apiKey: KEY,
      baseUrl: `http://127.0.0.1:${portOf(server)}`,
    });
    return { bs, connections };
  }

  const event = (id: string) =>
    `id: ${id}\nevent: inbox.email.received\ndata: {"type":"inbox.email.received","inbox_id":"i"}\n\n`;

  it("drops a connection that delivered nothing for idleTimeoutMs and resumes from the last event id", async () => {
    const { bs, connections } = await serve((n, _req, write) => {
      write(event(n === 1 ? "1" : "2")); // then silence, with the socket still open
    });
    const opened = await bs.inboxes.events.stream({}, { idleTimeoutMs: 120, reconnectDelayMs: 10 });
    if (opened.error) throw opened.error;
    const ids: string[] = [];
    for await (const item of opened.data) {
      ids.push(item.id ?? "gap");
      if (ids.length === 2) break;
    }
    expect(ids).toEqual(["1", "2"]);
    expect(connections[1]?.headers["last-event-id"]).toBe("1");
  });

  it("counts keep-alive comments as activity", async () => {
    const { bs, connections } = await serve((_n, _req, write, end) => {
      let beats = 0;
      const timer = setInterval(() => {
        write(": keep-alive\n\n");
        if (++beats === 8) {
          clearInterval(timer);
          write(event("1"));
          end();
        }
      }, 50);
    });
    const opened = await bs.inboxes.events.stream({}, { idleTimeoutMs: 150, reconnect: false });
    if (opened.error) throw opened.error;
    const ids: string[] = [];
    for await (const item of opened.data) ids.push(item.id ?? "gap");
    expect(ids).toEqual(["1"]);
    expect(connections).toHaveLength(1);
  });

  it("waits forever on a silent connection only when idleTimeoutMs is 0", async () => {
    const { bs, connections } = await serve(() => {});
    const opened = await bs.inboxes.events.stream({}, { idleTimeoutMs: 0, reconnectDelayMs: 10 });
    if (opened.error) throw opened.error;
    setTimeout(() => opened.data.close(), 400);
    for await (const _ of opened.data) {
      // nothing arrives
    }
    expect(connections).toHaveLength(1);
  });
});

describe("newIdempotencyKey without Web Crypto's randomUUID", () => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("builds a version 4 UUID from getRandomValues", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => REAL_CRYPTO.getRandomValues(bytes) });
    expect(newIdempotencyKey()).toMatch(pattern);
  });

  it("builds one from Math.random when there is no Web Crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    const a = newIdempotencyKey();
    expect(a).toMatch(pattern);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe("Web Crypto missing from the global object (Node.js 18)", () => {
  it("verifies a webhook through node:crypto", async () => {
    vi.stubGlobal("crypto", undefined);
    const { verifyWebhook } = await import("../src/index.js");
    const event = await verifyWebhook(
      '{"test": 2432232314}',
      {
        "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
        "webhook-timestamp": "1614265330",
        "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      },
      "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      { now: new Date(1614265330 * 1000) },
    );
    expect(event).toEqual({ test: 2432232314 });
  });
});
