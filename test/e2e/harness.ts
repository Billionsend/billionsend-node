// Plumbing of the live suite: a fetch that paces and counts every request, refuses
// anything that is not about an object this run made, and checks every real answer
// against the published OpenAPI document.
import { BillionSend, type BillionSendOptions, type Result } from "../../src/index.js";
import { OPERATIONS, type Operation, pointerOf, schemaErrors } from "../contract/spec.js";

export const E2E_KEY = process.env.BILLIONSEND_E2E_API_KEY ?? "";
export const BASE_URL = process.env.BILLIONSEND_E2E_BASE_URL ?? "https://api.billionsend.com";

/** Spacing between two requests: the team limit is 600 a minute, shared with production. */
const MIN_GAP_MS = 1_100;
export const MAX_REQUESTS = 150;
/** The run proper may use this many; the rest is kept for the teardown and the check that it left nothing. */
export const RUN_REQUESTS = 132;
export const MAX_MAILS = 20;

export const SENDER = "SDK E2E <sdk-e2e@mail.billionsend.dev>";
const RECIPIENT = /^success(\+sdk-e2e-[a-z0-9-]+)?@simulator\.amazonses\.com$/;

export const RUN = `sdk-e2e-node-${Math.random().toString(36).slice(2, 8)}`;
/** A recipient the simulator accepts; `tag` keeps each one apart. */
export const recipient = (tag: string) => `success+${RUN}-${tag}@simulator.amazonses.com`;

/**
 * Answers the live API gives that its published document does not list, found by this suite and
 * waived one by one (each needs an API-side change to the document). They are printed on every run.
 */
const KNOWN_DOC_GAPS: Record<string, string> = {
  "GET /contacts 403":
    "a sending_access key is refused with 403 restricted_api_key; the document lists no 403 here",
};

/** The operations that send mail, whose recipients are checked before the request leaves. */
const SENDING = new Set(["POST /emails", "POST /emails/batch"]);

const METHODS_THAT_READ = new Set(["GET", "HEAD"]);

// Operations that make a new object or only read (so no id of ours is in their path).
const FREE_POSTS = new Set([
  "POST /emails",
  "POST /emails/batch",
  "POST /contacts",
  "POST /contacts/batch",
  "POST /contacts/batch/get",
  "POST /contacts/batch/remove",
  "POST /contacts/imports",
  "POST /segments",
  "POST /topics",
  "POST /contact-properties",
  "POST /templates",
  "POST /broadcasts",
  "POST /webhooks",
  "POST /api-keys",
  "POST /events",
  "POST /events/send",
  "POST /automations",
  "POST /automations/validate",
  "POST /suppressions",
  "POST /suppressions/batch/add",
  "POST /suppressions/batch/remove",
  "POST /verifications/estimate",
]);

export interface Seen {
  n: number;
  method: string;
  path: string;
  status: number | "network";
}

interface Compiled {
  op: Operation;
  regex: RegExp;
  names: string[];
  literals: number;
}

