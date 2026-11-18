// Typical calls per resource: how arguments land in the path, the query and the body.
// Every request also passes the contract mock's checks (see helpers.ts).
import { describe, expect, it } from "vitest";
import { ID, ID2, useContractMock } from "./helpers.js";

const { mock, client } = useContractMock();
const bs = () => client();

function last(key: string) {
  const hit = mock.hitsFor(key).at(-1);
  if (!hit) throw new Error(`no call to ${key}`);
  return hit;
}

describe("emails", () => {
  it("sends one email with attachments, tags and an idempotency key", async () => {
    const payload = {
      from: "Acme <billing@example.com>",
      to: ["ana@example.com", "bo@example.com"],
      cc: "finance@example.com",
      subject: "Your invoice",
      html: "<p>Attached.</p>",
      tags: [{ name: "kind", value: "invoice" }],
      attachments: [{ filename: "invoice.pdf", content: "JVBERi0xLjQK" }],
      headers: { "X-Entity-Ref-ID": "inv-7" },
    };
    const { data, error } = await bs().emails.send(payload, { idempotencyKey: "invoice-7" });
    expect(error).toBeNull();
    expect(typeof data?.id).toBe("string");
    const hit = last("POST /emails");
    expect(hit.body).toEqual(payload);
    expect(hit.headers["idempotency-key"]).toBe("invoice-7");
  });

  it("sends a batch with the batch-validation header", async () => {
    const one = { from: "hello@example.com", to: "a@example.com", subject: "A", text: "A" };
    await bs().emails.batch([one, { ...one, to: "b@example.com" }], {
      batchValidation: "permissive",
      idempotencyKey: "b-1",
    });
    const hit = last("POST /emails/batch");
    expect(hit.body).toEqual([one, { ...one, to: "b@example.com" }]);
    expect(hit.headers["x-batch-validation"]).toBe("permissive");
    expect(hit.headers["idempotency-key"]).toBe("b-1");
  });

  it("reschedules, cancels and reads one email", async () => {
    await bs().emails.update(ID, { scheduled_at: "2026-12-01T09:00:00Z" });
    expect(last("PATCH /emails/{id}").body).toEqual({ scheduled_at: "2026-12-01T09:00:00Z" });
    await bs().emails.cancel(ID);
    expect(last("POST /emails/{id}/cancel").url.pathname).toBe(`/emails/${ID}/cancel`);
    await bs().emails.insights(ID);
    expect(last("GET /emails/{id}/insights").url.pathname).toBe(`/emails/${ID}/insights`);
  });

  it("sends array query parameters comma-separated in one key", async () => {
    await bs().emails.metrics({
      metrics: ["delivered", "open_rate"],
      domain_id: [ID, ID2],
      timezone: "Europe/Berlin",
    });
    const query = last("GET /emails/metrics").url.searchParams;
    expect(query.getAll("metrics")).toEqual(["delivered,open_rate"]);
    expect(query.getAll("domain_id")).toEqual([`${ID},${ID2}`]);
    expect(query.get("timezone")).toBe("Europe/Berlin");
  });

  it("lists with cursors and drops undefined parameters", async () => {
    await bs().emails.list({ limit: 25, after: ID, before: undefined });
    expect(Object.fromEntries(last("GET /emails").url.searchParams)).toEqual({ limit: "25", after: ID });
  });
});

describe("emails: metrics breakdowns, attachments and sharing", () => {
  it("reads the three breakdowns beside the time series", async () => {
    await bs().emails.metrics.links({ limit: 5, domain_id: [ID, ID2] });
    expect(Object.fromEntries(last("GET /emails/metrics/links").url.searchParams)).toEqual({
      limit: "5",
      domain_id: `${ID},${ID2}`,
    });
    await bs().emails.metrics.countries({ start_date: "2026-11-01" });
    expect(last("GET /emails/metrics/countries").url.searchParams.get("start_date")).toBe("2026-11-01");
    await bs().emails.metrics.clients({ broadcast_id: [ID] });
    expect(last("GET /emails/metrics/clients").url.searchParams.get("broadcast_id")).toBe(ID);
  });

  it("lists and reads the attachments of a sent email", async () => {
    await bs().emails.attachments.list(ID, { limit: 3 });
    expect(last("GET /emails/{email_id}/attachments").url.pathname).toBe(`/emails/${ID}/attachments`);
    await bs().emails.attachments.get(ID, ID2);
    expect(last("GET /emails/{email_id}/attachments/{id}").url.pathname).toBe(
      `/emails/${ID}/attachments/${ID2}`,
    );
  });

  it("shares and unshares a sent email", async () => {
    await bs().emails.share(ID, {});
    expect(last("POST /emails/{id}/share").url.pathname).toBe(`/emails/${ID}/share`);
    await bs().emails.unshare(ID);
    expect(last("DELETE /emails/{id}/share").url.pathname).toBe(`/emails/${ID}/share`);
  });
});

