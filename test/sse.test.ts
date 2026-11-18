import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIError,
  type InboxStreamItem,
  PermissionDeniedError,
  RateLimitError,
} from "../src/index.js";
import { parseEventStream, type ServerSentEvent } from "../src/sse.js";
import { ID, useContractMock } from "./helpers.js";

const { mock, client } = useContractMock();

function bodyOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function parse(chunks: (string | Uint8Array)[], onRetry: (ms: number) => void = () => {}) {
  const events: ServerSentEvent[] = [];
  for await (const event of parseEventStream(bodyOf(chunks), { onRetry })) events.push(event);
  return events;
}

describe("parseEventStream", () => {
  it("parses id, event and JSON data", async () => {
    const events = await parse([
      'id: 7\nevent: inbox.email.received\ndata: {"type":"inbox.email.received","inbox_id":"x"}\n\n',
    ]);
    expect(events).toEqual([
      {
        id: "7",
        event: "inbox.email.received",
        data: { type: "inbox.email.received", inbox_id: "x" },
        raw: '{"type":"inbox.email.received","inbox_id":"x"}',
      },
    ]);
  });

  it("joins events split across chunks, including a CRLF split in two", async () => {
    const events = await parse(["id: 1\r", "\nda", 'ta: {"a"', ":1}\r\n\r", "\nid: 2\r\ndata: 2\r\n\r\n"]);
    expect(events.map((e) => [e.id, e.data])).toEqual([
      ["1", { a: 1 }],
      ["2", 2],
    ]);
  });

  it("splits a multi-byte character across chunks correctly", async () => {
    const bytes = new TextEncoder().encode("data: héllo\n\n");
    const events = await parse([bytes.slice(0, 8), bytes.slice(8)]);
    expect(events[0]?.data).toBe("héllo");
  });

  it("ignores comments, unknown fields and events without data", async () => {
    const events = await parse([": keep-alive\n\nfoo: bar\nevent: ping\n\n:another\ndata: x\n\n"]);
    expect(events).toEqual([{ id: null, event: "message", data: "x", raw: "x" }]);
  });

  it("joins multi-line data with newlines and keeps non-JSON as text", async () => {
    const events = await parse(["data: first\ndata:second\ndata\n\n"]);
    expect(events[0]?.raw).toBe("first\nsecond\n");
    expect(events[0]?.data).toBe("first\nsecond\n");
  });

  it("keeps the last id for later events and reports retry", async () => {
    const retries: number[] = [];
    const events = await parse(
      ["﻿id: 5\ndata: a\n\nretry: 2500\ndata: b\n\nretry: soon\nid\ndata: c\n\n"],
      (ms) => retries.push(ms),
    );
    expect(events.map((e) => e.id)).toEqual(["5", "5", ""]);
    expect(retries).toEqual([2500]);
  });

  it("drops an event the stream cut off before its blank line", async () => {
    const events = await parse(["data: complete\n\ndata: partial\n"]);
    expect(events.map((e) => e.data)).toEqual(["complete"]);
  });
});

