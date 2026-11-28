# Changelog

## 0.4.0 (2026-11-28)

The OpenAPI snapshot follows the document the API now publishes (193 operations, up from 186).

- New `broadcastGroups` resource for one message sent from several of the team's sending domains, one broadcast per domain: `create`, `list` (and `listAll`), `get`, `update`, `remove`, `send` (the body is optional, as on `broadcasts.send`) and `cancel`. A group takes `domain_ids` (2 to 20 verified domains), `from_name` and `from_local_part` (each domain completes the address), `reassign_domain_ids` (domains left out of the send whose contacts move to one of `domain_ids`), `segment_id`, `topic_id`, the dormant-contact switches, and `send: true` with an optional `scheduled_at` to send at once; it answers `status`, `sent_count`, `total_count`, `finishes_at` and its `broadcasts`. A broadcast that belongs to a group answers `group_id`, and changing, sending or deleting it on its own is refused with 422 `grouped_broadcast`.
- `automations.stop(id, { cancel_runs: true })` also cancels the runs already going; without a body the runs finish, as before. The call can answer 400 for malformed JSON and 422 for a bad body now. The method's signature is now `stop(id, payload?, options?)`.
- `topics.list` and `contacts.topics.list` are cursor lists now, newest first: they take `limit`, `after` and `before`, and `topics.listAll` and `contacts.topics.listAll` iterate them. `topics.list(options)` became `topics.list(params, options)`, and `contacts.topics.list(id, options)` became `contacts.topics.list(id, params, options)`.
- `broadcasts.create` and `broadcasts.update` accept `audience_id` as an alias of `segment_id` (both with different values answer 422); `broadcasts.get` and `broadcasts.list` answer it next to `segment_id`.
- `emails.get` answers `topic_id` and `tags`; `emails.list` answers `message_id` and `topic_id` on every item. `emails.delete` answers `409 email_recently_sent` for an email that went out less than 7 days ago.
- `domains.create` and `domains.claims.create` follow the regions the deployment serves now (`us-east-2`, `ap-southeast-1`, `eu-west-3`); `custom_return_path` is a label of at most 48 characters; `tls` is not supported (422). A domain's answer says its region is chosen when the domain is added.
- `broadcasts.update`, `.send` and `.delete` answer 422 for a broadcast of a group; `sent_count` is documented as `null` only before the send starts.
- The README's API coverage section no longer lists `note` and `sending_limits` as missing from the types: the snapshot has carried them since 0.3.1.

## 0.3.1 (2026-11-26)

The OpenAPI snapshot follows the document the API now publishes (186 operations, as before).

- Suppressions carry a `note`, why the entry is blocked: `suppressions.create({ note })` and `suppressions.batch.add({ note })` take one (1 to 500 characters, stored on the rows the request creates; an entry that already exists keeps its own), and every entry answers it (`string | null`, `null` on an entry SES wrote).
- `domains.get(id)` answers `sending_limits`, the broadcast limit the domain's registrable name is under (read-only, only on this call): `mode` (`warming`, `limited`, `unlimited`, `exempt` or `trusted`), `warmup_day`, `warmup_ends_on`, the running window (`window_started_at`, `cap`, `used`), the growth multiplier `g` with the warnings holding it (`g_reasons`), the deliveries it grows from (`t`, `b`), the recipients waiting for the next window (`parked`, `next_window_at`) and `hard_indicators` (`delivery`, `content_review`, `providers_in_backoff`). Only broadcasts are limited; API, SMTP and automation mail never are.
- Doc comments follow the published descriptions: a recipient's opt-out from a domain is permanent and covers transactional mail too unless the domain turned on `send_transactional_to_unsubscribed`; a broadcast body without the unsubscribe placeholder gets a default unsubscribe link when it is sent.

## 0.3.0 (2026-11-20)

The OpenAPI snapshot follows the document the API now publishes (186 operations, up from 180).

