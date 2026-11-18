# Changelog

## 0.2.0 (2026-11-19)

The OpenAPI snapshot is now the document the API publishes (it had fallen behind), and the SDK follows it. `usage.get()` answers the new report (`emails.daily`, `emails.monthly`, `contacts`, `domains`, …) instead of `limits.emails_per_day`.

- Removed: `webhooks.rotate` (the API no longer has `POST /webhooks/{id}/rotate`; use `webhooks.rotateSigningSecret`, `POST /webhooks/{id}/signing-secret/rotate`) and `unsubscribes.delete` (a recipient's opt-out can no longer be deleted by the customer).
- New operations, named after their `operationId`: `automations` (`list`, `get`, `create`, `update`, `remove`, `validate`, `duplicate`, `simulate`, `stop`, `metrics`, `runs.list`, `runs.get`, `runs.cancel`), `events` (`list`, `get`, `create`, `update`, `remove`, `send`), `contacts.imports` (`list`, `get`, `create`), `contacts.segments.list`, `domains.claims` (`create`, `get`, `verify`), `emails.share` and `emails.unshare`, `emails.attachments` (`list`, `get`), `emails.metrics.links`, `emails.metrics.countries` and `emails.metrics.clients` (`emails.metrics(params)` stays the time series), `broadcasts.recipients` and `broadcasts.clickedLinks`, `logs` (`list`, `get`), `oauthGrants` (`list`, `revoke`), `webhooks.events` (`list`, `get`, `replay`, `attempts.list`), `webhooks.rotateSigningSecret`, `apiKeys.update` and `inboxes.agent.update`. Every cursor list has its `listAll` iterator (`recipientsAll`, `clickedLinksAll` for the two broadcast lists).
- `contacts.imports.create` uploads a CSV as `multipart/form-data`: pass `file` (a string, `Blob` or `File`) with `column_map`, `segments` and `topics` as objects; the SDK JSON-encodes them. The client's request layer takes a `FormData` body for such operations.
- `emails.send` and `emails.batch` follow the new request schema (`from` and `subject` are optional, for a send that names a template); the batch bodies of `emails.batch` and `contacts.batch.create` are typed from the document now.
- The inbox stream's `InboxEventType` is derived from the webhook event enum, so it includes `inbox.thread.assigned` and `inbox.thread.unassigned`.
- The changed request and response schemas (contacts, domains, broadcasts, webhooks, templates, inboxes, usage) are regenerated; their types in `@billionsend/node` follow the document.
- An inbox event stream drops a connection that delivered nothing (not even the server's 15-second keep-alive comment) for `idleTimeoutMs` (default 45 seconds, `0` turns it off) and reconnects from the last event id; a connection that died silently no longer hangs the loop.
- `verifyWebhook` accepts a secret and header values with surrounding whitespace (a secret read from a file keeps its trailing newline).
- An empty list in a query parameter is left out instead of sent as `key=`; a call whose `signal` is already aborted makes no request, whatever the `fetch` does with the signal.
- An inbox event stream resumes from the position the server opens it at: a new stream starts with a block that carries only an `id`, and the stream now keeps it, so a connection the server closes on schedule (about every ten minutes) before its first event reconnects with that `Last-Event-ID` and loses nothing that arrived in between.
- A successful reply with no body (a 204, an empty 200) comes back as `data: null` with no error, instead of a "not valid JSON" error.
- A path parameter of `.` or `..` is refused before any request (a URL folds it into another route: `emails.get("..")` would have called `GET /`).
- An API key is read without the whitespace around it (a key read from a file or the environment ends in a newline, which would otherwise break the `Authorization` header); a blank key counts as none, so the environment's key is used, and without one the call fails with `missing_api_key` before any request.
- `pnpm test:coverage` (at least 95% lines and branches of the hand-written code) and `pnpm test:e2e` (the live suite) are new; the contract mock now checks the answers a test queues against the document too.
- `pnpm openapi:check` compares the snapshot with the published document and fails when they differ; CI runs it on every push and pull request and once a day.

## 0.1.1 (2026-11-17)

- An inbox event stream counts only the reconnects that fail in a row toward `maxReconnects`: each reconnect that opens the stream resets the count. A quiet inbox, whose stream the server closes every ten minutes or so with only keep-alive comments in between, no longer gives up after an hour.
- A reconnect the API refuses with a `Retry-After` (a 429, a 5xx) waits that long instead of the reconnect delay; one longer than 60 seconds throws that error at once. When the reconnects run out, the last one's error is thrown as its own class (`RateLimitError`, `APIError`, …) when the API answered; `APIConnectionError` ("gave up after N reconnects") only when it could not be reached.
- `APIError` carries the server's `Retry-After` too: `retryAfter`, in seconds, `null` without one.
- The `listAll` / `searchAll` iterators and `paginate()` throw a `BillionSendError` named `application_error` on an answer that is not a list page (no `data` array), and, after handing out the page, when the item to continue from has no `id` (missing, empty or not a string), instead of a `TypeError` or fetching the same page forever.

## 0.1.0 (2026-11-17)

- First version of the BillionSend SDK for Node.js and TypeScript: every operation of the BillionSend API, grouped by resource and named after each operation's `operationId`, with request and response types generated from the OpenAPI document.
- Results as `{ data, error, headers }`; methods never throw.
- Errors as classes: `ValidationError`, `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `RateLimitError` (with `retryAfter`), `APIError`, `APIConnectionError` and `APITimeoutError`, all `BillionSendError`s with `statusCode`, `name`, `message` and `requestId` (the answer's `x-request-id`). The iterators throw the same instances.
- The sending operations always carry an `Idempotency-Key`: the caller's, or a new one per call that its retries reuse.
- Retries for 429, 5xx, timeouts, network failures and `409 concurrent_idempotent_requests`, on requests safe to repeat; `retry-after` honoured, exponential backoff otherwise; per-attempt timeouts; injectable `fetch`.
- List query parameters go comma-separated in one key, as the document declares them.
- `listAll` / `searchAll` async iterators over cursor-paginated lists.
- Inbox event streams (server-sent events) as async iterators of typed events, resuming with `Last-Event-ID` after a dropped connection; `stream.gap` handed out once per position; one inbox's stream ends after its `inbox.deleted` or `inbox.expired`.
- `verifyWebhook` checks a webhook delivery's signature and timestamp and returns the parsed event.
- ES module and CommonJS builds with types for both; no runtime dependencies; Node.js 18 or later.
