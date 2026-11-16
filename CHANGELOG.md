# Changelog

## 0.1.0 (Unreleased)

- First version of the BillionSend SDK for Node.js and TypeScript: every operation of the BillionSend API (135), grouped by resource and named after each operation's `operationId`, with request and response types generated from the OpenAPI document.
- Results as `{ data, error, headers }`; methods never throw.
- List query parameters go comma-separated in one key, as the document declares them.
- Retries for idempotent requests and requests with an `Idempotency-Key` (429, 5xx, network failures; `retry-after` honoured), per-attempt timeouts, injectable `fetch`.
- `listAll` / `searchAll` async iterators over cursor-paginated lists.
- Inbox event streams (server-sent events) as async iterators, resuming with `Last-Event-ID` after a dropped connection.
- ES module and CommonJS builds with types for both; no runtime dependencies; Node.js 18 or later.
