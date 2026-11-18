// Every operation in the OpenAPI snapshot must be reachable through exactly one
// SDK call in this table, and every call must hit the operation it claims.
// A new operation in the snapshot without an entry here fails the build; so
// does an SDK call that reaches an endpoint the snapshot does not have.
import { describe, expect, it } from "vitest";
import type { BillionSend, Result } from "../src/index.js";
import { EventStream } from "../src/index.js";
import { OPERATION_KEYS, operation, pointerOf, schemaErrors, successStatus } from "./contract/spec.js";
import { ID, ID2, sampleBody, useContractMock } from "./helpers.js";

type Call = (bs: BillionSend) => Promise<Result<unknown>>;

const INBOX = "support@example.com";
const send = {
  from: "Acme <hello@example.com>",
  to: ["person@example.com"],
  subject: "Hi",
  html: "<p>Hi</p>",
};

const CALLS: Record<string, Call> = {
  // Emails
  "POST /emails": (bs) => bs.emails.send(send, { idempotencyKey: "welcome-1" }),
  "POST /emails/batch": (bs) => bs.emails.batch([send, { ...send, subject: "Second" }]),
  "GET /emails": (bs) => bs.emails.list({ limit: 10 }),
  "GET /emails/{id}": (bs) => bs.emails.get(ID),
  "PATCH /emails/{id}": (bs) => bs.emails.update(ID, sampleBody("PATCH /emails/{id}")),
  "POST /emails/{id}/cancel": (bs) => bs.emails.cancel(ID),
  "DELETE /emails/{id}": (bs) => bs.emails.delete(ID),
  "GET /emails/{id}/insights": (bs) => bs.emails.insights(ID),
  "GET /emails/metrics": (bs) =>
    bs.emails.metrics({ metrics: ["delivered", "opened"], dimensions: ["period"], granularity: "daily" }),
  "GET /emails/metrics/links": (bs) => bs.emails.metrics.links({ limit: 10 }),
  "GET /emails/metrics/countries": (bs) => bs.emails.metrics.countries({ domain_id: [ID] }),
  "GET /emails/metrics/clients": (bs) => bs.emails.metrics.clients({ broadcast_id: [ID] }),
  "POST /emails/{id}/share": (bs) => bs.emails.share(ID, sampleBody("POST /emails/{id}/share")),
  "DELETE /emails/{id}/share": (bs) => bs.emails.unshare(ID),
  "GET /emails/{email_id}/attachments": (bs) => bs.emails.attachments.list(ID, { limit: 5 }),
  "GET /emails/{email_id}/attachments/{id}": (bs) => bs.emails.attachments.get(ID, ID2),
  "GET /emails/receiving": (bs) => bs.emails.receiving.list({ limit: 5, unread: "true" }),
  "GET /emails/receiving/{id}": (bs) => bs.emails.receiving.get(ID, { html_format: "cid" }),
  "DELETE /emails/receiving/{id}": (bs) => bs.emails.receiving.delete(ID),
  "POST /emails/receiving/{id}/reply": (bs) =>
    bs.emails.receiving.reply(ID, sampleBody("POST /emails/receiving/{id}/reply"), { idempotencyKey: "r-1" }),
  "POST /emails/receiving/{id}/forward": (bs) =>
    bs.emails.receiving.forward(ID, sampleBody("POST /emails/receiving/{id}/forward")),
  "GET /emails/receiving/{email_id}/attachments": (bs) => bs.emails.receiving.attachments.list(ID),
  "GET /emails/receiving/{email_id}/attachments/{id}": (bs) => bs.emails.receiving.attachments.get(ID, ID2),
  "GET /emails/receiving/{email_id}/attachments/{id}/text": (bs) =>
    bs.emails.receiving.attachments.text(ID, ID2),

  // Domains, API keys, webhooks, account
  "POST /domains": (bs) => bs.domains.create(sampleBody("POST /domains")),
  "GET /domains": (bs) => bs.domains.list(),
  "GET /domains/{id}": (bs) => bs.domains.get(ID),
  "PATCH /domains/{id}": (bs) => bs.domains.update(ID, sampleBody("PATCH /domains/{id}")),
  "DELETE /domains/{id}": (bs) => bs.domains.delete(ID),
  "POST /domains/{id}/verify": (bs) => bs.domains.verify(ID),
  "POST /domains/claim": (bs) => bs.domains.claims.create(sampleBody("POST /domains/claim")),
  "GET /domains/{id}/claim": (bs) => bs.domains.claims.get(ID),
  "POST /domains/{id}/claim/verify": (bs) => bs.domains.claims.verify(ID),
  "POST /api-keys": (bs) => bs.apiKeys.create(sampleBody("POST /api-keys")),
  "PATCH /api-keys/{id}": (bs) => bs.apiKeys.update(ID, sampleBody("PATCH /api-keys/{id}")),
  "GET /api-keys": (bs) => bs.apiKeys.list(),
  "DELETE /api-keys/{id}": (bs) => bs.apiKeys.delete(ID),
  "POST /webhooks": (bs) => bs.webhooks.create(sampleBody("POST /webhooks")),
  "GET /webhooks": (bs) => bs.webhooks.list(),
  "GET /webhooks/{id}": (bs) => bs.webhooks.get(ID),
  "PATCH /webhooks/{id}": (bs) => bs.webhooks.update(ID, sampleBody("PATCH /webhooks/{id}")),
  "DELETE /webhooks/{id}": (bs) => bs.webhooks.delete(ID),
  "POST /webhooks/{id}/signing-secret/rotate": (bs) =>
    bs.webhooks.rotateSigningSecret(ID, sampleBody("POST /webhooks/{id}/signing-secret/rotate")),
  "GET /webhooks/{id}/events": (bs) => bs.webhooks.events.list(ID, { limit: 5 }),
  "GET /webhooks/{id}/events/{event_id}": (bs) => bs.webhooks.events.get(ID, ID2),
  "POST /webhooks/{id}/events/{event_id}/replay": (bs) => bs.webhooks.events.replay(ID, ID2),
  "GET /webhooks/{id}/events/{event_id}/attempts": (bs) => bs.webhooks.events.attempts.list(ID, ID2),
  "GET /logs": (bs) => bs.logs.list({ limit: 10 }),
  "GET /logs/{id}": (bs) => bs.logs.get(ID),
  "GET /oauth/grants": (bs) => bs.oauthGrants.list(),
  "DELETE /oauth/grants/{id}": (bs) => bs.oauthGrants.revoke(ID),
  "GET /usage": (bs) => bs.usage.get(),
  "GET /deliverability": (bs) => bs.deliverability.get(),
  "POST /agent/signup": (bs) => bs.agent.signup(sampleBody("POST /agent/signup")),
  "GET /agent/status": (bs) => bs.agent.status(),
  "POST /agent/claim-email": (bs) => bs.agent.claimEmail(),

  // Contacts and lists
  "POST /contacts": (bs) => bs.contacts.create(sampleBody("POST /contacts")),
  "GET /contacts": (bs) => bs.contacts.list({ limit: 2 }),
  "POST /contacts/batch": (bs) =>
    bs.contacts.batch.create(
      sampleBody("POST /contacts/batch"),
      { on_conflict: "skip" },
      { batchValidation: "permissive" },
    ),
  "POST /contacts/batch/get": (bs) => bs.contacts.batch.get(sampleBody("POST /contacts/batch/get")),
  "POST /contacts/batch/remove": (bs) => bs.contacts.batch.remove(sampleBody("POST /contacts/batch/remove")),
  "GET /contacts/imports": (bs) => bs.contacts.imports.list({ status: "completed" }),
  "POST /contacts/imports": (bs) =>
    bs.contacts.imports.create({ file: "email\nana@example.com\n", on_conflict: "skip" }),
  "GET /contacts/imports/{id}": (bs) => bs.contacts.imports.get(ID),
  "GET /contacts/{id}/segments": (bs) => bs.contacts.segments.list(ID, { limit: 5 }),
  "GET /contacts/{id}": (bs) => bs.contacts.get("person@example.com"),
  "PATCH /contacts/{id}": (bs) => bs.contacts.update(ID, sampleBody("PATCH /contacts/{id}")),
  "DELETE /contacts/{id}": (bs) => bs.contacts.delete(ID, { erase: "true" }),
  "POST /contacts/{id}/preferences-link": (bs) => bs.contacts.preferencesLink(ID),
  "GET /contacts/{id}/topics": (bs) => bs.contacts.topics.list(ID),
  "PATCH /contacts/{id}/topics": (bs) =>
    bs.contacts.topics.update(ID, sampleBody("PATCH /contacts/{id}/topics")),
  "POST /contacts/{id}/segments/{segmentId}": (bs) => bs.contacts.segments.add(ID, ID2),
  "DELETE /contacts/{id}/segments/{segmentId}": (bs) => bs.contacts.segments.remove(ID, ID2),
  "POST /audiences/{audienceId}/contacts": (bs) =>
    bs.audiences.contacts.create(ID, sampleBody("POST /audiences/{audienceId}/contacts")),
  "GET /audiences/{audienceId}/contacts/{id}": (bs) => bs.audiences.contacts.get(ID, ID2),
  "PATCH /audiences/{audienceId}/contacts/{id}": (bs) =>
    bs.audiences.contacts.update(ID, ID2, sampleBody("PATCH /audiences/{audienceId}/contacts/{id}")),
  "DELETE /audiences/{audienceId}/contacts/{id}": (bs) => bs.audiences.contacts.delete(ID, ID2),
  "POST /contact-properties": (bs) => bs.contactProperties.create(sampleBody("POST /contact-properties")),
  "GET /contact-properties": (bs) => bs.contactProperties.list(),
  "GET /contact-properties/{id}": (bs) => bs.contactProperties.get(ID),
  "PATCH /contact-properties/{id}": (bs) =>
    bs.contactProperties.update(ID, sampleBody("PATCH /contact-properties/{id}")),
  "DELETE /contact-properties/{id}": (bs) => bs.contactProperties.delete(ID),
  "POST /segments": (bs) => bs.segments.create(sampleBody("POST /segments")),
  "GET /segments": (bs) => bs.segments.list(),
  "GET /segments/{id}": (bs) => bs.segments.get(ID),
  "PATCH /segments/{id}": (bs) => bs.segments.update(ID, sampleBody("PATCH /segments/{id}")),
  "DELETE /segments/{id}": (bs) => bs.segments.delete(ID),
  "GET /segments/{id}/contacts": (bs) => bs.segments.contacts.list(ID, { limit: 50 }),
  "POST /topics": (bs) => bs.topics.create(sampleBody("POST /topics")),
  "GET /topics": (bs) => bs.topics.list(),
  "GET /topics/{id}": (bs) => bs.topics.get(ID),
  "PATCH /topics/{id}": (bs) => bs.topics.update(ID, sampleBody("PATCH /topics/{id}")),
  "DELETE /topics/{id}": (bs) => bs.topics.delete(ID),

  // Broadcasts and templates
  "POST /broadcasts": (bs) => bs.broadcasts.create(sampleBody("POST /broadcasts")),
  "GET /broadcasts": (bs) => bs.broadcasts.list(),
  "GET /broadcasts/{id}": (bs) => bs.broadcasts.get(ID),
  "PATCH /broadcasts/{id}": (bs) => bs.broadcasts.update(ID, sampleBody("PATCH /broadcasts/{id}")),
  "DELETE /broadcasts/{id}": (bs) => bs.broadcasts.delete(ID),
  "GET /broadcasts/{id}/recipients": (bs) => bs.broadcasts.recipients(ID, { type: "bounced" }),
  "GET /broadcasts/{id}/clicked-links": (bs) => bs.broadcasts.clickedLinks(ID, { limit: 5 }),
  "POST /broadcasts/{id}/send": (bs) => bs.broadcasts.send(ID, sampleBody("POST /broadcasts/{id}/send")),
  "POST /broadcasts/{id}/duplicate": (bs) => bs.broadcasts.duplicate(ID),
  "POST /broadcasts/{id}/cancel": (bs) => bs.broadcasts.cancel(ID),
  "POST /templates": (bs) => bs.templates.create(sampleBody("POST /templates")),
  "GET /templates": (bs) => bs.templates.list(),
  "GET /templates/{id}": (bs) => bs.templates.get("welcome-email"),
  "PATCH /templates/{id}": (bs) => bs.templates.update(ID, sampleBody("PATCH /templates/{id}")),
  "DELETE /templates/{id}": (bs) => bs.templates.delete(ID),
  "POST /templates/{id}/publish": (bs) => bs.templates.publish(ID),
  "POST /templates/{id}/duplicate": (bs) => bs.templates.duplicate(ID),

  // Automations and custom events
  "POST /events": (bs) => bs.events.create(sampleBody("POST /events")),
  "GET /events": (bs) => bs.events.list({ limit: 10 }),
  "POST /events/send": (bs) => bs.events.send(sampleBody("POST /events/send"), { idempotencyKey: "ev-1" }),
  "GET /events/{id_or_name}": (bs) => bs.events.get("order.paid"),
  "PATCH /events/{id_or_name}": (bs) => bs.events.update(ID, sampleBody("PATCH /events/{id_or_name}")),
  "DELETE /events/{id_or_name}": (bs) => bs.events.remove(ID),
  "POST /automations": (bs) => bs.automations.create(sampleBody("POST /automations")),
  "GET /automations": (bs) => bs.automations.list({ status: "enabled" }),
  "POST /automations/validate": (bs) => bs.automations.validate(sampleBody("POST /automations/validate")),
  "GET /automations/{id}": (bs) => bs.automations.get(ID),
  "PATCH /automations/{id}": (bs) => bs.automations.update(ID, sampleBody("PATCH /automations/{id}")),
  "DELETE /automations/{id}": (bs) => bs.automations.remove(ID),
  "POST /automations/{id}/duplicate": (bs) => bs.automations.duplicate(ID),
  "POST /automations/{id}/simulate": (bs) =>
    bs.automations.simulate(ID, sampleBody("POST /automations/{id}/simulate")),
  "POST /automations/{id}/stop": (bs) => bs.automations.stop(ID),
  "GET /automations/{id}/metrics": (bs) => bs.automations.metrics(ID, { start_date: "2026-11-01" }),
  "GET /automations/{id}/runs": (bs) => bs.automations.runs.list(ID, { status: "running" }),
  "GET /automations/{id}/runs/{run_id}": (bs) => bs.automations.runs.get(ID, ID2),
  "POST /automations/{id}/runs/{run_id}/cancel": (bs) => bs.automations.runs.cancel(ID, ID2),

  // Suppressions, unsubscribes, verifications
  "POST /suppressions/batch/add": (bs) =>
    bs.suppressions.batch.add(sampleBody("POST /suppressions/batch/add")),
  "POST /suppressions/batch/remove": (bs) =>
    bs.suppressions.batch.remove(sampleBody("POST /suppressions/batch/remove")),
  "POST /suppressions": (bs) => bs.suppressions.create(sampleBody("POST /suppressions")),
  "GET /suppressions": (bs) => bs.suppressions.list({ origin: "bounce" }),
  "GET /suppressions/{id}": (bs) => bs.suppressions.get(ID),
  "DELETE /suppressions/{id}": (bs) => bs.suppressions.delete(ID),
  "GET /unsubscribes": (bs) => bs.unsubscribes.list({ domain_id: ID }),
  "POST /unsubscribes": (bs) => bs.unsubscribes.create(sampleBody("POST /unsubscribes")),
  "GET /verifications/availability": (bs) => bs.verifications.availability(),
  "POST /verifications/estimate": (bs) =>
    bs.verifications.estimate(sampleBody("POST /verifications/estimate")),
  "POST /verifications": (bs) => bs.verifications.create(sampleBody("POST /verifications")),
  "GET /verifications": (bs) => bs.verifications.list(),
  "GET /verifications/{id}": (bs) => bs.verifications.get(ID),

  // Inboxes
  "POST /inboxes": (bs) => bs.inboxes.create(sampleBody("POST /inboxes")),
  "GET /inboxes": (bs) => bs.inboxes.list({ kind: "agent", limit: 10 }),
  "GET /inboxes/{inbox_id}": (bs) => bs.inboxes.get(INBOX),
  "PATCH /inboxes/{inbox_id}": (bs) => bs.inboxes.update(ID, sampleBody("PATCH /inboxes/{inbox_id}")),
  "DELETE /inboxes/{inbox_id}": (bs) => bs.inboxes.delete(ID),
  "POST /inboxes/{inbox_id}/emails": (bs) =>
    bs.inboxes.send(ID, sampleBody("POST /inboxes/{inbox_id}/emails"), { idempotencyKey: "s-1" }),
  "GET /inboxes/{inbox_id}/agent": (bs) => bs.inboxes.agent.get(ID),
  "PATCH /inboxes/{inbox_id}/agent": (bs) =>
    bs.inboxes.agent.update(ID, sampleBody("PATCH /inboxes/{inbox_id}/agent")),
  "GET /inboxes/{inbox_id}/safety": (bs) => bs.inboxes.safety.get(ID),
  "PATCH /inboxes/{inbox_id}/safety": (bs) =>
    bs.inboxes.safety.update(ID, sampleBody("PATCH /inboxes/{inbox_id}/safety")),
  "GET /inboxes/{inbox_id}/labels": (bs) => bs.inboxes.labels.list(ID),
  "POST /inboxes/{inbox_id}/labels": (bs) =>
    bs.inboxes.labels.create(ID, sampleBody("POST /inboxes/{inbox_id}/labels")),
  "PATCH /inboxes/{inbox_id}/labels/{label_id}": (bs) =>
    bs.inboxes.labels.update(ID, ID2, sampleBody("PATCH /inboxes/{inbox_id}/labels/{label_id}")),
  "DELETE /inboxes/{inbox_id}/labels/{label_id}": (bs) => bs.inboxes.labels.delete(ID, ID2),
  "GET /inboxes/{inbox_id}/threads": (bs) => bs.inboxes.threads.list(ID, { folders: "inbox", read: false }),
  "GET /inboxes/{inbox_id}/threads/search": (bs) =>
    bs.inboxes.threads.search(ID, { query: "invoice", has_attachment: true }),
  "GET /inboxes/{inbox_id}/threads/{thread_id}": (bs) => bs.inboxes.threads.get(ID, ID2),
  "PATCH /inboxes/{inbox_id}/threads/{thread_id}": (bs) =>
    bs.inboxes.threads.update(ID, ID2, sampleBody("PATCH /inboxes/{inbox_id}/threads/{thread_id}")),
  "DELETE /inboxes/{inbox_id}/threads/{thread_id}": (bs) => bs.inboxes.threads.delete(ID, ID2),
  "POST /inboxes/{inbox_id}/threads/{thread_id}/labels": (bs) =>
    bs.inboxes.threads.labels.add(ID, ID2, sampleBody("POST /inboxes/{inbox_id}/threads/{thread_id}/labels")),
  "PUT /inboxes/{inbox_id}/threads/{thread_id}/labels": (bs) =>
    bs.inboxes.threads.labels.set(ID, ID2, sampleBody("PUT /inboxes/{inbox_id}/threads/{thread_id}/labels")),
  "DELETE /inboxes/{inbox_id}/threads/{thread_id}/labels/{label_id}": (bs) =>
    bs.inboxes.threads.labels.remove(ID, ID2, ID),
  "GET /inboxes/{inbox_id}/threads/{thread_id}/emails": (bs) => bs.inboxes.threads.emails.list(ID, ID2),
  "GET /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}": (bs) =>
    bs.inboxes.threads.emails.get(ID, ID2, ID, { include_quarantined: true }),
  "POST /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/reply": (bs) =>
    bs.inboxes.threads.emails.reply(
      ID,
      ID2,
      ID,
      sampleBody("POST /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/reply"),
    ),
  "POST /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/forward": (bs) =>
    bs.inboxes.threads.emails.forward(
      ID,
      ID2,
      ID,
      sampleBody("POST /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/forward"),
    ),
  "GET /inboxes/{inbox_id}/quarantine": (bs) => bs.inboxes.quarantine.list(ID),
  "POST /inboxes/{inbox_id}/quarantine/{email_id}/release": (bs) =>
    bs.inboxes.quarantine.release(ID, ID2, { trust_sender: true }),
  "GET /inboxes/{inbox_id}/codes/latest": (bs) =>
    bs.inboxes.codes.latest(ID, { wait: 10, from: "example.com" }),
  "POST /inboxes/{inbox_id}/drafts": (bs) =>
    bs.inboxes.drafts.create(ID, sampleBody("POST /inboxes/{inbox_id}/drafts")),
  "GET /inboxes/{inbox_id}/drafts": (bs) => bs.inboxes.drafts.list(ID, { limit: 20 }),
  "GET /inboxes/{inbox_id}/drafts/{draft_id}": (bs) => bs.inboxes.drafts.get(ID, ID2),
  "PATCH /inboxes/{inbox_id}/drafts/{draft_id}": (bs) =>
    bs.inboxes.drafts.update(ID, ID2, sampleBody("PATCH /inboxes/{inbox_id}/drafts/{draft_id}")),
  "DELETE /inboxes/{inbox_id}/drafts/{draft_id}": (bs) => bs.inboxes.drafts.delete(ID, ID2),
  "POST /inboxes/{inbox_id}/drafts/{draft_id}/send": (bs) =>
    bs.inboxes.drafts.send(ID, ID2, { idempotencyKey: "d-1" }),
  "POST /inboxes/{inbox_id}/drafts/{draft_id}/reject": (bs) => bs.inboxes.drafts.reject(ID, ID2),
  "GET /inboxes/events": (bs) =>
    bs.inboxes.events.stream({ types: "inbox.email.received" }, { reconnect: false }),
  "GET /inboxes/{inbox_id}/events": (bs) =>
    bs.inboxes.events.streamInbox(INBOX, undefined, { reconnect: false }),
};