describe("inbox event streams", () => {
  it("streams the team's events and closes when the loop breaks", async () => {
    let closed = false;
    mock.stream("GET /inboxes/events", (res) => {
      res.on("close", () => {
        closed = true;
      });
      res.write('id: 10\nevent: inbox.thread.created\ndata: {"type":"inbox.thread.created"}\n\n');
      res.write(": keep-alive\n\n");
      res.write('id: 11\nevent: email.received\ndata: {"type":"email.received"}\n\n');
      // stays open
    });
    const opened = await client().inboxes.events.stream({ types: "inbox.thread.created,email.received" });
    expect(opened.error).toBeNull();
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    const names: string[] = [];
    for await (const event of stream) {
      names.push(event.event);
      if (names.length === 2) break;
    }
    expect(names).toEqual(["inbox.thread.created", "email.received"]);
    expect(stream.lastEventId).toBe("11");
    const hit = mock.hitsFor("GET /inboxes/events")[0];
    expect(hit?.url.searchParams.get("types")).toBe("inbox.thread.created,email.received");
    expect(hit?.headers.accept).toBe("text/event-stream");
    await expect.poll(() => closed).toBe(true);
  });

  it("is not cut by the request timeout once open", async () => {
    mock.stream("GET /inboxes/{inbox_id}/events", async (res) => {
      await new Promise((done) => setTimeout(done, 150));
      res.write("id: 1\ndata: {}\n\n");
      res.end();
    });
    const opened = await client({ timeoutMs: 50 }).inboxes.events.streamInbox(ID, undefined, {
      reconnect: false,
    });
    const events = [];
    for await (const event of opened.data ?? []) events.push(event);
    expect(events).toHaveLength(1);
  });

  it("reconnects with Last-Event-ID after a drop", async () => {
    mock.stream("GET /inboxes/{inbox_id}/events", (res) => {
      res.write('retry: 10\nid: 41\ndata: {"n":41}\n\n');
      res.end();
    });
    mock.stream("GET /inboxes/{inbox_id}/events", (res) => {
      res.write('id: 42\ndata: {"n":42}\n\n');
      res.end();
    });
    mock.reply("GET /inboxes/{inbox_id}/events", {
      status: 503,
      body: { statusCode: 503, name: "unavailable", message: "Busy" },
    });
    const opened = await client().inboxes.events.streamInbox(
      "support@example.com",
      { types: "inbox.email.received" },
      {
        lastEventId: "40",
        reconnectDelayMs: 5_000,
        maxReconnects: 1,
      },
    );
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    const data: unknown[] = [];
    const run = async () => {
      for await (const event of stream) data.push(event.data);
    };
    const error = await run().catch((e: unknown) => e);
    // The last reconnect got an answer: that answer is thrown, not "gave up".
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ statusCode: 503, name: "unavailable" });
    expect(data).toEqual([{ n: 41 }, { n: 42 }]);
    const hits = mock.hitsFor("GET /inboxes/{inbox_id}/events");
    expect(hits.map((hit) => hit.headers["last-event-id"])).toEqual(["40", "41", "42"]);
    expect(hits.every((hit) => hit.url.searchParams.get("types") === "inbox.email.received")).toBe(true);
  });

  it("resumes from the cursor the server opened with when the stream ends before any event", async () => {
    // A new stream opens with `retry:` and an id-only block (the position it started at); the server
    // also closes a quiet stream on schedule. The reconnect must carry that position, or what arrived
    // between the two connections is lost for good.
    mock.stream("GET /inboxes/{inbox_id}/events", (res) => {
      res.write("retry: 10\n\nid: 9.1.1790000000\n\n");
      res.end();
    });
    mock.stream("GET /inboxes/{inbox_id}/events", (res) => {
      res.write("id: 9.2.1790000001\n\n");
      res.end();
    });
    mock.stream("GET /inboxes/{inbox_id}/events", (res) => {
      res.write('id: 9.3.1790000002\nevent: inbox.deleted\ndata: {"type":"inbox.deleted"}\n\n');
      res.end();
    });
    const opened = await client().inboxes.events.streamInbox("support@example.com", undefined, {
      reconnectDelayMs: 5,
    });
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    const events: unknown[] = [];
    for await (const event of stream) events.push(event.event);
    expect(events).toEqual(["inbox.deleted"]);
    const hits = mock.hitsFor("GET /inboxes/{inbox_id}/events");
    expect(hits.map((hit) => hit.headers["last-event-id"])).toEqual([
      undefined,
      "9.1.1790000000",
      "9.2.1790000001",
    ]);
    expect(stream.lastEventId).toBe("9.3.1790000002");
  });

  it("retries a reconnect refused with 503 and throws a refusal that retrying cannot fix", async () => {
    mock.stream("GET /inboxes/events", (res) => {
      res.write("retry: 1\nid: 1\ndata: {}\n\n");
      res.end();
    });
    mock.reply("GET /inboxes/events", {
      status: 503,
      body: { statusCode: 503, name: "unavailable", message: "Busy" },
    });
    mock.reply("GET /inboxes/events", {
      status: 403,
      body: { statusCode: 403, name: "restricted_api_key", message: "Team-wide key needed" },
    });
    const opened = await client().inboxes.events.stream();
    const run = async () => {
      for await (const _ of opened.data ?? []) {
        // drain
      }
    };
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(error).toMatchObject({ statusCode: 403, name: "restricted_api_key" });
    expect(mock.hitsFor("GET /inboxes/events").map((hit) => hit.headers["last-event-id"])).toEqual([
      undefined,
      "1",
      "1",
    ]);
  });

  it("returns the refusal when the stream cannot open", async () => {
    mock.reply("GET /inboxes/events", {
      status: 403,
      body: { statusCode: 403, name: "restricted_api_key", message: "No" },
    });
    const opened = await client().inboxes.events.stream();
    expect(opened).toMatchObject({ data: null, error: { statusCode: 403, name: "restricted_api_key" } });
  });

  it("refuses an answer that is not an event stream", async () => {
    // A JSON 200 for a stream operation is off the document on purpose: a proxy answering in its place.
    mock.reply("GET /inboxes/events", { status: 200, body: { hello: "world" }, offContract: true });
    const opened = await client().inboxes.events.stream();
    expect(opened.error).toMatchObject({ statusCode: 200, name: "application_error" });
  });

  it("hands out stream.gap once per position, typed, without moving the position", async () => {
    const gap = 'event: stream.gap\ndata: {"reason":"retention"}\n\n';
    // The server repeats the gap on each reconnect from the same old position.
    mock.stream("GET /inboxes/events", (res) => {
      res.write(`retry: 1\n\n${gap}`);
      res.end();
    });
    mock.stream("GET /inboxes/events", (res) => {
      res.write(gap);
      res.write(
        'id: 9.1.1790000000\nevent: inbox.email.received\ndata: {"type":"inbox.email.received","created_at":"2026-11-16T00:00:00.000Z","inbox_id":"i","data":{"inbox_id":"i","thread_id":"t","email_id":"e"}}\n\n',
      );
      res.end();
    });
    // A gap after a newer position is a new gap.
    mock.stream("GET /inboxes/events", (res) => {
      res.write(gap);
      res.end();
    });
    mock.reply("GET /inboxes/events", {
      status: 403,
      body: { statusCode: 403, name: "restricted_api_key", message: "stop" },
    });
    const opened = await client().inboxes.events.stream(undefined, { lastEventId: "1.1.1" });
    const items: InboxStreamItem[] = [];
    const run = async () => {
      for await (const item of opened.data ?? []) items.push(item);
    };
    await run().catch(() => {});
    expect(items.map((item) => [item.event, item.id])).toEqual([
      ["stream.gap", null],
      ["inbox.email.received", "9.1.1790000000"],
      ["stream.gap", null],
    ]);
    const [gapItem, email] = items;
    if (gapItem?.event === "stream.gap") expect(gapItem.data.reason).toBe("retention");
    if (email?.event === "inbox.email.received") expect(email.data.data.email_id).toBe("e");
    expect(mock.hitsFor("GET /inboxes/events").map((hit) => hit.headers["last-event-id"])).toEqual([
      "1.1.1",
      "1.1.1",
      "9.1.1790000000",
      "9.1.1790000000",
    ]);
  });

  it("ends one inbox's stream after inbox.deleted, without reconnecting; the team stream goes on", async () => {
    mock.stream("GET /inboxes/{inbox_id}/events", (res) => {
      res.write(
        'id: 1\nevent: inbox.deleted\ndata: {"type":"inbox.deleted","created_at":"x","inbox_id":"i","data":{}}\n\n',
      );
      res.end();
    });
    const one = await client().inboxes.events.streamInbox(ID, undefined, { reconnectDelayMs: 1 });
    const seen: string[] = [];
    for await (const item of one.data ?? []) seen.push(item.event);
    expect(seen).toEqual(["inbox.deleted"]);
    expect(mock.hitsFor("GET /inboxes/{inbox_id}/events")).toHaveLength(1);

    mock.stream("GET /inboxes/events", (res) => {
      res.write(
        'id: 1\nevent: inbox.expired\ndata: {"type":"inbox.expired","created_at":"x","inbox_id":"i","data":{}}\n\n',
      );
      res.write(
        'id: 2\nevent: inbox.created\ndata: {"type":"inbox.created","created_at":"x","inbox_id":"j","data":{}}\n\n',
      );
    });
    const team = await client().inboxes.events.stream();
    const names: string[] = [];
    for await (const item of team.data ?? []) {
      names.push(item.event);
      if (names.length === 2) break;
    }
    expect(names).toEqual(["inbox.expired", "inbox.created"]);
  });

  it("ends quietly on close() and on the caller's abort signal", async () => {
    mock.stream("GET /inboxes/events", (res) => {
      res.write("id: 1\ndata: {}\n\n");
    });
    const opened = await client().inboxes.events.stream();
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    const seen: string[] = [];
    for await (const event of stream) {
      seen.push(event.id ?? "");
      stream.close();
    }
    expect(seen).toEqual(["1"]);
    expect(() => stream[Symbol.asyncIterator]()).toThrow(TypeError);

    mock.stream("GET /inboxes/events", (res) => {
      res.write("id: 2\ndata: {}\n\n");
    });
    const controller = new AbortController();
    const second = await client().inboxes.events.stream(undefined, { signal: controller.signal });
    const ids: string[] = [];
    for await (const event of second.data ?? []) {
      ids.push(event.id ?? "");
      controller.abort();
    }
    expect(ids).toEqual(["2"]);
  });
});

