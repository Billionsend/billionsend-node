# BillionSend Node.js SDK

The official Node.js and TypeScript client for the [BillionSend](https://billionsend.com) email API: send email, manage domains, contacts and broadcasts, run inboxes for people and agents, and stream inbox events.

- Every API operation, typed from the BillionSend OpenAPI document.
- Results as `{ data, error, headers }`: methods never throw.
- ES modules and CommonJS, with types for both. No runtime dependencies. Node.js 18 or later (any runtime with `fetch` works).

Documentation: [billionsend.com/docs](https://billionsend.com/docs) · SDK guide: [billionsend.com/docs/sdks/node](https://billionsend.com/docs/sdks/node)

## Install

```bash
npm install billionsend
# or: pnpm add billionsend / yarn add billionsend
```

## Quick start

```ts
import { BillionSend } from "billionsend";

const bs = new BillionSend("bs_..."); // or set BILLIONSEND_API_KEY and call new BillionSend()

const { data, error } = await bs.emails.send({
  from: "Acme <hello@acme.dev>",
  to: ["ana@example.com"],
  subject: "Welcome to Acme",
  html: "<p>Glad you are here.</p>",
});

if (error) {
  console.error(error.statusCode, error.name, error.message);
} else {
  console.log("queued", data.id);
}
```

CommonJS works the same way:

```js
const { BillionSend } = require("billionsend");
```

## Inboxes and live events

Create an inbox, then read its events as they happen. The stream is an async iterator; when the connection drops it reconnects with `Last-Event-ID`, so no event is lost.

```ts
const inbox = await bs.inboxes.create({ username: "support", kind: "agent" });
if (inbox.error) throw new Error(inbox.error.message);

const opened = await bs.inboxes.events.streamInbox(inbox.data.email_address, {
  types: "inbox.email.received",
});
if (opened.error) throw new Error(opened.error.message);

for await (const event of opened.data) {
  console.log(event.id, event.event, event.data);
  // break (or opened.data.close()) ends the stream
}
```

`bs.inboxes.events.stream()` gives every inbox event of the team. Keep `stream.lastEventId` to resume later with `{ lastEventId }`.

Waiting for a sign-in code sent to the inbox:

```ts
const { data: code } = await bs.inboxes.codes.latest("support@acme.dev", { from: "example.com", wait: 30 });
```

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

## Errors

Every method resolves to one of:

```ts
{ data: T, error: null, headers }
{ data: null, error: { statusCode, name, message }, headers }
```

`error` has the shape of the API's `ErrorResponse`. Failures that never reached the API (network errors, timeouts, aborts, a body that is not JSON) use the same shape with `name: "application_error"`, and `statusCode` is `null` when there was no HTTP response. A client without an API key answers `name: "missing_api_key"` without calling the API. `headers` holds the response headers (lower-case names), or `null` when there was no response.

The iterators (`listAll`, `searchAll`, event streams) cannot return a result per item, so they throw a `BillionSendRequestError`, which carries the same `statusCode`, `name` and `message`.

## Pagination

List methods take the API's cursor parameters (`limit`, `after`, `before`) and return one page. Each paginated list also has an async iterator that fetches pages as you go:

```ts
for await (const contact of bs.contacts.listAll({ limit: 100 })) {
  console.log(contact.email);
}
```

Starting with `before` walks backward. `paginate(fetchPage)` builds the same iterator over any page fetcher.

## Configuration

```ts
const bs = new BillionSend({
  apiKey: "bs_...",                       // default: BILLIONSEND_API_KEY
  baseUrl: "https://api.billionsend.com", // default: BILLIONSEND_BASE_URL, then this
  timeoutMs: 60_000,                      // per attempt; event streams are timed only until they open
  maxRetries: 2,                          // retries of idempotent requests
  fetch: customFetch,                     // default: the global fetch
  headers: { "x-my-header": "value" },    // sent with every request
});
```

Every method takes a last `options` argument with `signal`, `headers`, `timeoutMs` and `maxRetries` for that call.

**Retries.** `GET`, `PUT` and `DELETE` requests, and any request sent with an `idempotencyKey`, are retried on 429, 5xx and network failures, waiting as `retry-after` asks (up to a minute) or backing off exponentially. Other requests are never retried.

**Idempotency.** Sending methods take an `idempotencyKey`, sent as the `Idempotency-Key` header; repeating a request with the same key and payload returns the first result:

```ts
await bs.emails.send(message, { idempotencyKey: `welcome-${user.id}` });
```

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

The contract is `openapi/api.openapi.json`, a snapshot of the published OpenAPI document (prose descriptions removed). The tests run every SDK method against a local mock that validates each request and answers from that snapshot, and fail when an operation has no SDK method. When the API changes:

```bash
pnpm openapi:sync               # or: pnpm openapi:sync --from path/to/api.openapi.json
pnpm generate                   # regenerates src/generated/openapi.ts
pnpm test                       # what fails is what the SDK has to follow
```

## License

[MIT](LICENSE)
