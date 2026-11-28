import { describe, expect, it } from "vitest";
import { type BillionSend, PermissionDeniedError, paginate } from "../src/index.js";
import { ID, listPage, useContractMock } from "./helpers.js";

const { mock, client } = useContractMock();

const ids = [
  "0b8e3c6a-0000-4000-8000-000000000001",
  "0b8e3c6a-0000-4000-8000-000000000002",
  "0b8e3c6a-0000-4000-8000-000000000003",
];

describe("listAll", () => {
  it("walks forward with after = the last id until has_more is false", async () => {
    mock.reply("GET /contacts", {
      status: 200,
      body: listPage("GET /contacts", [ids[0] as string, ids[1] as string], true),
    });
    mock.reply("GET /contacts", {
      status: 200,
      body: listPage("GET /contacts", [ids[2] as string], false),
    });
    const seen: string[] = [];
    for await (const item of client().contacts.listAll({ limit: 2 })) seen.push(item.id);
    expect(seen).toEqual(ids);
    const queries = mock.hitsFor("GET /contacts").map((hit) => Object.fromEntries(hit.url.searchParams));
    expect(queries).toEqual([{ limit: "2" }, { limit: "2", after: ids[1] }]);
  });

  it("walks suppressions of every kind, a domain entry's email being null", async () => {
    const page = listPage("GET /suppressions", [ids[0] as string, ids[1] as string], false) as {
      data: Record<string, unknown>[];
    };
    page.data[0] = { ...page.data[0], email: null, kind: "domain", domain: "spam.example", removable: true };
    page.data[1] = {
      ...page.data[1],
      email: "ana@example.com",
      kind: "email",
      domain: null,
      removable: false,
    };
    mock.reply("GET /suppressions", { status: 200, body: page as never });
    const seen: [string | null, string | null][] = [];
    for await (const entry of client().suppressions.listAll({ kind: "all" })) {
      seen.push([entry.email, entry.domain]);
    }
    expect(seen).toEqual([
      [null, "spam.example"],
      ["ana@example.com", null],
    ]);
    expect(mock.hitsFor("GET /suppressions").map((hit) => Object.fromEntries(hit.url.searchParams))).toEqual([
      { kind: "all" },
    ]);
  });

  it("walks backward with before = the first id when started with before", async () => {
    mock.reply("GET /domains", {
      status: 200,
      body: listPage("GET /domains", [ids[1] as string, ids[2] as string], true),
    });
    mock.reply("GET /domains", {
      status: 200,
      body: listPage("GET /domains", [ids[0] as string], false),
    });
    const seen: string[] = [];
    for await (const item of client().domains.listAll({ before: ID })) seen.push(item.id);
    expect(seen).toEqual([ids[1], ids[2], ids[0]]);
    const queries = mock.hitsFor("GET /domains").map((hit) => Object.fromEntries(hit.url.searchParams));
    expect(queries).toEqual([{ before: ID }, { before: ids[1] }]);
  });

  it("stops early when the caller breaks out", async () => {
    mock.reply("GET /webhooks", {
      status: 200,
      body: listPage("GET /webhooks", [ids[0] as string, ids[1] as string], true),
    });
    for await (const item of client().webhooks.listAll()) {
      expect(item.id).toBe(ids[0]);
      break;
    }
    expect(mock.hitsFor("GET /webhooks")).toHaveLength(1);
  });

  it("follows nested lists with their path parameters", async () => {
    mock.reply("GET /inboxes/{inbox_id}/threads/{thread_id}/emails", {
      status: 200,
      body: listPage("GET /inboxes/{inbox_id}/threads/{thread_id}/emails", [ids[0] as string], true),
    });
    mock.reply("GET /inboxes/{inbox_id}/threads/{thread_id}/emails", {
      status: 200,
      body: listPage("GET /inboxes/{inbox_id}/threads/{thread_id}/emails", [ids[1] as string], false),
    });
    const seen: string[] = [];
    for await (const email of client().inboxes.threads.emails.listAll("support@example.com", ID))
      seen.push(email.id);
    expect(seen).toEqual([ids[0], ids[1]]);
    const last = mock.hitsFor("GET /inboxes/{inbox_id}/threads/{thread_id}/emails")[1];
    expect(last?.url.pathname).toBe(`/inboxes/support%40example.com/threads/${ID}/emails`);
    expect(last?.url.searchParams.get("after")).toBe(ids[0]);
  });

  it("throws the page error as its error class", async () => {
    mock.reply("GET /segments", {
      status: 403,
      body: { statusCode: 403, name: "restricted_api_key", message: "No" },
    });
    const iterate = async () => {
      for await (const _ of client().segments.listAll()) {
        // drain
      }
    };
    await expect(iterate()).rejects.toBeInstanceOf(PermissionDeniedError);
    mock.reply("GET /segments", {
      status: 403,
      body: { statusCode: 403, name: "restricted_api_key", message: "No" },
    });
    await expect(iterate()).rejects.toMatchObject({
      statusCode: 403,
      name: "restricted_api_key",
      message: "No",
    });
  });

  it("throws application_error on a page without a data array", async () => {
    for (const body of [
      { has_more: false },
      { data: null, has_more: false },
      { data: "x", has_more: false },
      null,
    ]) {
      const walk = async () => {
        for await (const _ of paginate(async () => ({ data: body as never, error: null, headers: {} }))) {
          // drain
        }
      };
      await expect(walk()).rejects.toMatchObject({
        name: "application_error",
        statusCode: null,
        message: "The list page has no data array",
      });
    }
  });

  it("hands out a page whose item to continue from has no id, then throws, without asking again", async () => {
    for (const [start, edge] of [
      [{}, "last"],
      [{ before: "z" }, "first"],
    ] as const) {
      for (const bad of [{}, { id: "" }, { id: 7 }, { id: null }, null, "text"]) {
        let fetches = 0;
        const page = edge === "last" ? [{ id: "a" }, bad] : [bad, { id: "a" }];
        const seen: unknown[] = [];
        const walk = async () => {
          for await (const item of paginate(async () => {
            fetches++;
            return { data: { data: page as never, has_more: true }, error: null, headers: {} };
          }, start)) {
            seen.push(item);
          }
        };
        await expect(walk()).rejects.toMatchObject({
          name: "application_error",
          message: `The ${edge} item of the list page has no id to continue from`,
        });
        expect(seen).toEqual(page);
        expect(fetches).toBe(1);
      }
    }
  });

  it("paginate() works with any page fetcher", async () => {
    const pages = [
      { data: [{ id: "a" }, { id: "b" }], has_more: true },
      { data: [], has_more: true },
    ];
    const cursors: unknown[] = [];
    const seen: string[] = [];
    for await (const item of paginate(async (cursor) => {
      cursors.push(cursor);
      return { data: pages.shift() ?? { data: [], has_more: false }, error: null, headers: {} };
    })) {
      seen.push(item.id);
    }
    expect(seen).toEqual(["a", "b"]);
    expect(cursors).toEqual([{}, { after: "b" }]);
  });
});

