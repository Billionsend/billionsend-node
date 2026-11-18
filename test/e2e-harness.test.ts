// The live suite's own safety rules, proved offline: the harness refuses a request before it leaves,
// so nothing here touches the network (a refused request is never counted, and the one allowed
// request goes to a stubbed fetch).
import { afterEach, describe, expect, it, vi } from "vitest";
import { Live, MAX_MAILS, recipient, SENDER } from "./e2e/harness.js";

const API = "https://api.billionsend.com";

afterEach(() => vi.unstubAllGlobals());

function post(live: Live, path: string, body: unknown) {
  return live.fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function mail(to: unknown, extra: Record<string, unknown> = {}) {
  return { from: SENDER, to, subject: "s", text: "t", ...extra };
}

/** Everything the fetch under test would have sent; the stub answers 200 to whatever reaches it. */
function stubNetwork() {
  const sent: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: { method?: string }) => {
      sent.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return sent;
}

async function refused(live: Live, request: Promise<unknown>, sent: string[], about: RegExp) {
  await expect(request).rejects.toThrow(/Refused by the live suite/);
  expect(live.refused.at(-1)).toMatch(about);
  expect(sent).toEqual([]);
  expect(live.seen).toEqual([]);
}

describe("live suite: who a mail may go to", () => {
  it("lets success@simulator.amazonses.com and its + aliases through, to, cc and bcc alike", async () => {
    const sent = stubNetwork();
    const live = new Live();
    await post(live, "/emails", mail(["success@simulator.amazonses.com"]));
    expect(sent).toEqual([`POST ${API}/emails`]);
    expect(live.mails).toBe(1);
  });

  it("refuses every other address before the request leaves, to, cc and bcc, in a send and in a batch", async () => {
    for (const address of [
      "bounce@simulator.amazonses.com",
      "complaint@simulator.amazonses.com",
      "suppressionlist@simulator.amazonses.com",
      "ooto@simulator.amazonses.com",
      "ana@example.com",
      "success@simulator.amazonses.com.evil.test",
      "evil+success@simulator.amazonses.com",
      "SDK E2E <success@simulator.amazonses.com>",
      "success+@simulator.amazonses.com",
      "success+a b@simulator.amazonses.com",
    ]) {
      for (const field of ["to", "cc", "bcc"]) {
        const sent = stubNetwork();
        const live = new Live();
        await refused(
          live,
          post(live, "/emails", mail(["success@simulator.amazonses.com"], { [field]: [address] })),
          sent,
          /not a simulator success address/,
        );
        const batch = new Live();
        await refused(
          batch,
          post(batch, "/emails/batch", [mail(["success@simulator.amazonses.com"]), mail([address])]),
          sent,
          /not a simulator success address/,
        );
        expect(live.mails).toBe(0);
      }
    }
  });

  it("refuses a recipient written as a bare string or as something that is not text", async () => {
    for (const to of ["ana@example.com", [42], [null], [["success@simulator.amazonses.com"]]]) {
      const sent = stubNetwork();
      const live = new Live();
      await refused(live, post(live, "/emails", mail(to)), sent, /not a simulator success address/);
    }
  });

  it("refuses a body it cannot read, since its recipients cannot be shown safe", async () => {
    for (const body of ["not json", "[1]", "null", '"success@simulator.amazonses.com"']) {
      const sent = stubNetwork();
      const live = new Live();
      await refused(live, post(live, "/emails", body), sent, /cannot be checked/);
    }
    const sent = stubNetwork();
    const live = new Live();
    await refused(
      live,
      live.fetch(`${API}/emails`, { method: "POST", body: new Uint8Array([1]) }),
      sent,
      /not JSON text/,
    );
  });

  it("refuses a sender that is not the E2E sender and counts no more than MAX_MAILS", async () => {
    const sent = stubNetwork();
    const live = new Live();
    await refused(
      live,
      post(live, "/emails", { ...mail(["success@simulator.amazonses.com"]), from: "a@example.com" }),
      sent,
      /not the E2E sender/,
    );
    const many = Array.from({ length: MAX_MAILS + 1 }, () => mail(["success@simulator.amazonses.com"]));
    await refused(live, post(live, "/emails/batch", many), sent, /more than/);
  });
});

describe("live suite: an address in a suppression list is never mailed", () => {
  it("refuses a send, a cc, a bcc and a batch item to an address a suppression was created for", async () => {
    const sent = stubNetwork();
    const live = new Live();
    const address = recipient("sup1");
    live.own(address);
    await post(live, "/suppressions", { email: address, origin: "manual" });
    expect(live.suppressed.has(address)).toBe(true);
    sent.length = 0;
    const seen = live.seen.length;
    for (const request of [
      post(live, "/emails", mail([address])),
      post(live, "/emails", mail(["success@simulator.amazonses.com"], { cc: [address] })),
      post(live, "/emails", mail(["success@simulator.amazonses.com"], { bcc: address })),
      post(live, "/emails/batch", [mail(["success@simulator.amazonses.com"]), mail([address.toUpperCase()])]),
    ]) {
      // The upper-cased form is refused by the address pattern, the others by the suppression.
      await expect(request).rejects.toThrow(/Refused by the live suite/);
    }
    expect(live.refused.filter((why) => why.includes("suppression list"))).toHaveLength(3);
    expect(sent).toEqual([]);
    expect(live.seen).toHaveLength(seen);
  });

  it("covers the batch add too, and keeps the address blocked after the suppression is deleted", async () => {
    const sent = stubNetwork();
    const live = new Live();
    const [one, two] = [recipient("sup2"), recipient("sup3")] as [string, string];
    live.own(one, two);
    await post(live, "/suppressions/batch/add", { emails: [one, two], origin: "manual" });
    sent.length = 0;
    const id = "0b0e5c0e-5f0e-4a38-8f77-0e3c0a2e6a11";
    live.own(id);
    await live.fetch(`${API}/suppressions/${id}`, { method: "DELETE" });
    for (const address of [one, two]) {
      await expect(post(live, "/emails", mail([address]))).rejects.toThrow(/suppression list/);
    }
    expect(sent).toEqual([`DELETE ${API}/suppressions/${id}`]);
    // An address nobody suppressed still goes out.
    await post(live, "/emails", mail([recipient("free")]));
    expect(sent).toHaveLength(2);
  });

  it("refuses to suppress an address that is not a simulator success address, in every way to add one", async () => {
    for (const [path, body] of [
      ["/suppressions", { email: "ana@example.com" }],
      ["/suppressions", { email: "bounce@simulator.amazonses.com" }],
      ["/suppressions/batch/add", { emails: ["success@simulator.amazonses.com", "ana@example.com"] }],
    ] as const) {
      const sent = stubNetwork();
      const live = new Live();
      live.own("ana@example.com", "bounce@simulator.amazonses.com", "success@simulator.amazonses.com");
      await refused(live, post(live, path, body), sent, /not a simulator address/);
    }
  });
});
