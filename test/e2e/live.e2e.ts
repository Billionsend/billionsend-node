// The live suite: the real SDK against the real API, as a developer would use it.
//
//   BILLIONSEND_E2E_API_KEY=bs_... pnpm test:e2e
//
// It runs only with that variable set and never in CI. It shares the company
// account, so it follows the rules in harness.ts: at most 150 requests, one a
// second, mail only to the simulator's success address, every object it makes
// named `sdk-e2e-node-<random>` and deleted again, nothing else is touched.
// Every answer is checked against the published OpenAPI document; the final
// test fails when any one is off.
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import {
  AuthenticationError,
  BillionSend,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  type Result,
  ValidationError,
  verifyWebhook,
} from "../../src/index.js";
import { E2E_KEY, Live, MAX_REQUESTS, ok, RUN, recipient, SENDER } from "./harness.js";

type Page = { object: string; data: unknown[]; has_more: boolean };
const live = new Live();
const bs = live.client();

const message = {
  from: SENDER,
  to: ["success@simulator.amazonses.com"],
  subject: `${RUN} welcome`,
  html: "<p>Glad you are here.</p>",
};

/** Objects this run made and has not deleted yet; the teardown removes what is left. */
const cleanups = new Map<string, () => Promise<unknown>>();
const track = (name: string, remove: () => Promise<unknown>) => cleanups.set(name, remove);
const done = (name: string) => cleanups.delete(name);

