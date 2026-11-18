import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BillionSend,
  BillionSendError,
  ConflictError,
  DEFAULT_BASE_URL,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ValidationError,
  VERSION,
} from "../src/index.js";
import { API_KEY, ID, okBody, useContractMock } from "./helpers.js";

const { mock, client } = useContractMock();

const send = { from: "hello@example.com", to: "person@example.com", subject: "Hi", text: "Hi" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration", () => {
  it("takes the key as a string and defaults the base URL", () => {
    vi.stubEnv("BILLIONSEND_BASE_URL", "");
    const bs = new BillionSend("bs_x");
    expect(bs.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("reads BILLIONSEND_API_KEY and BILLIONSEND_BASE_URL", async () => {
    vi.stubEnv("BILLIONSEND_API_KEY", "bs_from_env");
    vi.stubEnv("BILLIONSEND_BASE_URL", `${mock.url}/`);
    const bs = new BillionSend();
    expect(bs.baseUrl).toBe(mock.url);
    const result = await bs.usage.get();
    expect(result.error).toBeNull();
    expect(mock.hits[0]?.headers.authorization).toBe("Bearer bs_from_env");
  });

  it("returns missing_api_key without calling the API when no key is set", async () => {
    vi.stubEnv("BILLIONSEND_API_KEY", "");
    const bs = new BillionSend({ baseUrl: mock.url });
    const result = await bs.emails.send(send);
    expect(result).toMatchObject({ data: null, headers: null });
    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error).toMatchObject({
      statusCode: null,
      name: "missing_api_key",
      message: expect.stringContaining("BILLIONSEND_API_KEY"),
      requestId: null,
    });
    expect(mock.hits).toEqual([]);
  });

  it("lets agent.signup run without a key and never sends one to it", async () => {
    vi.stubEnv("BILLIONSEND_API_KEY", "");
    const keyless = new BillionSend({ baseUrl: mock.url });
    expect((await keyless.agent.signup({ human_email: "me@example.com", name: "Agent" })).error).toBeNull();
    const keyed = client({ headers: { Authorization: "Bearer leaked" } });
    expect((await keyed.agent.signup({ human_email: "me@example.com", name: "Agent" })).error).toBeNull();
    expect(mock.hits.map((hit) => hit.headers.authorization)).toEqual([undefined, undefined]);
  });

  it("sends the user agent, JSON headers and custom headers", async () => {
    const bs = client({ headers: { "X-Trace": "client" } });
    await bs.emails.send(send, { headers: { "x-request-tag": "one" } });
    const headers = mock.hits[0]?.headers ?? {};
    expect(headers["user-agent"]).toBe(`billionsend-node/${VERSION}`);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.accept).toBe("application/json");
    expect(headers["x-trace"]).toBe("client");
    expect(headers["x-request-tag"]).toBe("one");
  });

  it("sends a new Idempotency-Key with every call of a sending operation, and none elsewhere", async () => {
    const bs = client();
    await bs.emails.send(send);
    await bs.emails.send(send);
    await bs.emails.send(send, { idempotencyKey: "welcome/42" });
    await bs.emails.send(send, { headers: { "Idempotency-Key": "from-headers" } });
    await bs.domains.create({ name: "example.com" });
    const keys = mock.hitsFor("POST /emails").map((hit) => hit.headers["idempotency-key"]);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(keys[0]).toMatch(uuid);
    expect(keys[1]).toMatch(uuid);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys.slice(2)).toEqual(["welcome/42", "from-headers"]);
    expect(mock.hitsFor("POST /domains")[0]?.headers["idempotency-key"]).toBeUndefined();
  });

  it("uses an injected fetch", async () => {
    const calls: string[] = [];
    const bs = client({
      fetch: (input, init) => {
        calls.push(`${init?.method} ${String(input)}`);
        return fetch(input, init);
      },
    });
    await bs.domains.get(ID);
    expect(calls).toEqual([`GET ${mock.url}/domains/${ID}`]);
  });

  it("refuses invalid options", () => {
    expect(() => new BillionSend({ apiKey: API_KEY, timeoutMs: 0 })).toThrow(TypeError);
    expect(() => new BillionSend({ apiKey: API_KEY, maxRetries: -1 })).toThrow(TypeError);
    expect(() => new BillionSend({ apiKey: API_KEY, maxRetries: 1.5 })).toThrow(TypeError);
  });

  it("encodes path parameters and refuses empty ones", async () => {
    const bs = client();
    await bs.inboxes.get("support+team@example.com");
    expect(mock.hits[0]?.url.pathname).toBe("/inboxes/support%2Bteam%40example.com");
    const empty = await bs.emails.get("");
    expect(empty.error).toMatchObject({
      statusCode: null,
      name: "application_error",
      message: 'Missing path parameter "id"',
    });
    expect(mock.hits).toHaveLength(1);
  });
});