describe("reconnect counting", () => {
  const drain = async (stream: AsyncIterable<InboxStreamItem> | null) => {
    const seen: InboxStreamItem[] = [];
    for await (const item of stream ?? []) seen.push(item);
    return seen;
  };
  const quiet = (res: import("node:http").ServerResponse) => {
    res.write("retry: 1\n: keepalive\n\n");
    res.end();
  };

  it("keeps reconnecting a quiet stream the server closes, however often", async () => {
    for (let i = 0; i < 12; i++) mock.stream("GET /inboxes/events", quiet);
    mock.stream("GET /inboxes/events", (res) => {
      res.write('id: 9\nevent: inbox.updated\ndata: {"type":"inbox.updated"}\n\n');
      res.end();
    });
    const opened = await client().inboxes.events.stream(undefined, { maxReconnects: 2 });
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    for await (const item of stream) {
      expect(item.id).toBe("9");
      stream.close();
    }
    expect(mock.hitsFor("GET /inboxes/events")).toHaveLength(13);
  });

  it("waits out a reconnect's Retry-After, then throws the API's answer when the reconnects run out", async () => {
    mock.stream("GET /inboxes/events", quiet);
    for (let i = 0; i < 2; i++)
      mock.reply("GET /inboxes/events", {
        status: 429,
        headers: { "retry-after": "0.3" },
        body: { statusCode: 429, name: "too_many_streams", message: "Too many streams" },
      });
    const opened = await client({ maxRetries: 0 }).inboxes.events.stream(undefined, { maxReconnects: 2 });
    const started = Date.now();
    const error = await drain(opened.data).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ name: "too_many_streams", retryAfter: 0.3 });
    // One wait of the stream's 1 ms retry, then one of the API's 300 ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    expect(mock.hitsFor("GET /inboxes/events")).toHaveLength(3);
  });

  it("throws a Retry-After longer than a minute at once", async () => {
    mock.stream("GET /inboxes/events", quiet);
    mock.reply("GET /inboxes/events", {
      status: 503,
      headers: { "retry-after": "120" },
      body: { statusCode: 503, name: "unavailable", message: "Busy" },
    });
    const opened = await client({ maxRetries: 0 }).inboxes.events.stream(undefined, { maxReconnects: 5 });
    const error = await drain(opened.data).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ statusCode: 503, retryAfter: 120 });
    expect(mock.hitsFor("GET /inboxes/events")).toHaveLength(2);
  });

  it("gives up with an APIConnectionError when the API cannot be reached", async () => {
    mock.stream("GET /inboxes/events", quiet);
    let calls = 0;
    const flaky: typeof fetch = (input, init) => {
      calls++;
      return calls === 1 ? fetch(input, init) : Promise.reject(new TypeError("fetch failed"));
    };
    const opened = await client({ maxRetries: 0, fetch: flaky }).inboxes.events.stream(undefined, {
      maxReconnects: 2,
    });
    const error = await drain(opened.data).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIConnectionError);
    expect(error).toMatchObject({ message: expect.stringContaining("gave up after 2 reconnects") });
    expect(calls).toBe(3);
  });
});

