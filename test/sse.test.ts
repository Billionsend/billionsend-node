import { describe, expect, it } from "vitest";
import { BillionSendRequestError, type ServerSentEvent } from "../src/index.js";
import { parseEventStream } from "../src/sse.js";
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
    await expect(run()).rejects.toThrow("gave up after 1 reconnects");
    expect(data).toEqual([{ n: 41 }, { n: 42 }]);
    const hits = mock.hitsFor("GET /inboxes/{inbox_id}/events");
    expect(hits.map((hit) => hit.headers["last-event-id"])).toEqual(["40", "41", "42"]);
    expect(hits.every((hit) => hit.url.searchParams.get("types") === "inbox.email.received")).toBe(true);
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
    expect(error).toBeInstanceOf(BillionSendRequestError);
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
    mock.reply("GET /inboxes/events", { status: 200, body: { hello: "world" } });
    const opened = await client().inboxes.events.stream();
    expect(opened.error).toMatchObject({ statusCode: 200, name: "application_error" });
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