describe("every listAll / searchAll helper", () => {
  const helpers: [string, (bs: BillionSend) => AsyncGenerator<{ id: string }, void, undefined>][] = [
    ["GET /emails", (bs) => bs.emails.listAll()],
    ["GET /emails/receiving", (bs) => bs.emails.receiving.listAll({ unread: "true" })],
    ["GET /emails/receiving/{email_id}/attachments", (bs) => bs.emails.receiving.attachments.listAll(ID)],
    ["GET /domains", (bs) => bs.domains.listAll()],
    ["GET /api-keys", (bs) => bs.apiKeys.listAll()],
    ["GET /webhooks", (bs) => bs.webhooks.listAll()],
    ["GET /contacts", (bs) => bs.contacts.listAll()],
    ["GET /contact-properties", (bs) => bs.contactProperties.listAll()],
    ["GET /segments", (bs) => bs.segments.listAll()],
    ["GET /segments/{id}/contacts", (bs) => bs.segments.contacts.listAll(ID)],
    ["GET /broadcasts", (bs) => bs.broadcasts.listAll()],
    ["GET /broadcast-groups", (bs) => bs.broadcastGroups.listAll()],
    ["GET /topics", (bs) => bs.topics.listAll()],
    ["GET /contacts/{id}/topics", (bs) => bs.contacts.topics.listAll(ID)],
    ["GET /templates", (bs) => bs.templates.listAll()],
    ["GET /suppressions", (bs) => bs.suppressions.listAll({ origin: "manual" })],
    ["GET /unsubscribes", (bs) => bs.unsubscribes.listAll()],
    ["GET /verifications", (bs) => bs.verifications.listAll()],
    ["GET /contacts/imports", (bs) => bs.contacts.imports.listAll()],
    ["GET /contacts/{id}/segments", (bs) => bs.contacts.segments.listAll(ID)],
    ["GET /broadcasts/{id}/recipients", (bs) => bs.broadcasts.recipientsAll(ID, { type: "opened" })],
    ["GET /broadcasts/{id}/clicked-links", (bs) => bs.broadcasts.clickedLinksAll(ID)],
    ["GET /emails/{email_id}/attachments", (bs) => bs.emails.attachments.listAll(ID)],
    ["GET /webhooks/{id}/events", (bs) => bs.webhooks.events.listAll(ID)],
    ["GET /webhooks/{id}/events/{event_id}/attempts", (bs) => bs.webhooks.events.attempts.listAll(ID, ID)],
    ["GET /events", (bs) => bs.events.listAll()],
    ["GET /automations", (bs) => bs.automations.listAll()],
    ["GET /automations/{id}/runs", (bs) => bs.automations.runs.listAll(ID)],
    ["GET /logs", (bs) => bs.logs.listAll()],
    ["GET /oauth/grants", (bs) => bs.oauthGrants.listAll()],
    ["GET /inboxes", (bs) => bs.inboxes.listAll({ kind: "human" })],
    ["GET /inboxes/{inbox_id}/threads", (bs) => bs.inboxes.threads.listAll(ID)],
    ["GET /inboxes/{inbox_id}/threads/search", (bs) => bs.inboxes.threads.searchAll(ID, { query: "x" })],
    ["GET /inboxes/{inbox_id}/threads/{thread_id}/emails", (bs) => bs.inboxes.threads.emails.listAll(ID, ID)],
    ["GET /inboxes/{inbox_id}/quarantine", (bs) => bs.inboxes.quarantine.listAll(ID)],
    ["GET /inboxes/{inbox_id}/drafts", (bs) => bs.inboxes.drafts.listAll(ID)],
  ];

  it.each(helpers)("%s", async (key, iterate) => {
    mock.reply(key, { status: 200, body: listPage(key, [ids[0] as string], true) });
    mock.reply(key, { status: 200, body: listPage(key, [ids[1] as string], false) });
    const seen: string[] = [];
    for await (const item of iterate(client())) seen.push(item.id);
    expect(seen).toEqual([ids[0], ids[1]]);
    expect(mock.hitsFor(key)[1]?.url.searchParams.get("after")).toBe(ids[0]);
  });
});