describe("edges of the parser and the stream object", () => {
  it("dispatches an event whose closing blank line is a lone CR at the very end", async () => {
    const events = await parse(["id: 1\ndata: last\n\r"]);
    expect(events.map((e) => e.data)).toEqual(["last"]);
  });

  it("answers `response` while open and null once closed", async () => {
    mock.stream("GET /inboxes/events", (res) => {
      res.write("id: 1\ndata: {}\n\n");
    });
    const opened = await client().inboxes.events.stream({}, { reconnect: false });
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    expect(stream.response?.status).toBe(200);
    stream.close();
    expect(stream.response).toBeNull();
  });

  it("ends quietly when close() is called while a reconnect is still being opened", async () => {
    mock.stream("GET /inboxes/events", (res) => {
      res.write("retry: 5\nid: 1\ndata: {}\n\n");
      res.end();
    });
    // The reconnect's answer comes late; the caller leaves before it does.
    mock.reply("GET /inboxes/events", {
      status: 200,
      raw: ": late\n\n",
      headers: { "content-type": "text/event-stream" },
      delayMs: 300,
    });
    const opened = await client().inboxes.events.stream({}, { reconnectDelayMs: 5 });
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    const seen: string[] = [];
    setTimeout(() => stream.close(), 120);
    for await (const item of stream) seen.push(item.id ?? "");
    expect(seen).toEqual(["1"]);
  });
});