describe("emails.receiving", () => {
  it("long-polls the received list with filters", async () => {
    await bs().emails.receiving.list({
      wait: 20,
      inbox_id: ID,
      from: "alerts@example.com",
      include_quarantined: "false",
    });
    expect(Object.fromEntries(last("GET /emails/receiving").url.searchParams)).toEqual({
      wait: "20",
      inbox_id: ID,
      from: "alerts@example.com",
      include_quarantined: "false",
    });
  });

  it("replies and forwards server-side", async () => {
    await bs().emails.receiving.reply(ID, { text: "Thanks!", reply_all: true }, { idempotencyKey: "rr-1" });
    expect(last("POST /emails/receiving/{id}/reply").body).toEqual({ text: "Thanks!", reply_all: true });
    expect(last("POST /emails/receiving/{id}/reply").headers["idempotency-key"]).toBe("rr-1");
    await bs().emails.receiving.forward(ID, { to: "team@example.com", mode: "attachment" });
    expect(last("POST /emails/receiving/{id}/forward").body).toEqual({
      to: "team@example.com",
      mode: "attachment",
    });
  });

  it("reads attachments by email and attachment id", async () => {
    await bs().emails.receiving.attachments.get(ID, ID2);
    expect(last("GET /emails/receiving/{email_id}/attachments/{id}").url.pathname).toBe(
      `/emails/receiving/${ID}/attachments/${ID2}`,
    );
  });
});

describe("domains and API keys", () => {
  it("creates, updates and verifies a domain", async () => {
    await bs().domains.create({ name: "mail.example.com", open_tracking: true, tracking_subdomain: "links" });
    expect(last("POST /domains").body).toEqual({
      name: "mail.example.com",
      open_tracking: true,
      tracking_subdomain: "links",
    });
    await bs().domains.update(ID, { click_tracking: false, tracking_subdomain: null });
    expect(last("PATCH /domains/{id}").body).toEqual({ click_tracking: false, tracking_subdomain: null });
    await bs().domains.verify(ID);
    expect(last("POST /domains/{id}/verify").url.pathname).toBe(`/domains/${ID}/verify`);
  });

  it("creates a key held to one domain and revokes it", async () => {
    await bs().apiKeys.create({ name: "ci", permission: "sending_access", domain_id: ID });
    expect(last("POST /api-keys").body).toEqual({ name: "ci", permission: "sending_access", domain_id: ID });
    await bs().apiKeys.delete(ID2);
    expect(last("DELETE /api-keys/{id}").url.pathname).toBe(`/api-keys/${ID2}`);
  });
});