describe("listAll: where it starts and how it fails", () => {
  it("starts after the cursor it is given and passes the other parameters on every page", async () => {
    mock.reply("GET /contacts", { status: 200, body: listPage("GET /contacts", [ids[0] as string], true) });
    mock.reply("GET /contacts", { status: 200, body: listPage("GET /contacts", [ids[1] as string], false) });
    for await (const _ of client().contacts.listAll({ limit: 1, after: ID })) {
      // drain
    }
    const queries = mock.hitsFor("GET /contacts").map((hit) => Object.fromEntries(hit.url.searchParams));
    expect(queries).toEqual([
      { limit: "1", after: ID },
      { limit: "1", after: ids[0] },
    ]);
  });

  it("treats a null `before` as no cursor", async () => {
    mock.reply("GET /contacts", { status: 200, body: listPage("GET /contacts", [], false) });
    for await (const _ of client().contacts.listAll({ before: null as never })) {
      // drain
    }
    expect([...(mock.hitsFor("GET /contacts")[0]?.url.searchParams.keys() ?? [])]).toEqual([]);
  });

  it("hands out the items of the pages before a failing one, then throws that page's error", async () => {
    mock.reply("GET /contacts", { status: 200, body: listPage("GET /contacts", [ids[0] as string], true) });
    mock.reply("GET /contacts", {
      status: 403,
      body: { statusCode: 403, name: "restricted_api_key", message: "Revoked meanwhile" },
    });
    const seen: string[] = [];
    const walk = async () => {
      for await (const contact of client({ maxRetries: 0 }).contacts.listAll()) seen.push(contact.id);
    };
    await expect(walk()).rejects.toMatchObject({ statusCode: 403, name: "restricted_api_key" });
    expect(seen).toEqual([ids[0]]);
  });

  it("ends on a page that says there is more but has no items", async () => {
    mock.reply("GET /contacts", { status: 200, body: listPage("GET /contacts", [], true) });
    const seen: string[] = [];
    for await (const contact of client().contacts.listAll()) seen.push(contact.id);
    expect(seen).toEqual([]);
    expect(mock.hitsFor("GET /contacts")).toHaveLength(1);
  });
});