const ids: Record<string, string> = {};
/** The first item of each list the reads group fetched. */
const listed: Record<string, unknown> = {};
/** `E2E_GROUPS=reads,errors` runs only those groups while the suite is being developed; unset runs all. */
const wanted = (name: string) => {
  const groups = process.env.E2E_GROUPS;
  return groups === undefined || groups.split(",").includes(name);
};
const group = (name: string, body: () => void) => describe.skipIf(!wanted(name))(name, body);
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(E2E_KEY === "")("live API", () => {
  afterAll(async () => {
    live.teardown = true;
    for (const [name, remove] of [...cleanups].reverse()) {
      try {
        await remove();
      } catch (error) {
        console.error(`teardown of ${name} failed:`, error instanceof Error ? error.message : error);
      }
    }
    console.log(`live suite: ${live.requests} requests, ${live.mails} mails counted`);
    for (const line of new Set(live.knownGaps)) console.log(`KNOWN DOCUMENT GAP ${line}`);
    for (const line of live.mismatches) console.log(`MISMATCH ${line}`);
    for (const line of live.refused) console.log(`REFUSED ${line}`);
  });

  // -- Read-only: the whole account surface, answers checked against the document ----------------------
  group("reads", () => {
    it("reads the account reports", async () => {
      // README: a client with every option set.
      const configured = new BillionSend({
        apiKey: E2E_KEY,
        baseUrl: "https://api.billionsend.com",
        timeoutMs: 60_000,
        maxRetries: 2,
        fetch: live.fetch,
        headers: { "x-my-header": "value" },
      });
      const usage = ok(await configured.usage.get(), "usage");
      expect(usage.object).toBe("usage");
      expect(typeof usage.emails.daily.used).toBe("number");
      ok(await bs.deliverability.get(), "deliverability");
      ok(await bs.verifications.availability(), "verifications.availability");
    });

    it("lists every kind of object with the cursor parameters", async () => {
      const lists: (() => Promise<unknown>)[] = [
        () => bs.domains.list({ limit: 1 }),
        () => bs.emails.list({ limit: 2 }),
        () => bs.contacts.list({ limit: 2 }),
        () => bs.segments.list({ limit: 2 }),
        () => bs.topics.list(),
        () => bs.templates.list({ limit: 2 }),
        () => bs.webhooks.list({ limit: 2 }),
        () => bs.broadcasts.list({ limit: 2 }),
        () => bs.automations.list({ limit: 2 }),
        () => bs.events.list({ limit: 2 }),
        () => bs.contactProperties.list({ limit: 2 }),
        () => bs.apiKeys.list({ limit: 2 }),
        () => bs.logs.list({ limit: 1 }),
        () => bs.oauthGrants.list({ limit: 2 }),
        () => bs.suppressions.list({ limit: 2 }),
        () => bs.unsubscribes.list({ limit: 2 }),
        () => bs.verifications.list({ limit: 1 }),
        () => bs.contacts.imports.list({ limit: 1 }),
        () => bs.emails.receiving.list({ limit: 1 }),
        () => bs.inboxes.list({ limit: 1 }),
      ];
      // One at a time: the harness paces the requests, and a failure names its list.
      const names = [
        "domains",
        "emails",
        "contacts",
        "segments",
        "topics",
        "templates",
        "webhooks",
        "broadcasts",
        "automations",
        "events",
        "contactProperties",
        "apiKeys",
        "logs",
        "oauthGrants",
        "suppressions",
        "unsubscribes",
        "verifications",
        "contacts.imports",
        "emails.receiving",
        "inboxes",
      ];
      for (const [index, start] of lists.entries()) {
        const page = ok((await start()) as Result<Page>, `${names[index]}.list`);
        listed[names[index] ?? ""] = page.data[0];
        expect(page.object, names[index]).toBe("list");
        expect(Array.isArray(page.data), names[index]).toBe(true);
        expect(typeof page.has_more, names[index]).toBe("boolean");
      }
    });

    it("reads one domain and one log entry by id", async () => {
      const domain = listed.domains as { id: string } | undefined;
      expect(domain).toBeDefined();
      if (domain) expect(ok(await bs.domains.get(domain.id), "domains.get").id).toBe(domain.id);
      const entry = listed.logs as { id: string } | undefined;
      if (entry) expect(ok(await bs.logs.get(entry.id), "logs.get").id).toBe(entry.id);
    });

    it("reads the metrics series and its three breakdowns", async () => {
      const series = ok(
        await bs.emails.metrics({
          metrics: ["sent", "delivered"],
          granularity: "daily",
          dimensions: ["period"],
        }),
        "emails.metrics",
      );
      expect(series).toBeTruthy();
      ok(await bs.emails.metrics.links({ limit: 3 }), "metrics.links");
      ok(await bs.emails.metrics.countries({}), "metrics.countries");
      ok(await bs.emails.metrics.clients({}), "metrics.clients");
    });
  });

  // -- Errors: the real API's refusals, as the SDK classes them -----------------------------------------
  group("errors", () => {
    it("answers a wrong key with AuthenticationError and the API's own name", async () => {
      const wrong = live.client({ apiKey: "bs_sdk_e2e_not_a_real_key", maxRetries: 0 });
      const result = await wrong.usage.get();
      expect(result.error).toBeInstanceOf(AuthenticationError);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.requestId).toBeTruthy();
    });

    it("answers an unknown id with NotFoundError and a request id", async () => {
      const result = await bs.emails.get("6f1c2a1e-1b7a-4c51-9e43-2f2d7a9c0b11");
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error?.requestId).toBeTruthy();
      expect(result.headers?.["x-request-id"]).toBe(result.error?.requestId);
    });

    it("answers an invalid body with ValidationError", async () => {
      // No recipient: the API refuses it before anything is sent.
      const result = await bs.emails.send({ from: SENDER, subject: `${RUN} invalid` } as never);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect([400, 422]).toContain(result.error?.statusCode);
    });

    it("takes path ids with slashes, spaces, percent signs and non-ASCII as one segment", async () => {
      for (const id of ["a/b", "sdk e2e ü 100%41"]) {
        const result = await bs.templates.get(id);
        expect(result.error, id).toBeInstanceOf(NotFoundError);
      }
    });
  });

  // -- Pagination: real cursors ---------------------------------------------------------------------
  group("pagination", () => {
    it("walks every domain page by page", async () => {
      const seen = new Set<string>();
      let count = 0;
      for await (const domain of bs.domains.listAll({ limit: 5 })) {
        seen.add(domain.id);
        count++;
      }
      expect(count).toBeGreaterThan(5);
      expect(seen.size, "a domain came twice").toBe(count);
    });

    it("README: iterates contacts and stops early", async () => {
      const names: string[] = [];
      for await (const contact of bs.contacts.listAll({ limit: 100 })) {
        names.push(contact.email);
        if (names.length === 3) break;
      }
      expect(names).toHaveLength(3);
    });

    it("walks backward with before", async () => {
      const page = ok(await bs.contacts.list({ limit: 3 }), "contacts.list");
      const edge = page.data.at(-1);
      if (!edge) return;
      const back: string[] = [];
      for await (const contact of bs.contacts.listAll({ before: edge.id, limit: 2 })) {
        back.push(contact.id);
        if (back.length === 2) break;
      }
      expect(back).not.toContain(edge.id);
    });
  });

  // -- Sending ------------------------------------------------------------------------------------
  group("sending", () => {
    it("README: sends an email and reads it back", async () => {
      const sent = ok(await bs.emails.send(message), "emails.send");
      ids.mail = sent.id;
      const got = ok(await bs.emails.get(sent.id), "emails.get");
      expect(got.id).toBe(sent.id);
      expect(got.subject).toBe(message.subject);
      expect(got.from).toContain("sdk-e2e@mail.billionsend.dev");
      const metrics = ok(await bs.emails.insights(sent.id), "emails.insights");
      expect(metrics.email_id).toBe(sent.id);
    });

    it("README: an Idempotency-Key makes a repeat answer the first send", async () => {
      const key = `${RUN}/welcome-1`;
      const first = ok(
        await bs.emails.send({ ...message, subject: `${RUN} idem` }, { idempotencyKey: key }),
        "first",
      );
      const again = ok(
        await bs.emails.send({ ...message, subject: `${RUN} idem` }, { idempotencyKey: key }),
        "repeat",
      );
      expect(again.id).toBe(first.id);
      const other = await bs.emails.send(
        { ...message, subject: `${RUN} idem, other` },
        { idempotencyKey: key },
      );
      expect(other.error).toBeInstanceOf(ConflictError);
      expect(other.error?.name).toBe("invalid_idempotent_request");
    });

    it("README: maxRetries 0 per call sends once", async () => {
      const result = await bs.emails.send({ ...message, subject: `${RUN} no retries` }, { maxRetries: 0 });
      expect(result.error).toBeNull();
    });

    it("sends a batch with a plus-address each and the batch-validation header", async () => {
      const batch = ok(
        await bs.emails.batch(
          [
            { ...message, to: [recipient("b1")], subject: `${RUN} batch 1` },
            { ...message, to: [recipient("b2")], subject: `${RUN} batch 2` },
          ],
          { batchValidation: "permissive" },
        ),
        "emails.batch",
      );
      expect(batch.data).toHaveLength(2);
    });

    it("reschedules and cancels a scheduled email", async () => {
      const scheduled = ok(
        await bs.emails.send({
          ...message,
          to: [recipient("sch")],
          subject: `${RUN} scheduled`,
          scheduled_at: iso(2),
        }),
        "scheduled send",
      );
      live.own(scheduled.id);
      track("scheduled email", () => bs.emails.cancel(scheduled.id));
      ok(await bs.emails.update(scheduled.id, { scheduled_at: iso(3) }), "emails.update");
      ok(await bs.emails.cancel(scheduled.id), "emails.cancel");
      done("scheduled email");
      const got = ok(await bs.emails.get(scheduled.id), "emails.get");
      expect(got.last_event).toBe("canceled");
    });

    it("sends an attachment and lists it", async () => {
      const text = `Report of ${RUN}`;
      const sent = ok(
        await bs.emails.send({
          ...message,
          to: [recipient("att")],
          subject: `${RUN} attachment`,
          attachments: [{ filename: "report.txt", content: Buffer.from(text).toString("base64") }],
        }),
        "send with attachment",
      );
      const attachments = ok(await bs.emails.attachments.list(sent.id, { limit: 5 }), "attachments.list");
      expect(attachments.object).toBe("list");
      const first = attachments.data[0];
      if (first) {
        const one = ok(await bs.emails.attachments.get(sent.id, first.id), "attachments.get");
        expect(one.filename).toBe("report.txt");
      }
    });

    it("shares an email and unshares it", async () => {
      if (!ids.mail) return;
      live.own(ids.mail);
      const shared = ok(await bs.emails.share(ids.mail, {}), "emails.share");
      expect(shared.url).toMatch(/^https:\/\//);
      ok(await bs.emails.unshare(ids.mail), "emails.unshare");
    });
  });

  // -- Contacts, segments, topics, properties --------------------------------------------------------
  group("audience objects", () => {
    const contactEmail = recipient("c1");

    it("creates a segment, a topic and a property of its own", async () => {
      const segment = ok(await bs.segments.create({ name: `${RUN} segment` }), "segments.create");
      ids.segment = segment.id;
      live.own(segment.id);
      track("segment", () => bs.segments.delete(segment.id));
      ok(await bs.segments.update(segment.id, { name: `${RUN} segment renamed` }), "segments.update");

      const topic = ok(
        await bs.topics.create({
          name: `${RUN} topic`,
          default_subscription: "opt_in",
          visibility: "private",
        }),
        "topics.create",
      );
      ids.topic = topic.id;
      live.own(topic.id);
      track("topic", () => bs.topics.delete(topic.id));
      ok(await bs.topics.update(topic.id, { description: "made by the SDK's live suite" }), "topics.update");

      const property = ok(
        await bs.contactProperties.create({
          key: `${RUN}`.replace(/-/g, "_"),
          type: "string",
          fallback_value: "x",
        }),
        "contactProperties.create",
      );
      ids.property = property.id;
      live.own(property.id);
      track("property", () => bs.contactProperties.delete(property.id));
      ok(await bs.contactProperties.update(property.id, { fallback_value: "y" }), "contactProperties.update");
    });

    it("creates a contact and reads it back by email, with + and @ in the path", async () => {
      live.own(contactEmail);
      const created = ok(
        await bs.contacts.create({
          email: contactEmail,
          first_name: "Sdk",
          segments: [{ id: ids.segment ?? "" }],
          topics: [{ id: ids.topic ?? "", subscription: "opt_in" }],
        }),
        "contacts.create",
      );
      ids.contact = created.id;
      live.own(created.id, contactEmail);
      track("contact", () => bs.contacts.delete(created.id));
      const byEmail = ok(await bs.contacts.get(contactEmail), "contacts.get by email");
      expect(byEmail.id).toBe(created.id);
      expect(byEmail.email).toBe(contactEmail);
      expect(byEmail.first_name).toBe("Sdk");
      ok(await bs.contacts.update(created.id, { last_name: "E2E" }), "contacts.update");
    });

    it("reads a contact's segments and topics, and its segment's contacts", async () => {
      const segments = ok(
        await bs.contacts.segments.list(ids.contact ?? "", { limit: 5 }),
        "contacts.segments.list",
      );
      expect(segments.data.map((s) => s.id)).toContain(ids.segment);
      const topics = ok(await bs.contacts.topics.list(ids.contact ?? ""), "contacts.topics.list");
      expect(JSON.stringify(topics)).toContain(ids.topic ?? "?");
      ok(
        await bs.contacts.topics.update(ids.contact ?? "", [
          { id: ids.topic ?? "", subscription: "opt_out" },
        ]),
        "contacts.topics.update",
      );
      const members = ok(
        await bs.segments.contacts.list(ids.segment ?? "", { limit: 5 }),
        "segments.contacts.list",
      );
      expect(members.data.map((c) => c.id)).toContain(ids.contact);
      const viaAudience = ok(
        await bs.audiences.contacts.get(ids.segment ?? "", ids.contact ?? ""),
        "audiences.contacts.get",
      );
      expect(viaAudience.id).toBe(ids.contact);
    });

    it("creates, reads and removes contacts in bulk", async () => {
      const one = recipient("bulk1");
      const two = recipient("bulk2");
      live.own(one, two);
      const created = ok(
        await bs.contacts.batch.create(
          [{ email: one }, { email: two }],
          { on_conflict: "skip" },
          { batchValidation: "permissive" },
        ),
        "contacts.batch.create",
      );
      expect(created.data).toHaveLength(2);
      const bulkIds = created.data.map((c) => c.id);
      live.own(...bulkIds);
      track("bulk contacts", () => bs.contacts.batch.remove({ ids: bulkIds }));
      const read = ok(
        await bs.contacts.batch.get({
          contacts: [{ email: one }, { id: bulkIds[1] }],
          include: ["properties", "topics"],
        }),
        "contacts.batch.get",
      );
      expect(read.data).toHaveLength(2);
      const removed = ok(await bs.contacts.batch.remove({ ids: bulkIds }), "contacts.batch.remove");
      expect(removed.data.map((r) => r.contact).sort()).toEqual([...bulkIds].sort());
      done("bulk contacts");
    });

    it("README: imports a CSV and polls the import", async () => {
      const imported = recipient("csv");
      live.own(imported);
      const started = ok(
        await bs.contacts.imports.create({
          file: `Email,First Name\n${imported},Csv\n`,
          filename: "联系人 e2e.csv", // a non-ASCII file name travels in the multipart header
          column_map: { email: "Email", first_name: "First Name" },
          on_conflict: "skip",
        }),
        "contacts.imports.create",
      );
      let status = "";
      for (let tries = 0; tries < 6 && status !== "completed" && status !== "failed"; tries++) {
        status = ok(await bs.contacts.imports.get(started.id), "contacts.imports.get").status;
      }
      expect(status).toBe("completed");
      const contact = ok(await bs.contacts.get(imported), "contacts.get imported");
      live.own(contact.id);
      expect(contact.first_name).toBe("Csv");
      ok(await bs.contacts.delete(contact.id, { erase: "false" }), "contacts.delete");
    });

    it("sends a custom event for the contact", async () => {
      const name = RUN;
      const event = ok(await bs.events.create({ name, schema: { amount: "number" } }), "events.create");
      live.own(event.id, name);
      track("event", () => bs.events.remove(event.id));
      expect(ok(await bs.events.get(name), "events.get by name").name).toBe(name);
      ok(await bs.events.update(name, { schema: { amount: "number", note: "string" } }), "events.update");
      const sent = ok(
        await bs.events.send(
          { event: name, email: contactEmail, payload: { amount: 3 } },
          { idempotencyKey: `${RUN}/ev-1` },
        ),
        "events.send",
      );
      expect(sent.event).toBe(name);
      ok(await bs.events.remove(event.id), "events.remove");
      done("event");
    });

    it("estimates a verification of the contact's segment", async () => {
      const estimate = ok(
        await bs.verifications.estimate({ target: { kind: "segment", segment_id: ids.segment ?? "" } }),
        "verifications.estimate",
      );
      expect(estimate).toBeTruthy();
    });
  });

  // -- Templates and broadcasts ------------------------------------------------------------------------
  group("templates and broadcasts", () => {
    it("creates a template, reads it by id and by alias, publishes and duplicates it", async () => {
      const alias = `${RUN}-tpl`;
      const created = ok(
        await bs.templates.create({
          name: `${RUN} template`,
          alias,
          subject: "Hello {{{name}}}",
          html: "<p>Hello {{{name}}}</p>",
          variables: [{ key: "name", type: "string", fallback_value: "friend" }],
        }),
        "templates.create",
      );
      live.own(created.id, alias);
      track("template", () => bs.templates.delete(created.id));
      expect(ok(await bs.templates.get(created.id), "templates.get by id").alias).toBe(alias);
      expect(ok(await bs.templates.get(alias), "templates.get by alias").id).toBe(created.id);
      ok(await bs.templates.update(created.id, { name: `${RUN} template renamed` }), "templates.update");
      ok(await bs.templates.publish(created.id), "templates.publish");
      const copy = ok(await bs.templates.duplicate(created.id), "templates.duplicate");
      live.own(copy.id);
      ok(await bs.templates.delete(copy.id), "templates.delete copy");
      ok(await bs.templates.delete(created.id), "templates.delete");
      done("template");
    });

    it("creates a draft broadcast, edits and duplicates it, reads its reports and deletes both", async () => {
      if (!ids.segment) {
        // Without a segment a broadcast would address every contact of the team; give the draft one of ours.
        const segment = ok(await bs.segments.create({ name: `${RUN} broadcast segment` }), "segments.create");
        ids.segment = segment.id;
        live.own(segment.id);
        track("segment", () => bs.segments.delete(segment.id));
      }
      const draft = ok(
        await bs.broadcasts.create({
          name: `${RUN} broadcast`,
          segment_id: ids.segment,
          from: SENDER,
          subject: `${RUN} broadcast`,
          html: "<p>Never sent.</p>",
        }),
        "broadcasts.create",
      );
      live.own(draft.id);
      track("broadcast", () => bs.broadcasts.delete(draft.id));
      expect(ok(await bs.broadcasts.get(draft.id), "broadcasts.get").id).toBe(draft.id);
      ok(await bs.broadcasts.update(draft.id, { subject: `${RUN} broadcast, edited` }), "broadcasts.update");
      const recipients = ok(
        await bs.broadcasts.recipients(draft.id, { type: "sent" }),
        "broadcasts.recipients",
      );
      expect(recipients.data).toEqual([]);
      ok(await bs.broadcasts.clickedLinks(draft.id, { limit: 5 }), "broadcasts.clickedLinks");
      const copy = ok(await bs.broadcasts.duplicate(draft.id), "broadcasts.duplicate");
      live.own(copy.id);
      ok(await bs.broadcasts.delete(copy.id), "broadcasts.delete copy");
      ok(await bs.broadcasts.delete(draft.id), "broadcasts.delete");
      done("broadcast");
    });
  });

  // -- Webhooks, keys, suppressions ------------------------------------------------------------------
  group("account objects", () => {
    it("creates a webhook, checks a delivery signed with its secret, and deletes it", async () => {
      const created = ok(
        await bs.webhooks.create({ endpoint: "https://example.com/sdk-e2e", events: ["topic.deleted"] }),
        "webhooks.create",
      );
      live.own(created.id);
      track("webhook", () => bs.webhooks.delete(created.id));
      expect(created.signing_secret).toMatch(/^whsec_/);

      // The secret the API hands out must verify a delivery signed the way it signs.
      const payload = JSON.stringify({
        type: "topic.deleted",
        created_at: new Date().toISOString(),
        data: {},
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const key = Buffer.from(created.signing_secret.slice("whsec_".length), "base64");
      const signature = `v1,${createHmac("sha256", key).update(`msg_1.${timestamp}.${payload}`).digest("base64")}`;
      const event = await verifyWebhook(
        payload,
        { "webhook-id": "msg_1", "webhook-timestamp": timestamp, "webhook-signature": signature },
        created.signing_secret,
      );
      expect(event.type).toBe("topic.deleted");

      expect(ok(await bs.webhooks.get(created.id), "webhooks.get").endpoint).toBe(
        "https://example.com/sdk-e2e",
      );
      ok(await bs.webhooks.update(created.id, { status: "disabled" }), "webhooks.update");
      const deliveries = ok(await bs.webhooks.events.list(created.id, { limit: 5 }), "webhooks.events.list");
      expect(deliveries.data).toEqual([]);
      ok(await bs.webhooks.delete(created.id), "webhooks.delete");
      done("webhook");
    });

    it("README: verifies a delivery with the Fetch API and with a Node server", async () => {
      const secret = `whsec_${randomBytes(24).toString("base64")}`;
      const payload = JSON.stringify({
        type: "email.bounced",
        created_at: new Date().toISOString(),
        data: { id: "x" },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const sign = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
        .update(`msg_2.${timestamp}.${payload}`)
        .digest("base64");
      const headers = {
        "webhook-id": "msg_2",
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${sign}`,
      };

      const request = new Request("https://app.example.com/hook", { method: "POST", headers, body: payload });
      expect((await verifyWebhook(await request.text(), request.headers, secret)).type).toBe("email.bounced");

      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          verifyWebhook(Buffer.concat(chunks), req.headers, secret).then(
            () => res.writeHead(204).end(),
            () => res.writeHead(400).end(),
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
        expect((await fetch(url, { method: "POST", headers, body: payload })).status).toBe(204);
        expect((await fetch(url, { method: "POST", headers, body: `${payload} ` })).status).toBe(400);
      } finally {
        server.close();
      }
    });

    it("creates a sending-only key, which cannot read contacts, and deletes it", async () => {
      const created = ok(
        await bs.apiKeys.create({ name: `${RUN}`, permission: "sending_access" }),
        "apiKeys.create",
      );
      live.own(created.id);
      track("api key", () => bs.apiKeys.delete(created.id));
      expect(created.token).toMatch(/^bs_/);
      ok(await bs.apiKeys.update(created.id, { name: `${RUN} renamed` }), "apiKeys.update");
      const restricted = live.client({ apiKey: created.token, maxRetries: 0 });
      const result = await restricted.contacts.list({ limit: 1 });
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
      expect(result.error?.name).toBe("restricted_api_key");
      ok(await bs.apiKeys.delete(created.id), "apiKeys.delete");
      done("api key");
    });

    it("adds, reads and removes manual suppressions", async () => {
      const one = recipient("sup1");
      const two = recipient("sup2");
      const three = recipient("sup3");
      live.own(one, two, three);
      const created = ok(
        await bs.suppressions.create({ email: one, origin: "manual" }),
        "suppressions.create",
      );
      live.own(created.id);
      track("suppression", () => bs.suppressions.delete(created.id));
      expect(ok(await bs.suppressions.get(created.id), "suppressions.get").email).toBe(one);
      const batch = ok(
        await bs.suppressions.batch.add({ emails: [two, three], origin: "manual" }),
        "suppressions.batch.add",
      );
      const batchIds = batch.data.map((s) => s.id);
      live.own(...batchIds);
      track("suppression batch", () => bs.suppressions.batch.remove({ ids: batchIds }));
      const removed = ok(await bs.suppressions.batch.remove({ ids: batchIds }), "suppressions.batch.remove");
      expect(removed.not_removed).toEqual([]);
      done("suppression batch");
      ok(await bs.suppressions.delete(created.id), "suppressions.delete");
      done("suppression");
    });
  });

  // -- Automations --------------------------------------------------------------------------------
  group("automations", () => {
    it("validates, creates and edits a disabled automation, then simulates it", async () => {
      const graph = {
        steps: [
          { key: "start", type: "trigger" as const, config: { event_name: `${RUN}-auto` } },
          { key: "wait", type: "delay" as const, config: { duration: "1 hour" } },
        ],
        connections: [{ from: "start", to: "wait" }],
      };
      const check = ok(await bs.automations.validate(graph), "automations.validate");
      expect(check.valid).toBe(true);
      const created = ok(
        await bs.automations.create({ name: `${RUN} automation`, status: "disabled", ...graph }),
        "automations.create",
      );
      live.own(created.id);
      track("automation", () => bs.automations.remove(created.id));
      const got = ok(await bs.automations.get(created.id), "automations.get");
      expect(got.status).toBe("disabled");
      expect(got.steps).toHaveLength(2);
      ok(
        await bs.automations.update(created.id, { name: `${RUN} automation, renamed` }),
        "automations.update",
      );
      const simulation = ok(
        await bs.automations.simulate(created.id, { contact: { email: recipient("sim") }, payload: {} }),
        "automations.simulate",
      );
      expect(simulation.object).toBe("automation_simulation");
      ok(await bs.automations.metrics(created.id, {}), "automations.metrics");
      expect(
        ok(await bs.automations.runs.list(created.id, { limit: 5 }), "automations.runs.list").data,
      ).toEqual([]);
      ok(await bs.automations.stop(created.id), "automations.stop");
      const copy = ok(await bs.automations.duplicate(created.id), "automations.duplicate");
      live.own(copy.id);
      ok(await bs.automations.remove(copy.id), "automations.remove copy");
      ok(await bs.automations.remove(created.id), "automations.remove");
      done("automation");
    });
  });

  // -- Live events -------------------------------------------------------------------------------
  group("event stream", () => {
    it("README: opens the team's stream, reads what arrives for a few seconds and closes it", async () => {
      const opened = await bs.inboxes.events.stream(
        { types: "inbox.email.received,inbox.thread.created" },
        { reconnect: false },
      );
      if (opened.error) throw new Error(`stream: ${opened.error.statusCode} ${opened.error.name}`);
      expect(opened.data.response?.status).toBe(200);
      expect(opened.data.response?.headers.get("content-type")).toContain("text/event-stream");
      const timer = setTimeout(() => opened.data.close(), 3_000);
      try {
        for await (const item of opened.data) {
          expect(item.event).toBeTruthy();
        }
      } finally {
        clearTimeout(timer);
        opened.data.close();
      }
    });

    it("README: an inbox that does not exist is refused with NotFoundError, not a stream", async () => {
      const result = await bs.inboxes.events.streamInbox(`${RUN}@support.example.com`, undefined, {
        reconnect: false,
      });
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  // -- What the run did ---------------------------------------------------------------------------
  group("account after the run", () => {
    it("holds none of the objects this run made", async () => {
      // Run the teardown first, so the check sees its result.
      live.teardown = true;
      for (const [name, remove] of [...cleanups].reverse()) {
        await remove().catch(() => undefined);
        cleanups.delete(name);
      }
      const leftovers: string[] = [];
      const has = (rows: { name?: string | null; key?: string; endpoint?: string }[]) =>
        rows.filter(
          (r) =>
            `${r.name ?? ""}${r.key ?? ""}${r.endpoint ?? ""}`.includes(RUN.replace(/-/g, "_")) ||
            `${r.name ?? ""}${r.endpoint ?? ""}`.includes(RUN),
        );
      const checks: [
        string,
        Promise<{
          error: unknown;
          data: { data: { name?: string | null; key?: string; endpoint?: string }[] } | null;
        }>,
      ][] = [
        ["segments", bs.segments.list({ limit: 100 })],
        ["topics", bs.topics.list()],
        ["templates", bs.templates.list({ limit: 100 })],
        ["automations", bs.automations.list({ limit: 100 })],
        ["events", bs.events.list({ limit: 100 })],
        ["apiKeys", bs.apiKeys.list({ limit: 100 })],
        ["webhooks", bs.webhooks.list({ limit: 100 })],
      ];
      for (const [name, pending] of checks) {
        const result = await pending;
        if (result.error || !result.data) {
          leftovers.push(`${name}: could not be listed`);
          continue;
        }
        for (const row of has(result.data.data))
          leftovers.push(`${name}: ${row.name ?? row.key ?? row.endpoint}`);
      }
      for (const email of [recipient("c1"), recipient("csv")]) {
        const result = await bs.contacts.get(email);
        if (result.error === null) leftovers.push(`contact ${email}`);
        else expect(result.error).toBeInstanceOf(NotFoundError);
      }
      expect(leftovers, "objects left behind").toEqual([]);
    });

    it("stayed inside the request and mail budget, and was never refused", () => {
      console.log(`live suite: ${live.requests} requests, ${live.mails} mails counted`);
      expect(live.requests).toBeLessThanOrEqual(MAX_REQUESTS);
      expect(live.refused).toEqual([]);
    });

    it("saw only answers the published OpenAPI document describes", () => {
      expect(live.mismatches).toEqual([]);
    });
  });
});