describe("contacts, audiences, properties, segments, topics", () => {
  it("creates, reads by email, updates and erases a contact", async () => {
    await bs().contacts.create({ email: "ana@example.com", first_name: "Ana", properties: { plan: "pro" } });
    expect(last("POST /contacts").body).toEqual({
      email: "ana@example.com",
      first_name: "Ana",
      properties: { plan: "pro" },
    });
    await bs().contacts.get("ana@example.com");
    expect(last("GET /contacts/{id}").url.pathname).toBe("/contacts/ana%40example.com");
    await bs().contacts.update(ID, { last_name: null, unsubscribed: true });
    expect(last("PATCH /contacts/{id}").body).toEqual({ last_name: null, unsubscribed: true });
    await bs().contacts.delete(ID, { erase: "true" });
    expect(last("DELETE /contacts/{id}").url.searchParams.get("erase")).toBe("true");
  });

  it("imports contacts in bulk with on_conflict and the validation header", async () => {
    await bs().contacts.batch.create(
      [{ email: "a@example.com" }, { email: "b@example.com" }],
      { on_conflict: "upsert" },
      {
        batchValidation: "strict",
      },
    );
    const hit = last("POST /contacts/batch");
    expect(hit.url.searchParams.get("on_conflict")).toBe("upsert");
    expect(hit.headers["x-batch-validation"]).toBe("strict");
    expect(hit.body).toEqual([{ email: "a@example.com" }, { email: "b@example.com" }]);
    await bs().contacts.batch.remove({ emails: ["a@example.com"], erase: true });
    expect(last("POST /contacts/batch/remove").body).toEqual({ emails: ["a@example.com"], erase: true });
  });

  it("manages topic subscriptions and segment membership", async () => {
    await bs().contacts.topics.update(ID, [{ id: ID2, subscription: "opt_out" }]);
    expect(last("PATCH /contacts/{id}/topics").body).toEqual([{ id: ID2, subscription: "opt_out" }]);
    await bs().contacts.segments.add(ID, ID2);
    expect(last("POST /contacts/{id}/segments/{segmentId}").url.pathname).toBe(
      `/contacts/${ID}/segments/${ID2}`,
    );
    await bs().contacts.segments.remove(ID, ID2);
    expect(last("DELETE /contacts/{id}/segments/{segmentId}").method).toBe("DELETE");
  });

  it("reaches audience contacts under the audience id", async () => {
    await bs().audiences.contacts.update(ID, "ana@example.com", { first_name: "Ana" });
    expect(last("PATCH /audiences/{audienceId}/contacts/{id}").url.pathname).toBe(
      `/audiences/${ID}/contacts/ana%40example.com`,
    );
  });

  it("creates a contact property, a segment and a topic", async () => {
    await bs().contactProperties.create({ key: "plan", type: "string", fallback_value: "free" });
    expect(last("POST /contact-properties").body).toEqual({
      key: "plan",
      type: "string",
      fallback_value: "free",
    });
    await bs().segments.create({ name: "Pro users", domain_id: null });
    expect(last("POST /segments").body).toEqual({ name: "Pro users", domain_id: null });
    await bs().segments.contacts.list(ID, { limit: 100, include: "properties" });
    expect(last("GET /segments/{id}/contacts").url.search).toBe("?limit=100&include=properties");
    await bs().topics.create({ name: "Product news", default_subscription: "opt_in" });
    expect(last("POST /topics").body).toEqual({ name: "Product news", default_subscription: "opt_in" });
  });
});

describe("broadcasts and templates", () => {
  it("creates, schedules, duplicates and cancels a broadcast", async () => {
    await bs().broadcasts.create({
      from: "news@example.com",
      subject: "November",
      segment_id: ID,
      html: "<p>News</p>",
    });
    expect(last("POST /broadcasts").body).toMatchObject({ segment_id: ID, subject: "November" });
    await bs().broadcasts.send(ID, { scheduled_at: "in 1 hour" });
    expect(last("POST /broadcasts/{id}/send").body).toEqual({ scheduled_at: "in 1 hour" });
    await bs().broadcasts.duplicate(ID);
    await bs().broadcasts.cancel(ID);
    expect(mock.hits.map((hit) => hit.key).slice(-2)).toEqual([
      "POST /broadcasts/{id}/duplicate",
      "POST /broadcasts/{id}/cancel",
    ]);
  });

  it("reaches a template by alias and publishes it", async () => {
    await bs().templates.create({ name: "Welcome", html: "<p>Hi {{{NAME}}}</p>", alias: "welcome" });
    expect(last("POST /templates").body).toMatchObject({ alias: "welcome" });
    await bs().templates.publish("welcome");
    expect(last("POST /templates/{id}/publish").url.pathname).toBe("/templates/welcome/publish");
  });
});