const ROUTES: Compiled[] = OPERATIONS.map((op) => {
  const names: string[] = [];
  const segments = op.path.split("/").filter(Boolean);
  const pattern = segments
    .map((segment) => {
      const match = /^\{(.+)\}$/.exec(segment);
      if (match?.[1]) {
        names.push(match[1]);
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return {
    op,
    regex: new RegExp(`^/${pattern}$`),
    names,
    literals: segments.filter((s) => !s.startsWith("{")).length,
  };
});

function match(method: string, pathname: string): { op: Operation; params: string[] } | undefined {
  const found = ROUTES.filter((r) => r.op.method === method && r.regex.test(pathname)).sort(
    (a, b) => b.literals - a.literals,
  )[0];
  if (!found) return undefined;
  const m = found.regex.exec(pathname);
  return { op: found.op, params: found.names.map((_, i) => decodeURIComponent(m?.[i + 1] ?? "")) };
}

export class Live {
  readonly seen: Seen[] = [];
  /** Answers that do not match the published document, and requests this suite refused to make. */
  readonly mismatches: string[] = [];
  readonly refused: string[] = [];
  readonly knownGaps: string[] = [];
  readonly owned = new Set<string>();
  /** Every address this run added to a suppression list (lower case); mail to one of them is refused. */
  readonly suppressed = new Set<string>();
  mails = 0;
  teardown = false;
  #queue: Promise<void> = Promise.resolve();
  #last = 0;
  #rateLimited = 0;
  #stopped = false;

  own(...values: (string | undefined | null)[]): void {
    for (const v of values) if (v) this.owned.add(v);
  }

  get requests(): number {
    return this.seen.length;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.#stopped) throw new Error("The live suite stopped: two 429 answers in a row");
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    this.#guard(method, url, init?.body);
    const cap = this.teardown ? MAX_REQUESTS : RUN_REQUESTS;
    if (this.seen.length >= cap) throw new Error(`Request budget of ${cap} is spent`);
    // One request at a time, a gap after each: the spacing holds even when a caller starts several at once.
    const turn = this.#queue;
    let release = () => {};
    this.#queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await turn;
    const wait = this.#last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    this.#last = Date.now();
    release();
    const entry: Seen = { n: this.seen.length + 1, method, path: url.pathname, status: "network" };
    this.seen.push(entry);
    const response = await fetch(input, init);
    entry.status = response.status;
    if (response.status === 429) {
      this.#rateLimited++;
      if (this.#rateLimited >= 2) this.#stopped = true;
    } else this.#rateLimited = 0;
    await this.#check(method, url, response);
    return response;
  };

  client(options: BillionSendOptions = {}): BillionSend {
    return new BillionSend({
      apiKey: E2E_KEY,
      baseUrl: BASE_URL,
      fetch: this.fetch,
      maxRetries: 1,
      ...options,
    });
  }

  #refuse(why: string): never {
    this.refused.push(why);
    throw new Error(`Refused by the live suite: ${why}`);
  }

  #guard(method: string, url: URL, body: BodyInit | null | undefined): void {
    const found = match(method, url.pathname);
    if (!found) this.#refuse(`${method} ${url.pathname} is not an operation of the document`);
    const { op, params } = found;
    if (METHODS_THAT_READ.has(method)) return;
    if (/^\/(domains|inboxes|agent|unsubscribes|oauth)/.test(op.path) || op.path === "/verifications") {
      this.#refuse(`${op.key} is not allowed on the company account`);
    }
    if (op.path.endsWith("/signing-secret/rotate")) this.#refuse(`${op.key}: never rotates a signing secret`);
    if (FREE_POSTS.has(op.key)) {
      this.#guardBody(op.key, body);
      return;
    }
    for (const p of params) {
      if (!this.owned.has(p)) this.#refuse(`${op.key} on ${p}, which this run did not make`);
    }
  }

  #guardBody(key: string, raw: BodyInit | null | undefined): void {
    // A request that sends mail is read strictly: a body that is not JSON text, or an item that is not
    // an object, cannot be shown safe, so it is refused rather than let through unread.
    if (SENDING.has(key)) {
      this.#guardSend(key, raw);
      return;
    }
    if (typeof raw !== "string") return;
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return;
    }
    const items = Array.isArray(body) ? body : [body];
    if (key === "POST /broadcasts") {
      for (const item of items as Record<string, unknown>[]) {
        if (item.from !== SENDER) this.#refuse(`${key}: from is not the E2E sender`);
      }
    }
    if (key === "POST /events/send" || key === "POST /contacts") {
      const email = (body as { email?: string }).email;
      if (email !== undefined && !this.owned.has(email))
        this.#refuse(`${key} for ${email}, not made by this run`);
    }
    if (key === "POST /contacts/batch/remove" || key.startsWith("POST /suppressions/batch")) {
      const b = body as { ids?: string[]; emails?: string[] };
      for (const v of [...(b.ids ?? []), ...(b.emails ?? [])]) {
        if (!this.owned.has(v)) this.#refuse(`${key} names ${v}, not made by this run`);
      }
    }
    if (
      key === "POST /suppressions" ||
      key === "POST /suppressions/batch/add" ||
      key === "POST /contacts/batch"
    ) {
      // A domain entry blocks every address at that domain, not one this run made: never in a live run.
      if (key.startsWith("POST /suppressions")) {
        const d = body as { domain?: unknown; domains?: unknown };
        if (d.domain !== undefined || d.domains !== undefined) {
          this.#refuse(`${key}: a domain suppression blocks addresses this run did not make`);
        }
      }
      const emails =
        key === "POST /suppressions"
          ? [(body as { email: string }).email]
          : key === "POST /suppressions/batch/add"
            ? ((body as { emails?: string[] }).emails ?? [])
            : (items as { email: string }[]).map((i) => i.email);
      for (const e of emails) {
        if (typeof e !== "string" || !RECIPIENT.test(e)) {
          this.#refuse(`${key}: ${String(e)} is not a simulator address`);
        }
      }
      // From here on no mail may go to these, whatever happens to the suppression itself.
      if (key !== "POST /contacts/batch") for (const e of emails) this.suppressed.add(e.toLowerCase());
    }
  }

  /**
   * The two rules on mail: a recipient (to, cc, bcc) is only `success@simulator.amazonses.com` or a
   * `+` alias of it (never `bounce@`, `complaint@`, `suppressionlist@` or a real address), and never
   * an address this run added to a suppression list.
   */
  #guardSend(key: string, raw: BodyInit | null | undefined): void {
    if (typeof raw !== "string")
      this.#refuse(`${key}: the body is not JSON text, so its recipients cannot be checked`);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      this.#refuse(`${key}: the body is not valid JSON, so its recipients cannot be checked`);
    }
    const items: unknown[] = Array.isArray(body) ? body : [body];
    for (const item of items) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        this.#refuse(`${key}: an item is not an object, so its recipients cannot be checked`);
      }
      const message = item as Record<string, unknown>;
      if (message.from !== SENDER) this.#refuse(`${key}: from is not the E2E sender`);
      for (const field of ["to", "cc", "bcc"] as const) {
        const value = message[field];
        const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
        for (const address of list) {
          if (typeof address !== "string" || !RECIPIENT.test(address)) {
            this.#refuse(`${key}: ${String(address)} is not a simulator success address`);
          }
          if (this.suppressed.has(address.toLowerCase())) {
            this.#refuse(`${key}: ${address} was added to a suppression list by this run`);
          }
        }
      }
    }
    this.mails += items.length;
    if (this.mails > MAX_MAILS) this.#refuse(`more than ${MAX_MAILS} mails`);
  }

  async #check(method: string, url: URL, response: Response): Promise<void> {
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) {
      if (!type.includes("event-stream"))
        this.mismatches.push(`${method} ${url.pathname}: ${response.status} is ${type || "bodyless"}`);
      return;
    }
    const found = match(method, url.pathname);
    if (!found) return;
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    const status = String(response.status);
    const schema = found.op.responses[status]?.content?.["application/json"]?.schema;
    if (!schema) {
      // An undeclared status: it must at least be the API's error shape.
      const error = schemaErrors("/components/schemas/ErrorResponse", body);
      const gap = KNOWN_DOC_GAPS[`${found.op.key} ${status}`];
      if (gap !== undefined && !error) {
        this.knownGaps.push(`${found.op.key} ${status}: ${gap}`);
        return;
      }
      this.mismatches.push(
        `${found.op.key}: status ${status} is not in the document${error ? ` and its body is not an ErrorResponse (${error})` : ""}`,
      );
      return;
    }
    const error = schemaErrors(
      pointerOf(found.op, "responses", status, "content", "application/json", "schema"),
      body,
    );
    if (error) this.mismatches.push(`${found.op.key} ${status}: ${error}`);
  }
}

/** A result's data, or a failure that names the API's own error (never the request). */
export function ok<T>(result: Result<T>, what: string): T {
  if (result.error !== null) {
    throw new Error(`${what}: ${result.error.statusCode} ${result.error.name}: ${result.error.message}`);
  }
  return result.data;
}
