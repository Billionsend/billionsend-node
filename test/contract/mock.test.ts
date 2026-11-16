// The contract mock must refuse what the snapshot does not allow; otherwise a
// green coverage run would prove nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ContractMock } from "./mock-server.js";
import { SAMPLE_UUID } from "./spec.js";

const mock = new ContractMock();
const auth = { authorization: "Bearer bs_test" };
const json = { ...auth, "content-type": "application/json" };

beforeAll(async () => {
  await mock.start();
});
afterAll(async () => {
  await mock.stop();
});
beforeEach(() => mock.reset());

async function call(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
) {
  const res = await fetch(`${mock.url}${path}`, {
    method,
    headers: init.headers ?? auth,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson ? ((await res.json()) as Record<string, unknown>) : { text: await res.text() };
  return { status: res.status, body };
}

describe("contract mock", () => {
  it("answers a valid call with a sample that validates", async () => {
    const res = await call("GET", `/emails/${SAMPLE_UUID}`);
    expect(res.status).toBe(200);
    expect(mock.violations).toEqual([]);
    expect(mock.hits[0]?.key).toBe("GET /emails/{id}");
  });

  it.each([
    ["an unknown path", "GET", "/nope", {}, "path not in the contract"],
    ["an unknown method", "PUT", "/emails", { headers: json, body: {} }, "method not in the contract"],
    ["a malformed uuid path parameter", "GET", "/emails/not-a-uuid", {}, "path parameter id"],
    ["an undeclared query parameter", "GET", "/emails?page=2", {}, "query parameter page is not declared"],
    ["an out-of-range query value", "GET", "/emails?limit=500", {}, "query parameter limit"],
    ["a query value outside its enum", "GET", "/suppressions?origin=spam", {}, "query parameter origin"],
    ["a missing Authorization header", "GET", "/emails", { headers: {} }, "Authorization"],
    [
      "Authorization on the keyless signup",
      "POST",
      "/agent/signup",
      { headers: json, body: { human_email: "a@example.com", name: "A" } },
      "takes none",
    ],
    ["a missing body", "POST", "/emails", { headers: json }, "request body is missing"],
    [
      "a body that breaks the schema",
      "POST",
      "/emails",
      { headers: json, body: { to: "x" } },
      "request body",
    ],
    [
      "a body on an operation without one",
      "POST",
      `/emails/${SAMPLE_UUID}/cancel`,
      { headers: json, body: {} },
      "takes none",
    ],
    [
      "a header outside its enum",
      "POST",
      "/contacts/batch",
      { headers: { ...json, "x-batch-validation": "loose" }, body: [] },
      "header x-batch-validation",
    ],
    ["an event stream without Accept", "GET", "/inboxes/events", {}, "Accept: text/event-stream"],
  ] as const)("refuses %s", async (_label, method, path, init, expected) => {
    const res = await call(method, path, init as { headers?: Record<string, string>; body?: unknown });
    expect(res.status).toBe(400);
    expect(res.body.name).toBe("contract_violation");
    expect(mock.violations.join("\n")).toContain(expected);
  });

  it("prefers literal path segments over parameters", async () => {
    await call("GET", "/emails/receiving");
    await call("GET", "/inboxes/events", { headers: { ...auth, accept: "text/event-stream" } });
    expect(mock.violations).toEqual([]);
    expect(mock.hits.map((hit) => hit.key)).toEqual(["GET /emails/receiving", "GET /inboxes/events"]);
  });
});