describe("operation coverage", () => {
  const { mock, client } = useContractMock();
  const reached = new Set<string>();

  it("has exactly one SDK call per operation in the snapshot", () => {
    const table = new Set(Object.keys(CALLS));
    expect(
      [...OPERATION_KEYS].filter((key) => !table.has(key)),
      "operations without an SDK call",
    ).toEqual([]);
    expect(
      [...table].filter((key) => !OPERATION_KEYS.has(key)),
      "SDK calls for unknown operations",
    ).toEqual([]);
    expect(table.size).toBe(OPERATION_KEYS.size);
  });

  it("names each method after its operation's operationId", () => {
    const bs = client() as unknown as Record<string, unknown>;
    const missing = [...OPERATION_KEYS].filter((key) => {
      const id = operation(key).operationId;
      if (!id) return true;
      const target = id.split(".").reduce<unknown>((at, name) => (at as Record<string, unknown>)?.[name], bs);
      return typeof target !== "function";
    });
    expect(missing, "operations whose operationId is not an SDK method").toEqual([]);
  });

  it("gives every cursor-paginated list an iterator beside its method", () => {
    const bs = client() as unknown as Record<string, unknown>;
    const cursorLists = [...OPERATION_KEYS].filter((key) =>
      (operation(key).parameters ?? []).some((p) => p.in === "query" && p.name === "after"),
    );
    expect(cursorLists.length).toBeGreaterThan(0);
    const missing = cursorLists.filter((key) => {
      const path = (operation(key).operationId ?? "").split(".");
      const method = path.pop() ?? "";
      const owner = path.reduce<unknown>((at, name) => (at as Record<string, unknown>)?.[name], bs);
      return typeof (owner as Record<string, unknown> | undefined)?.[`${method}All`] !== "function";
    });
    expect(missing, "cursor lists without a listAll / searchAll").toEqual([]);
  });

  describe.each(Object.entries(CALLS))("%s", (key, call) => {
    it("reaches the operation with a contract-valid request and returns its answer", async () => {
      const result = await call(client());
      expect(mock.violations).toEqual([]);
      expect(mock.hits.map((hit) => hit.key)).toEqual([key]);
      reached.add(key);
      const hit = mock.hits[0];
      if (!hit) throw new Error("no hit");
      const op = operation(key);
      const status = successStatus(op);

      if (result.data instanceof EventStream) {
        const events = [];
        for await (const event of result.data) events.push(event);
        expect(events.map((e) => e.event)).toEqual(["inbox.email.received"]);
        return;
      }
      if (status === undefined) {
        // The document declares only error answers for this operation.
        expect(result.data).toBeNull();
        expect(result.error).toEqual(hit.response);
        return;
      }
      expect(result.error).toBeNull();
      expect(result.data).toEqual(hit.response);
      expect(result.headers?.["x-request-id"]).toBe("req_mock");
      expect(
        schemaErrors(
          pointerOf(op, "responses", status, "content", "application/json", "schema"),
          result.data,
        ),
      ).toBeNull();
    });
  });

  it("reached every operation of the snapshot, and nothing else", () => {
    expect([...OPERATION_KEYS].filter((key) => !reached.has(key))).toEqual([]);
    expect([...reached].filter((key) => !OPERATION_KEYS.has(key))).toEqual([]);
  });
});