describe("more edges of the parser", () => {
  it("ignores an id that contains a NUL character, keeping the previous one", async () => {
    const events = await parse(["id: 1\ndata: a\n\nid: 2\u00003\ndata: b\n\n"]);
    expect(events.map((e) => e.id)).toEqual(["1", "1"]);
  });

  it("discards an event the stream ended in the middle of, and strips a byte-order mark", async () => {
    expect(await parse(["data: unfinished"])).toEqual([]);
    expect((await parse(["﻿data: x\n\n"])).map((e) => e.data)).toEqual(["x"]);
  });

  it("hands an event with no id an empty one", async () => {
    mock.stream("GET /inboxes/events", (res) => {
      res.write('event: inbox.email.received\ndata: {"type":"inbox.email.received"}\n\n');
      res.end();
    });
    const opened = await client().inboxes.events.stream({}, { reconnect: false });
    const items: InboxStreamItem[] = [];
    for await (const item of opened.data ?? []) items.push(item);
    expect(items.map((i) => i.id)).toEqual([""]);
  });

  it("ends quietly when close() comes during the wait before a reconnect", async () => {
    mock.stream("GET /inboxes/events", (res) => {
      res.write("id: 1\ndata: {}\n\n");
      res.end();
    });
    const opened = await client().inboxes.events.stream({}, { reconnectDelayMs: 150 });
    const stream = opened.data;
    if (!stream) throw new Error("no stream");
    setTimeout(() => stream.close(), 40);
    const seen: string[] = [];
    for await (const item of stream) seen.push(item.id ?? "");
    expect(seen).toEqual(["1"]);
    expect(mock.hitsFor("GET /inboxes/events")).toHaveLength(1);
  });

  it("refuses a 200 without a content type, and one that is not an event stream, naming what it got", async () => {
    mock.reply("GET /inboxes/events", {
      status: 200,
      raw: "",
      headers: { "content-type": "" },
      offContract: true,
    });
    const none = await client().inboxes.events.stream();
    expect(none.error?.message).toBe("Expected an event stream, got no content type");
    mock.reply("GET /inboxes/events", {
      status: 200,
      raw: "<p>",
      headers: { "content-type": "text/html" },
      offContract: true,
    });
    const html = await client().inboxes.events.stream();
    expect(html.error?.message).toBe("Expected an event stream, got text/html");
  });
});

describe("the last bytes of a stream", () => {
  it("dispatches nothing for a final lone CR that closes no event, and skips an empty first chunk before a BOM", async () => {
    expect(await parse(["id: 5\n\r"])).toEqual([]);
    expect((await parse([new Uint8Array(0), "﻿data: x\n\n"])).map((e) => e.data)).toEqual(["x"]);
  });
});