- New `brand` resource for the team's default look of the recipient-facing pages: `brand.get()`, `brand.update({ accent_color, font, company_address, powered_by, show_topics })`, `brand.logo.upload({ file })` and `brand.logo.delete()`. `Brand` is typed with `logo_url`, `accent_color`, `font` and `company_address` nullable and the read-only `powered_by_locked` and `branding_locked`. A write needs the manage permission; a domain-scoped key is refused on `/brand` with 403 `restricted_api_key`.
- New `domains.unsubscribePage.logo.upload(id, { file })` and `.delete(id)` for one domain's own unsubscribe-page logo. An upload is `multipart/form-data` with one `file` part: a `Blob` or `File`, or its bytes (`Uint8Array`, `ArrayBuffer`), PNG, JPEG or WebP, at most 2 MiB (`UploadLogoParams`, exported). A `File` keeps its name and type; otherwise the name (`logo.png`, `logo.jpg`, `logo.webp`) and content type are judged from the bytes, and `filename` / `contentType` override them. It answers `{ object: "logo", logo_url }`; a delete answers `{ object: "logo", deleted: true }`. No logo storage is a 404, a wrong format, a too large file or a missing file a 422.
- An upload is not repeated after a 5xx, a timeout or a dropped connection (it is a `PUT`, but not safe to repeat blindly); a 429 is still retried.
- `domains.update({ unsubscribe_page })` takes `support_url` (http(s) only, `null` clears it) and `powered_by` (`true`, `false`, or `null` to follow the team's brand). The page in a domain's answer carries `support_url`, `powered_by` and the read-only `powered_by_effective` (whether recipients really see "Powered by"; always `true` on Free, the saved value is kept). `logo_url` is `null` when no logo is uploaded or the deployment has no logo storage.
- `broadcasts.create` and `broadcasts.update` take `dormant_check` and `include_dormant` (booleans, optional): by default a contact who got 8 or more broadcasts and automation emails with no tracked open or click for 120 days gets a "still want these?" email instead of the broadcast, and `include_dormant: true` also sends to contacts already marked dormant. `broadcasts.get` answers both (always present).

## 0.2.2 (2026-11-19)

The OpenAPI snapshot follows the document the API now publishes (180 operations, as before).

- Suppressions can block a whole domain: `suppressions.create({ domain })` and `suppressions.batch.add({ domains })` (`emails` and `email` are optional now, and a request names either or both); `suppressions.list` and `listAll` take `kind` (`email` by default, `domain` or `all`). Every entry carries `kind` (`email` or `domain`), `domain` and `removable` (`false` for a bounce or a complaint, which cannot be removed), and `email` is `null` on a domain entry, so `string | null` in the types. A consumer mailbox provider such as `gmail.com` is refused as a domain.
- `deliverability.get()` answers a `domains` array (`DomainDeliverability`: `domain_id`, `domain`, `status`, `tier`, `paused_by`, `emails_sent`, the rates and the counts, `recent_hard_bounce_rate`, `recent_complaint_rate`, `pause_margin`, `window_days`), each sending domain's own standing.
- A send from a paused domain answers `403 domain_sending_paused` (a paused team is still `sending_paused`); both come back as a `PermissionDeniedError`.
- `domains.create` defaults `custom_return_path` to `bounce` (server-side); `domains.update` with `custom_return_path` is refused with 422, since the return path cannot change after the domain is added.
- The `deliverability.warning` and `deliverability.paused` webhook payloads carry `scope` (`team` or `domain`) and `domain` (`{ id, name }`, `null` for the team). Deliveries now carry the user agent `BillionSend-Webhooks/1.0 (+https://billionsend.com/docs/concepts/webhooks)` from `51.161.117.92`, which a receiving end behind a WAF should allow.
- The live suite refuses a domain suppression, which would block addresses the run did not make.

## 0.2.1 (2026-11-19)

The OpenAPI snapshot follows the document the API now publishes.

- Every operation a restricted key can be refused on declares a `403` (`restricted_api_key`, an `ErrorResponse`): 103 operations gained it and 74 had their description extended; only `POST /agent/signup` has none. A restricted key is refused as `PermissionDeniedError`, as before.
- `emails.receiving.list({ inbox_id })` takes an inbox ID or its email address (the same as the `/inboxes/{inbox_id}` paths); the parameter is a plain string, no longer a UUID. An unknown inbox, or one of another team, answers 404, a malformed value 422.
- A path ending in `/` now answers `404 not_found` instead of `401 missing_api_key` (server-side; the SDK still refuses an empty path parameter before sending).

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
- A `429` is retried for every request, a POST or PATCH without an `Idempotency-Key` included (the API answers it before it writes anything), waiting as `Retry-After` asks (seconds or an HTTP date; over a minute: the error is returned); `5xx`, timeouts and network errors are still retried only for requests safe to repeat.
- A header value HTTP cannot carry (non-ASCII or a control character, for example `Idempotency-Key: welcome/订单-1` or a key with a newline in it) fails the call at once with a `BillionSendError` named `invalid_header` that names the header and never the value; nothing is sent and nothing is retried (it used to surface as a network error, and a keyed send was retried).
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
- Retries for 429, 5xx, timeouts, network failures and `409 concurrent_idempotent_requests`, on requests safe to repeat (a 429 on any request: see 0.2.0); `retry-after` honoured, exponential backoff otherwise; per-attempt timeouts; injectable `fetch`.
- List query parameters go comma-separated in one key, as the document declares them.
- `listAll` / `searchAll` async iterators over cursor-paginated lists.
- Inbox event streams (server-sent events) as async iterators of typed events, resuming with `Last-Event-ID` after a dropped connection; `stream.gap` handed out once per position; one inbox's stream ends after its `inbox.deleted` or `inbox.expired`.
- `verifyWebhook` checks a webhook delivery's signature and timestamp and returns the parsed event.
- ES module and CommonJS builds with types for both; no runtime dependencies; Node.js 18 or later.