describe("errors", () => {
  it("passes the API's ErrorResponse through, with the request id", async () => {
    mock.reply("GET /emails/{id}", {
      status: 404,
      body: { statusCode: 404, name: "not_found", message: "Email not found" },
      headers: { "x-request-id": "req_1" },
    });
    const result = await client().emails.get(ID);
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(result.error).toBeInstanceOf(BillionSendError);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.toJSON()).toEqual({
      statusCode: 404,
      name: "not_found",
      message: "Email not found",
      requestId: "req_1",
    });
    expect(result.error?.message).toBe("Email not found");
    expect(result.headers?.["x-request-id"]).toBe("req_1");
  });

  it("gives each status its error class", async () => {
    const cases = [
      [400, "invalid_parameter", ValidationError],
      [401, "invalid_api_key", AuthenticationError],
      [403, "restricted_api_key", PermissionDeniedError],
      [404, "not_found", NotFoundError],
      [409, "invalid_idempotent_request", ConflictError],
      [422, "validation_error", ValidationError],
      [429, "rate_limit_exceeded", RateLimitError],
      [500, "internal_server_error", APIError],
    ] as const;
    for (const [status, name, kind] of cases) {
      mock.reply("POST /domains", {
        status,
        body: { statusCode: status, name, message: "m" },
        headers: { "retry-after": "7" },
      });
      const result = await client({ maxRetries: 0 }).domains.create({ name: "example.com" });
      expect(result.error, name).toBeInstanceOf(kind);
      expect(result.error, name).toMatchObject({ statusCode: status, name });
    }
  });

  it("carries retry-after on a RateLimitError", async () => {
    mock.reply("GET /usage", {
      status: 429,
      body: { statusCode: 429, name: "rate_limit_exceeded", message: "Slow down" },
      headers: { "retry-after": "120" },
    });
    const result = await client().usage.get();
    expect(result.error).toBeInstanceOf(RateLimitError);
    expect((result.error as RateLimitError).retryAfter).toBe(120);
  });

  it("maps a non-JSON error body to application_error", async () => {
    mock.reply("GET /emails/{id}", {
      status: 502,
      raw: "<html>Bad gateway</html>",
      headers: { "content-type": "text/html" },
    });
    const result = await client({ maxRetries: 0 }).emails.get(ID);
    expect(result.error).toBeInstanceOf(APIError);
    expect(result.error).toMatchObject({
      statusCode: 502,
      name: "application_error",
      message: expect.stringContaining("Bad gateway"),
    });
  });

  it("maps an unreadable success body to application_error", async () => {
    mock.reply("GET /usage", { status: 200, raw: "not json" });
    const result = await client().usage.get();
    expect(result.error).toMatchObject({
      statusCode: 200,
      name: "application_error",
      message: "The response body is not valid JSON",
    });
  });

  it("maps a network failure to APIConnectionError with no status", async () => {
    const bs = new BillionSend({ apiKey: API_KEY, baseUrl: "http://127.0.0.1:1", maxRetries: 0 });
    const result = await bs.usage.get();
    expect(result.data).toBeNull();
    expect(result.headers).toBeNull();
    expect(result.error).toBeInstanceOf(APIConnectionError);
    expect(result.error).toMatchObject({ statusCode: null, name: "application_error" });
    expect(result.error?.message).toMatch(/^Network error/);
  });

  it("times out", async () => {
    mock.reply("GET /usage", { status: 200, body: okBody("GET /usage"), delayMs: 300 });
    const result = await client({ timeoutMs: 50, maxRetries: 0 }).usage.get();
    expect(result.error).toBeInstanceOf(APITimeoutError);
    expect(result.error).toBeInstanceOf(APIConnectionError);
    expect(result.error).toMatchObject({
      statusCode: null,
      name: "application_error",
      message: "Request timed out after 50 ms",
    });
  });

  it("aborts with the caller's signal", async () => {
    mock.reply("GET /usage", { status: 200, body: okBody("GET /usage"), delayMs: 300 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const result = await client().usage.get({ signal: controller.signal });
    expect(result.error).not.toBeInstanceOf(APIConnectionError);
    expect(result.error).toMatchObject({
      statusCode: null,
      name: "application_error",
      message: "Request was aborted",
    });
  });
});

describe("retries", () => {
  const busy = { status: 503, body: { statusCode: 503, name: "service_unavailable", message: "Busy" } };

  it("retries an idempotent request on 5xx and 429, honouring retry-after", async () => {
    mock.reply("GET /emails/{id}", { ...busy, headers: { "retry-after": "0" } });
    mock.reply("GET /emails/{id}", {
      status: 429,
      body: { statusCode: 429, name: "rate_limit_exceeded", message: "Slow down" },
      headers: { "retry-after": "0" },
    });
    const result = await client().emails.get(ID);
    expect(result.error).toBeNull();
    expect(mock.hitsFor("GET /emails/{id}")).toHaveLength(3);
  });

  it("returns the last error once the retries are spent", async () => {
    for (let i = 0; i < 3; i++)
      mock.reply("DELETE /emails/{id}", { ...busy, headers: { "retry-after": "0" } });
    const result = await client().emails.delete(ID);
    expect(result.error?.statusCode).toBe(503);
    expect(mock.hitsFor("DELETE /emails/{id}")).toHaveLength(3);
  });

  it("never retries a POST that does not honour Idempotency-Key", async () => {
    mock.reply("POST /domains", { ...busy, headers: { "retry-after": "0" } });
    const result = await client().domains.create({ name: "example.com" });
    expect(result.error?.statusCode).toBe(503);
    expect(mock.hitsFor("POST /domains")).toHaveLength(1);
  });

  it("retries a send with the key it made for the call, or the caller's", async () => {
    mock.reply("POST /emails", { ...busy, headers: { "retry-after": "0" } });
    expect((await client().emails.send(send)).error).toBeNull();
    const made = mock.hitsFor("POST /emails").map((hit) => hit.headers["idempotency-key"]);
    expect(made).toHaveLength(2);
    expect(made[1]).toBe(made[0]);

    mock.reset();
    mock.reply("POST /emails", { ...busy, headers: { "retry-after": "0" } });
    const result = await client().emails.send(send, { idempotencyKey: "order-42" });
    expect(result.error).toBeNull();
    const hits = mock.hitsFor("POST /emails");
    expect(hits.map((hit) => hit.headers["idempotency-key"])).toEqual(["order-42", "order-42"]);
  });

  it("retries a send whose first attempt is still running (409 concurrent_idempotent_requests) only", async () => {
    mock.reply("POST /emails/receiving/{id}/reply", {
      status: 409,
      body: { statusCode: 409, name: "concurrent_idempotent_requests", message: "Still processing" },
      headers: { "retry-after": "0" },
    });
    const reply = { from: "a@example.com", text: "Thanks" };
    expect((await client().emails.receiving.reply(ID, reply)).error).toBeNull();
    expect(mock.hitsFor("POST /emails/receiving/{id}/reply")).toHaveLength(2);

    mock.reset();
    mock.reply("POST /emails/receiving/{id}/reply", {
      status: 409,
      body: { statusCode: 409, name: "invalid_idempotent_request", message: "Different payload" },
    });
    const refused = await client().emails.receiving.reply(ID, reply);
    expect(refused.error).toBeInstanceOf(ConflictError);
    expect(mock.hitsFor("POST /emails/receiving/{id}/reply")).toHaveLength(1);
  });

  it("retries a send after a network failure with the same key", async () => {
    const keys: (string | null)[] = [];
    let calls = 0;
    const bs = client({
      fetch: async (input, init) => {
        keys.push(new Headers(init?.headers).get("idempotency-key"));
        if (calls++ === 0) throw new TypeError("fetch failed");
        return fetch(input, init);
      },
    });
    expect((await bs.inboxes.send(ID, { to: "x@example.com", subject: "s", text: "t" })).error).toBeNull();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("does not retry 4xx answers other than 429", async () => {
    mock.reply("GET /emails/{id}", {
      status: 422,
      body: { statusCode: 422, name: "validation_error", message: "Bad" },
    });
    const result = await client().emails.get(ID);
    expect(result.error?.name).toBe("validation_error");
    expect(mock.hitsFor("GET /emails/{id}")).toHaveLength(1);
  });

  it("does not wait for a retry-after longer than a minute", async () => {
    mock.reply("GET /usage", { ...busy, headers: { "retry-after": "3600" } });
    const result = await client().usage.get();
    expect(result.error?.statusCode).toBe(503);
    expect(mock.hitsFor("GET /usage")).toHaveLength(1);
  });

  it("respects maxRetries per client and per request", async () => {
    mock.reply("GET /usage", { ...busy, headers: { "retry-after": "0" } });
    expect((await client({ maxRetries: 0 }).usage.get()).error?.statusCode).toBe(503);
    mock.reply("GET /usage", { ...busy, headers: { "retry-after": "0" } });
    expect((await client({ maxRetries: 0 }).usage.get({ maxRetries: 1 })).error).toBeNull();
    expect(mock.hitsFor("GET /usage")).toHaveLength(3);
  });

  it("retries a timed-out idempotent request", async () => {
    mock.reply("GET /usage", { status: 200, body: okBody("GET /usage"), delayMs: 200 });
    const result = await client({ timeoutMs: 100, maxRetries: 1 }).usage.get();
    expect(result.error).toBeNull();
    expect(mock.hitsFor("GET /usage")).toHaveLength(2);
  });
});