describe("webhooks, suppressions, unsubscribes, verifications, usage, deliverability", () => {
  it("creates and rotates a webhook", async () => {
    await bs().webhooks.create({
      endpoint: "https://example.com/hooks",
      events: ["email.delivered", "email.bounced"],
    });
    expect(last("POST /webhooks").body).toEqual({
      endpoint: "https://example.com/hooks",
      events: ["email.delivered", "email.bounced"],
    });
    await bs().webhooks.rotateSigningSecret(ID, { overlap_hours: 24 });
    expect(last("POST /webhooks/{id}/signing-secret/rotate").body).toEqual({ overlap_hours: 24 });
  });

  it("adds and removes suppressions in bulk", async () => {
    await bs().suppressions.batch.add({ emails: ["x@example.com", "y@example.com"], origin: "manual" });
    expect(last("POST /suppressions/batch/add").body).toEqual({
      emails: ["x@example.com", "y@example.com"],
      origin: "manual",
    });
    await bs().suppressions.list({ origin: "complaint", limit: 50 });
    expect(Object.fromEntries(last("GET /suppressions").url.searchParams)).toEqual({
      origin: "complaint",
      limit: "50",
    });
  });

  it("records an opt-out for one domain", async () => {
    await bs().unsubscribes.create({ email: "ana@example.com", domain_id: ID });
    expect(last("POST /unsubscribes").body).toEqual({ email: "ana@example.com", domain_id: ID });
  });

  it("estimates and starts a verification of a segment", async () => {
    await bs().verifications.estimate({ target: { kind: "segment", segment_id: ID } });
    expect(last("POST /verifications/estimate").body).toEqual({
      target: { kind: "segment", segment_id: ID },
    });
    await bs().verifications.create({ target: { kind: "contacts", contact_ids: [ID, ID2] }, recheck: true });
    expect(last("POST /verifications").body).toEqual({
      target: { kind: "contacts", contact_ids: [ID, ID2] },
      recheck: true,
    });
  });

  it("reads usage and deliverability", async () => {
    expect((await bs().usage.get()).error).toBeNull();
    expect((await bs().deliverability.get()).error).toBeNull();
  });
});

describe("inboxes", () => {
  const inbox = "support@example.com";

  it("creates an agent inbox with safety rules", async () => {
    await bs().inboxes.create({
      username: "support",
      kind: "agent",
      safety: { screening: true, require_approval: true },
    });
    expect(last("POST /inboxes").body).toEqual({
      username: "support",
      kind: "agent",
      safety: { screening: true, require_approval: true },
    });
  });

  it("addresses an inbox by its email address", async () => {
    await bs().inboxes.safety.update(inbox, { allowlist: ["example.org"], send_cap: null });
    expect(last("PATCH /inboxes/{inbox_id}/safety").url.pathname).toBe(
      "/inboxes/support%40example.com/safety",
    );
  });

  it("searches threads with filters", async () => {
    await bs().inboxes.threads.search(inbox, {
      query: "invoice",
      from: "billing@example.com",
      start_date: "2026-11-01",
      limit: 50,
    });
    expect(Object.fromEntries(last("GET /inboxes/{inbox_id}/threads/search").url.searchParams)).toEqual({
      query: "invoice",
      from: "billing@example.com",
      start_date: "2026-11-01",
      limit: "50",
    });
  });

  it("labels a thread three ways", async () => {
    await bs().inboxes.threads.labels.add(inbox, ID, { labels: [ID2] });
    await bs().inboxes.threads.labels.set(inbox, ID, { labels: [] });
    await bs().inboxes.threads.labels.remove(inbox, ID, ID2);
    expect(mock.hits.map((hit) => `${hit.method} ${hit.url.pathname}`)).toEqual([
      `POST /inboxes/support%40example.com/threads/${ID}/labels`,
      `PUT /inboxes/support%40example.com/threads/${ID}/labels`,
      `DELETE /inboxes/support%40example.com/threads/${ID}/labels/${ID2}`,
    ]);
  });

  it("replies in a thread and gets either the sent email or a held draft", async () => {
    await bs().inboxes.threads.emails.reply(
      inbox,
      ID,
      ID2,
      { text: "On it", requires_approval: true },
      { idempotencyKey: "t-1" },
    );
    const hit = last("POST /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/reply");
    expect(hit.body).toEqual({ text: "On it", requires_approval: true });
    expect(hit.headers["idempotency-key"]).toBe("t-1");
  });

  it("starts a conversation from the inbox", async () => {
    await bs().inboxes.send(inbox, { to: "client@example.com", subject: "Hello", text: "Hi" });
    expect(last("POST /inboxes/{inbox_id}/emails").body).toEqual({
      to: "client@example.com",
      subject: "Hello",
      text: "Hi",
    });
  });

  it("waits for the latest verification code", async () => {
    await bs().inboxes.codes.latest(inbox, { from: "example.com", wait: 30, max_age: 600 });
    expect(Object.fromEntries(last("GET /inboxes/{inbox_id}/codes/latest").url.searchParams)).toEqual({
      from: "example.com",
      wait: "30",
      max_age: "600",
    });
  });

  it("releases a held email with or without a body", async () => {
    await bs().inboxes.quarantine.release(inbox, ID);
    expect(last("POST /inboxes/{inbox_id}/quarantine/{email_id}/release").body).toBeUndefined();
    await bs().inboxes.quarantine.release(inbox, ID, { trust_sender: true });
    expect(last("POST /inboxes/{inbox_id}/quarantine/{email_id}/release").body).toEqual({
      trust_sender: true,
    });
  });

  it("walks a draft from creation to sending", async () => {
    await bs().inboxes.drafts.create(inbox, { to: ["client@example.com"], subject: "Draft", text: "..." });
    await bs().inboxes.drafts.update(inbox, ID, { send_at: null });
    await bs().inboxes.drafts.send(inbox, ID, { idempotencyKey: "draft-1" });
    await bs().inboxes.drafts.reject(inbox, ID2);
    expect(last("POST /inboxes/{inbox_id}/drafts/{draft_id}/send").headers["idempotency-key"]).toBe(
      "draft-1",
    );
    expect(last("POST /inboxes/{inbox_id}/drafts/{draft_id}/reject").url.pathname).toBe(
      `/inboxes/support%40example.com/drafts/${ID2}/reject`,
    );
  });
});

