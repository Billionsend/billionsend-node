# Changelog

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
