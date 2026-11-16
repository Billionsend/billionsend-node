# BillionSend Node.js SDK

The official Node.js and TypeScript client for the [BillionSend](https://billionsend.com) email API: send email, run inboxes for people and agents, stream inbox events, verify webhooks, and manage domains, contacts and broadcasts.

- Every API operation, typed from the BillionSend OpenAPI document.
- Results as `{ data, error, headers }`: methods never throw. Errors are classes you can tell apart with `instanceof`.
- Safe sends: every send carries an `Idempotency-Key`, so retries after a timeout never send twice.
- Async iterators for every list and for live inbox events, with automatic resume.
- ES modules and CommonJS, with types for both. No runtime dependencies. Node.js 18 or later (any runtime with `fetch` works).

Documentation: [billionsend.com/docs](https://billionsend.com/docs) · SDK guide: [billionsend.com/docs/sdks/node](https://billionsend.com/docs/sdks/node) · Source: [github.com/billionsend/billionsend-node](https://github.com/billionsend/billionsend-node)

## Install

```bash
npm install billionsend
# or: pnpm add billionsend / yarn add billionsend
```

## Authentication

Create an API key on the dashboard (it starts with `bs_`) and pass it to the client, or set `BILLIONSEND_API_KEY`:

```ts
import { BillionSend } from "billionsend";

const bs = new BillionSend("bs_..."); // or: new BillionSend() with BILLIONSEND_API_KEY set
```

CommonJS works the same way: `const { BillionSend } = require("billionsend");`. A key restricted to one inbox is what an agent should hold; see [API keys](https://billionsend.com/docs/api-keys).

## Send an email

```ts
const { data, error } = await bs.emails.send({
  from: "Acme <hello@acme.dev>",
  to: ["ana@example.com"],
  subject: "Welcome to Acme",
  html: "<p>Glad you are here.</p>",
});

if (error) {
  console.error(error.statusCode, error.name, error.message, error.requestId);
} else {
  console.log("queued", data.id);
}
```

**Idempotency.** The sending operations (`emails.send`, `emails.batch`, `emails.receiving.reply` / `forward`, `inboxes.send`, `inboxes.drafts.send`, `inboxes.threads.emails.reply` / `forward`) always send an `Idempotency-Key` header. Without your own, each call gets a new random key and that call's retries reuse it, so a retry after a timeout cannot send twice. Pass your own key to make a send safe across calls and processes too; a repeat with the same key and payload returns the first result:

```ts
await bs.emails.send(message, { idempotencyKey: `welcome/${user.id}` });
```

**Retries.** Failures worth retrying are retried up to `maxRetries` times (default 2): `429`, `5xx`, timeouts and network errors, and the `409 concurrent_idempotent_requests` the API answers while the first attempt with the same key is still running. Only requests safe to repeat are retried: `GET`, `PUT`, `DELETE` and the sending operations above. The client waits as `retry-after` asks, or backs off exponentially (0.5 s, 1 s, 2 s … up to 8 s, with jitter); a `retry-after` over a minute is not waited for, and the error comes back instead.

```ts
const bs = new BillionSend({ apiKey: "bs_...", maxRetries: 4 });
await bs.emails.send(message, { maxRetries: 0 }); // per call
```

## Errors

Every method resolves to one of:

```ts
{ data: T, error: null, headers }
{ data: null, error: BillionSendError, headers }
```

`error` is an instance of a class for its kind, all subclasses of `BillionSendError` (itself an `Error`):

| Class | When |
| --- | --- |
| `ValidationError` | `400`, `422`: the request is invalid |
| `AuthenticationError` | `401`, or no API key configured (`name: "missing_api_key"`, no request made) |
| `PermissionDeniedError` | `403`: the key, its scope, your role or your plan does not allow it |
| `NotFoundError` | `404` |
| `ConflictError` | `409`, such as an idempotency key reused with a different payload |
| `RateLimitError` | `429`; `retryAfter` holds the server's hint in seconds |
| `APIError` | `5xx` |
| `APIConnectionError` | no answer: DNS, connection or TLS failure (`statusCode` is `null`) |
| `APITimeoutError` | the request timed out (a subclass of `APIConnectionError`) |

Each carries `statusCode`, `name` (the API's error name, such as `validation_error`; `application_error` when the API sent none), `message` and `requestId`, the answer's `x-request-id`: the same id the request has on the dashboard's Logs page, so quote it when you ask about a request.

```ts
import { NotFoundError, RateLimitError } from "billionsend";

const { data, error } = await bs.emails.get(id);
if (error instanceof NotFoundError) return null;
if (error instanceof RateLimitError) console.log("retry in", error.retryAfter, "s");
else if (error) throw error;
```

The iterators (`listAll`, `searchAll`, event streams) cannot return a result per item, so they throw the same error instances.

## Pagination

List methods take the API's cursor parameters (`limit`, `after`, `before`) and return one page. Every cursor list also has an async iterator that fetches pages as you go:

```ts
for await (const contact of bs.contacts.listAll({ limit: 100 })) {
  console.log(contact.email);
}
```

Thread search has `searchAll`. Starting with `before` walks backward. `paginate(fetchPage)` builds the same iterator over any page fetcher.

## An agent's inbox: wait, read, reply

An agent holds a key restricted to its inbox, waits for new mail on the live event stream, reads it, and replies in the thread:

```ts
const inboxId = "support@acme.dev"; // an inbox id or its address

const opened = await bs.inboxes.events.streamInbox(inboxId, { types: "inbox.email.received" });
if (opened.error) throw opened.error;

for await (const item of opened.data) {
  if (item.event === "stream.gap") {
    // Resumed from too far back: events may be missing. Re-read the threads.
    continue;
  }
  const { thread_id, email_id } = item.data.data;
  if (!thread_id || !email_id) continue;

  const email = await bs.inboxes.threads.emails.get(inboxId, thread_id, email_id);
  if (email.error) throw email.error;

  const answer = await draftAnswer(email.data.subject, email.data.text); // your model
  const sent = await bs.inboxes.threads.emails.reply(
    inboxId,
    thread_id,
    email_id,
    { text: answer },
    { idempotencyKey: `reply/${email_id}` }, // a replayed event cannot reply twice
  );
  if (sent.error) throw sent.error;
}
```

Waiting for a sign-in code sent to the inbox:

```ts
const { data: code } = await bs.inboxes.codes.latest("support@acme.dev", { from: "example.com", wait: 30 });
```

## Live events

`bs.inboxes.events.stream()` streams every inbox event of the team (it needs a team-wide key); `bs.inboxes.events.streamInbox(inbox)` streams one inbox. Both resolve once the stream is open (or with the error that refused it) and give an async iterator of typed events:

- `InboxStreamEvent`: `{ id, event, data }`, where `event` is the webhook event name (`inbox.email.received`, `inbox.thread.created`, `inbox.draft.sent`, `email.received`, …) and `data` is `{ type, created_at, inbox_id, data }`, the webhook payload's metadata with the ids to read next (`thread_id`, `email_id`, `draft_id`).
- `StreamGapEvent`: `{ id: null, event: "stream.gap", data: { reason } }` when the stream resumed from further back than the server keeps (24 hours): events may be missing, so read the lists again. One stream hands it out once per position.

When the connection drops (the server also closes every stream about every ten minutes), the stream reconnects with `Last-Event-ID` and replays what it missed before the live events. It gives up after `maxReconnects` failures in a row (default 5) with an `APIConnectionError`; a refusal a retry cannot fix (a revoked key) is thrown as its own class. One inbox's stream ends after that inbox's `inbox.deleted` or `inbox.expired`.

```ts
const opened = await bs.inboxes.events.stream({ types: "inbox.email.received,inbox.thread.created" }, {
  lastEventId: saved, // resume where a previous run stopped
});
if (opened.error) throw opened.error;
for await (const item of opened.data) {
  saved = opened.data.lastEventId;
  // break, or opened.data.close(), ends the stream
}
```

## Verify webhooks

Every webhook delivery is signed with the endpoint's `whsec_` secret (shown when you create the endpoint, and by `webhooks.rotate`). `verifyWebhook` checks the signature and the timestamp (within 5 minutes by default, so a captured delivery cannot be replayed) and returns the parsed event; anything wrong throws a `WebhookVerificationError`. Pass the body exactly as it arrived, before any JSON parsing:

```ts
import express from "express";
import { verifyWebhook, WebhookVerificationError } from "billionsend";

const app = express();

app.post("/webhooks/billionsend", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = await verifyWebhook(req.body, req.headers, process.env.BILLIONSEND_WEBHOOK_SECRET!);
    if (event.type === "email.bounced") {
      // ...
    }
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof WebhookVerificationError) return res.sendStatus(400);
    throw error;
  }
});
```

With the Fetch API (Next.js route handlers, Hono, Bun, Deno, workers) it is `await verifyWebhook(await request.text(), request.headers, secret)`. During a secret rotation a delivery carries a signature for each live secret, and either secret verifies it.

## Agent sign-up

An agent can create its own account with no API key; the answer carries the new key and inbox.

```ts
const signup = await new BillionSend().agent.signup({
  human_email: "owner@acme.dev",
  name: "Support agent",
});

if (signup.data) {
  const agent = new BillionSend(signup.data.api_key);
  console.log(signup.data.inbox.email_address);
}
```

## Configuration

```ts
const bs = new BillionSend({
  apiKey: "bs_...",                       // default: BILLIONSEND_API_KEY
  baseUrl: "https://api.billionsend.com", // default: BILLIONSEND_BASE_URL, then this
  timeoutMs: 60_000,                      // per attempt; event streams are timed only until they open
  maxRetries: 2,                          // see Retries
  fetch: customFetch,                     // default: the global fetch
  headers: { "x-my-header": "value" },    // sent with every request
});
```

Every method takes a last `options` argument with `signal`, `headers`, `timeoutMs` and `maxRetries` for that call (and `idempotencyKey` on the sending operations).

**Batches.** `emails.batch` and `contacts.batch.create` take `batchValidation: "strict" | "permissive"` (the `x-batch-validation` header).

## Resources

| Property | Covers |
| --- | --- |
| `emails` | send, batch, list, get, update, cancel, delete, insights, metrics |
| `emails.receiving` | received mail: list, get, delete, reply, forward, `attachments` |
| `domains` | create, list, get, update, delete, verify |
| `apiKeys` | create, list, delete |
| `contacts` | create, list, get, update, delete, preferences link, `batch`, `topics`, `segments` |
| `audiences.contacts` | contacts addressed through an audience |
| `contactProperties`, `segments`, `topics` | create, list, get, update, delete (segment contacts under `segments.contacts`) |
| `broadcasts` | create, list, get, update, delete, send, duplicate, cancel |
| `templates` | create, list, get, update, delete, publish, duplicate |
| `webhooks` | create, list, get, update, delete, rotate |
| `suppressions` | create, list, get, delete, `batch` add / remove |
| `unsubscribes` | create, list, delete |
| `verifications` | availability, estimate, create, list, get |
| `usage`, `deliverability` | get |
| `inboxes` | create, list, get, update, delete, send, `agent`, `safety`, `labels`, `threads` (search, labels, emails, reply, forward), `quarantine`, `codes`, `drafts`, `events` |
| `agent` | signup, status, claimEmail |

Method names are camelCase; request and response fields keep the API's snake_case names. All request and response types are exported, named after the API's schemas (`SendEmailRequest`, `Inbox`, …).

## Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm test:smoke
```

The contract is `openapi/api.openapi.json`, a snapshot of the published OpenAPI document; its descriptions become the doc comments of the generated types. The tests run every SDK method against a local mock that validates each request and answers from that snapshot, and fail when an operation has no SDK method. When the API changes:

```bash
pnpm openapi:sync               # or: pnpm openapi:sync --from path/to/api.openapi.json
pnpm generate                   # regenerates src/generated/openapi.ts
pnpm test                       # what fails is what the SDK has to follow
```

## License

[MIT](LICENSE)