describe("agent", () => {
  it("signs up without a key, then reads its status", async () => {
    const signup = await bs().agent.signup({
      human_email: "owner@example.com",
      name: "Ops agent",
      username: "ops",
    });
    expect(signup.error).toBeNull();
    expect(last("POST /agent/signup").headers.authorization).toBeUndefined();
    await bs().agent.status();
    await bs().agent.claimEmail();
    expect(last("POST /agent/claim-email").headers.authorization).toMatch(/^Bearer bs_/);
  });
});

describe("usage", () => {
  it("returns the report as the API's answer, with the daily and monthly emails blocks", async () => {
    const { data, error } = await bs().usage.get();
    expect(error).toBeNull();
    expect(data?.object).toBe("usage");
    expect(data?.emails.daily).toMatchObject({ used: expect.any(Number), resets_at: expect.any(String) });
    expect(data?.emails.monthly).toHaveProperty("limit");
  });
});

describe("contacts.imports", () => {
  it("uploads the CSV as multipart with JSON-encoded settings", async () => {
    await bs().contacts.imports.create({
      file: "Email,First Name\nana@example.com,Ana\n",
      column_map: { email: "Email", first_name: "First Name" },
      on_conflict: "skip",
      segments: [{ id: ID }],
      topics: [{ id: ID2, subscription: "opt_in" }],
    });
    const hit = last("POST /contacts/imports");
    expect(String(hit.headers["content-type"])).toMatch(/^multipart\/form-data; boundary=/);
    expect(hit.body).toEqual({
      file: "file:contacts.csv:37",
      column_map: '{"email":"Email","first_name":"First Name"}',
      on_conflict: "skip",
      segments: JSON.stringify([{ id: ID }]),
      topics: JSON.stringify([{ id: ID2, subscription: "opt_in" }]),
    });
  });

  it("takes a Blob or File and text already encoded", async () => {
    const file = new File(["email\nbo@example.com\n"], "people.csv", { type: "text/csv" });
    await bs().contacts.imports.create({ file, column_map: '{"email":"email"}' });
    expect(last("POST /contacts/imports").body).toEqual({
      file: "file:people.csv:21",
      column_map: '{"email":"email"}',
    });
  });

  it("reads one import and the imports list by status", async () => {
    await bs().contacts.imports.get(ID);
    expect(last("GET /contacts/imports/{id}").url.pathname).toBe(`/contacts/imports/${ID}`);
    await bs().contacts.imports.list({ status: "failed", limit: 5 });
    expect(Object.fromEntries(last("GET /contacts/imports").url.searchParams)).toEqual({
      status: "failed",
      limit: "5",
    });
    await bs().contacts.segments.list(ID, { limit: 2 });
    expect(last("GET /contacts/{id}/segments").url.pathname).toBe(`/contacts/${ID}/segments`);
  });
});

describe("broadcasts: recipients and clicked links", () => {
  it("lists recipients of one outcome and the clicked links", async () => {
    await bs().broadcasts.recipients(ID, { type: "bounced", bounce_type: "permanent", limit: 10 });
    const hit = last("GET /broadcasts/{id}/recipients");
    expect(hit.url.pathname).toBe(`/broadcasts/${ID}/recipients`);
    expect(Object.fromEntries(hit.url.searchParams)).toEqual({
      type: "bounced",
      bounce_type: "permanent",
      limit: "10",
    });
    await bs().broadcasts.clickedLinks(ID);
    expect(last("GET /broadcasts/{id}/clicked-links").url.pathname).toBe(`/broadcasts/${ID}/clicked-links`);
  });
});

describe("webhooks: signing secret and event deliveries", () => {
  it("replays an event and reads its attempts", async () => {
    await bs().webhooks.events.list(ID, { limit: 3 });
    expect(last("GET /webhooks/{id}/events").url.pathname).toBe(`/webhooks/${ID}/events`);
    await bs().webhooks.events.get(ID, ID2);
    expect(last("GET /webhooks/{id}/events/{event_id}").url.pathname).toBe(`/webhooks/${ID}/events/${ID2}`);
    await bs().webhooks.events.replay(ID, ID2);
    expect(last("POST /webhooks/{id}/events/{event_id}/replay").url.pathname).toBe(
      `/webhooks/${ID}/events/${ID2}/replay`,
    );
    await bs().webhooks.events.attempts.list(ID, ID2);
    expect(last("GET /webhooks/{id}/events/{event_id}/attempts").url.pathname).toBe(
      `/webhooks/${ID}/events/${ID2}/attempts`,
    );
  });
});

describe("domains.claims, apiKeys.update, oauthGrants, logs, inboxes.agent.update", () => {
  it("starts, reads and verifies a domain claim", async () => {
    await bs().domains.claims.create({ name: "example.com" });
    expect(last("POST /domains/claim").body).toEqual({ name: "example.com" });
    await bs().domains.claims.get(ID);
    expect(last("GET /domains/{id}/claim").url.pathname).toBe(`/domains/${ID}/claim`);
    await bs().domains.claims.verify(ID);
    expect(last("POST /domains/{id}/claim/verify").url.pathname).toBe(`/domains/${ID}/claim/verify`);
  });

  it("updates an API key, revokes a grant and reads a log entry", async () => {
    await bs().apiKeys.update(ID, { name: "ci" });
    expect(last("PATCH /api-keys/{id}").body).toEqual({ name: "ci" });
    await bs().oauthGrants.revoke(ID);
    expect(last("DELETE /oauth/grants/{id}").url.pathname).toBe(`/oauth/grants/${ID}`);
    await bs().logs.get(ID);
    expect(last("GET /logs/{id}").url.pathname).toBe(`/logs/${ID}`);
  });

  it("updates an inbox's agent settings", async () => {
    await bs().inboxes.agent.update(ID, {});
    expect(last("PATCH /inboxes/{inbox_id}/agent").url.pathname).toBe(`/inboxes/${ID}/agent`);
  });
});

describe("events and automations", () => {
  it("sends an event with an idempotency key and addresses events by id or name", async () => {
    await bs().events.send({ event: "order.paid", email: "ana@example.com" }, { idempotencyKey: "ev-7" });
    const hit = last("POST /events/send");
    expect(hit.body).toEqual({ event: "order.paid", email: "ana@example.com" });
    expect(hit.headers["idempotency-key"]).toBe("ev-7");
    await bs().events.get("order.paid");
    expect(last("GET /events/{id_or_name}").url.pathname).toBe("/events/order.paid");
    await bs().events.remove("order.paid");
    expect(last("DELETE /events/{id_or_name}").url.pathname).toBe("/events/order.paid");
  });

  it("runs the automation lifecycle: stop, simulate, runs and metrics", async () => {
    await bs().automations.stop(ID);
    expect(last("POST /automations/{id}/stop").url.pathname).toBe(`/automations/${ID}/stop`);
    await bs().automations.runs.get(ID, ID2);
    expect(last("GET /automations/{id}/runs/{run_id}").url.pathname).toBe(`/automations/${ID}/runs/${ID2}`);
    await bs().automations.runs.cancel(ID, ID2);
    expect(last("POST /automations/{id}/runs/{run_id}/cancel").url.pathname).toBe(
      `/automations/${ID}/runs/${ID2}/cancel`,
    );
    await bs().automations.metrics(ID, { start_date: "2026-11-01", end_date: "2026-11-15" });
    expect(Object.fromEntries(last("GET /automations/{id}/metrics").url.searchParams)).toEqual({
      start_date: "2026-11-01",
      end_date: "2026-11-15",
    });
  });
});
