import type { Result, StreamConnection } from "./core.js";
import { APIConnectionError, APIError, type BillionSendError, RateLimitError } from "./errors.js";
import { MAX_RETRY_AFTER_MS, retryable, sleep } from "./retry.js";
import type { WebhookEventType } from "./webhooks.js";

/** The event names an inbox stream carries: the inbox webhook events (`inbox.*`), and `email.received`. */
export type InboxEventType = Extract<WebhookEventType, `inbox.${string}` | "email.received">;

/**
 * The webhook payload's `data`: metadata only (never a body, code or link).
 * The ids say what to read next with the REST methods; `thread`, `email`,
 * `draft` and the rest ride along as the matching webhook event has them.
 */
export interface InboxEventData {
  /** Who caused it (absent on `email.received`, whose payload is the `email.received` webhook's). */
  source?: "api" | "dashboard" | "system";
  inbox_id?: string;
  thread_id?: string;
  email_id?: string;
  draft_id?: string;
  [field: string]: unknown;
}

/** The JSON body of one inbox event. */
export interface InboxEventPayload {
  type: InboxEventType;
  created_at: string;
  inbox_id: string;
  data: InboxEventData;
}

/** One inbox event. `id` is its stream position: keep the last one to resume with `lastEventId`. */
export interface InboxStreamEvent {
  id: string;
  event: InboxEventType;
  data: InboxEventPayload;
}

/**
 * The stream resumed from a position older than the server keeps (24 hours):
 * events may be missing, so read the REST lists again. It has no `id` and
 * does not move the stream position. One stream object hands it out once
 * per position: a later reconnect from the same position, which the server
 * answers with another gap, does not repeat it.
 */
export interface StreamGapEvent {
  id: null;
  event: "stream.gap";
  data: { reason: string };
}

/** What iterating an inbox {@link EventStream} gives. Narrow it on `event`. */
export type InboxStreamItem = InboxStreamEvent | StreamGapEvent;

/** The event name of a {@link StreamGapEvent}. */
export const STREAM_GAP_EVENT = "stream.gap";

/** One server-sent event, as the parser reads it. */
export interface ServerSentEvent {
  /** The stream position after this event (the last `id` field seen), used to resume. */
  id: string | null;
  /** The event name (`message` when the server sent none). */
  event: string;
  /** `data` parsed as JSON; the raw text when it is not JSON. */
  data: unknown;
  /** The raw `data` text. */
  raw: string;
}

export interface EventStreamOptions {
  /** Aborts the stream. */
  signal?: AbortSignal;
  /** Extra headers for the stream request. */
  headers?: Record<string, string>;
  /** Resume after this event id (sent as the `Last-Event-ID` header). */
  lastEventId?: string;
  /** Reconnect with `Last-Event-ID` when the connection drops (default `true`). */
  reconnect?: boolean;
  /**
   * Reconnects that may fail in a row before giving up (default 5). A reconnect
   * that opens the stream resets the count, so the server's scheduled closes
   * never use it up.
   */
  maxReconnects?: number;
  /** Wait before reconnecting, in milliseconds (default 1000; a server `retry` field overrides it). */
  reconnectDelayMs?: number;
  /** Timeout for each connection attempt until the stream opens (defaults to the client's `timeoutMs`). */
  timeoutMs?: number;
  /** Retries of the first connection on 429, 5xx and network failures (defaults to the client's `maxRetries`). */
  maxRetries?: number;
}

/** Opens one connection, resuming after `lastEventId` when it is set. */
export type Connect = (lastEventId: string | null) => Promise<Result<StreamConnection>>;

interface ParserHooks {
  onRetry(ms: number): void;
}

const LINE_BREAK = /\r\n|\r|\n/;

/** Parses a `text/event-stream` body (UTF-8) into events, following the WHATWG rules. */
export async function* parseEventStream(
  body: ReadableStream<Uint8Array>,
  hooks: ParserHooks = { onRetry() {} },
  initialId: string | null = null,
): AsyncGenerator<ServerSentEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let first = true;
  let lastId = initialId;
  let eventName = "";
  let dataLines: string[] = [];
  let hasData = false;

  function* takeLines(final: boolean): Generator<string> {
    while (true) {
      const match = LINE_BREAK.exec(buffer);
      if (!match) return;
      // A lone "\r" at the end of the buffer may be the first half of "\r\n".
      if (!final && match[0] === "\r" && match.index === buffer.length - 1) return;
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      yield line;
    }
  }

  function processLine(line: string): ServerSentEvent | undefined {
    if (line === "") {
      if (!hasData) {
        eventName = "";
        return undefined;
      }
      const raw = dataLines.join("\n");
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
      const event: ServerSentEvent = { id: lastId, event: eventName || "message", data, raw };
      eventName = "";
      dataLines = [];
      hasData = false;
      return event;
    }
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        eventName = value;
        break;
      case "data":
        dataLines.push(value);
        hasData = true;
        break;
      case "id":
        if (!value.includes("\u0000")) lastId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) hooks.onRetry(Number(value));
        break;
      default:
        break;
    }
    return undefined;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        for (const line of takeLines(true)) {
          const event = processLine(line);
          if (event) yield event;
        }
        // An event not ended by a blank line is discarded, as the spec says.
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      if (first && buffer.length > 0) {
        if (buffer.charCodeAt(0) === 0xfeff) buffer = buffer.slice(1);
        first = false;
      }
      for (const line of takeLines(false)) {
        const event = processLine(line);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * A live inbox event stream. Iterate it with `for await`; leaving the loop,
 * or calling {@link EventStream.close}, closes the connection. When the
 * connection drops (the server also closes every stream about every ten
 * minutes) it reconnects with `Last-Event-ID` and the events in between are
 * replayed first, unless `reconnect` is false. A reconnect the API refuses
 * with a `Retry-After` (a 429, a 5xx) waits that long, and one longer than 60
 * seconds throws that error at once. After `maxReconnects` reconnects that
 * fail in a row it throws the last one's error: the API's answer as its own
 * class ({@link RateLimitError}, {@link APIError}, …), or an
 * {@link APIConnectionError} when the API could not be reached. An error a
 * retry cannot fix (a revoked key, say) is thrown at once as its own class.
 */
export class EventStream implements AsyncIterable<InboxStreamItem> {
  #connection: StreamConnection | null;
  #connect: Connect;
  #options: EventStreamOptions;
  #lastEventId: string | null;
  #delayMs: number;
  #closed = false;
  #started = false;
  #onAbort = () => this.close();
  #endsOn: ReadonlySet<string>;

  /**
   * @param endsOn event names after which the stream is over: one inbox's
   *   stream ends with that inbox's `inbox.deleted` or `inbox.expired` (the
   *   server closes it, and a reconnect would answer 404).
   */
  constructor(
    connection: StreamConnection,
    connect: Connect,
    options: EventStreamOptions = {},
    endsOn: readonly string[] = [],
  ) {
    this.#endsOn = new Set(endsOn);
    this.#connection = connection;
    this.#connect = connect;
    this.#options = options;
    this.#lastEventId = options.lastEventId ?? null;
    this.#delayMs = options.reconnectDelayMs ?? 1000;
    options.signal?.addEventListener("abort", this.#onAbort, { once: true });
  }

  /** The id of the last event received: pass it as `lastEventId` to resume later. */
  get lastEventId(): string | null {
    return this.#lastEventId;
  }

  /** The response of the current connection. */
  get response(): Response | null {
    return this.#connection?.response ?? null;
  }

  /** Closes the connection; a running loop ends without an error. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#options.signal?.removeEventListener("abort", this.#onAbort);
    this.#connection?.close();
    this.#connection = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<InboxStreamItem> {
    if (this.#started) throw new TypeError("An EventStream can be iterated only once");
    this.#started = true;
    return this.#events();
  }

  async *#events(): AsyncGenerator<InboxStreamItem, void, undefined> {
    const reconnect = this.#options.reconnect !== false;
    const maxReconnects = this.#options.maxReconnects ?? 5;
    let failures = 0;
    // The last reconnect's failure, null when the stream itself dropped.
    let lastError: BillionSendError | null = null;
    // The position a gap was last handed out for; the server repeats the gap
    // on every reconnect from that position until a newer event moves it.
    let gapAt: string | null | undefined;
    try {
      while (!this.#closed) {
        const connection = this.#connection;
        if (connection !== null && connection.response.body !== null) {
          try {
            const events = parseEventStream(
              connection.response.body,
              { onRetry: (ms) => (this.#delayMs = ms) },
              this.#lastEventId,
            );
            for await (const event of events) {
              if (event.event === STREAM_GAP_EVENT) {
                if (gapAt === this.#lastEventId) continue;
                gapAt = this.#lastEventId;
                yield { id: null, event: STREAM_GAP_EVENT, data: event.data as StreamGapEvent["data"] };
                continue;
              }
              this.#lastEventId = event.id;
              yield {
                id: event.id ?? "",
                event: event.event as InboxEventType,
                data: event.data as InboxEventPayload,
              };
              if (this.#endsOn.has(event.event)) return;
            }
          } catch {
            // The connection dropped; fall through to reconnect.
          }
          connection.close();
          this.#connection = null;
          lastError = null;
        }
        if (this.#closed || !reconnect) return;

        failures++;
        if (failures > maxReconnects) {
          // The API's own answer says more than "gave up".
          if (lastError !== null && lastError.statusCode !== null) throw lastError;
          throw new APIConnectionError(
            `The event stream disconnected; gave up after ${maxReconnects} reconnects`,
          );
        }
        const hinted = retryAfterMs(lastError);
        if (!(await sleep(hinted ?? this.#delayMs, this.#options.signal)) || this.#closed) return;
        const next = await this.#connect(this.#lastEventId);
        if (this.#closed) {
          next.data?.close();
          return;
        }
        if (next.error !== null) {
          if (!retryable(next.error, false)) throw next.error;
          const wait = retryAfterMs(next.error);
          if (wait !== null && wait > MAX_RETRY_AFTER_MS) throw next.error;
          lastError = next.error;
          continue;
        }
        // Open again: only reconnects that fail in a row count, not the server
        // closing a quiet stream every ten minutes or so.
        this.#connection = next.data;
        failures = 0;
        lastError = null;
      }
    } finally {
      this.close();
    }
  }
}

/** The `Retry-After` an API answer carried, in milliseconds; `null` without one. */
function retryAfterMs(error: BillionSendError | null): number | null {
  const seconds = error instanceof RateLimitError || error instanceof APIError ? error.retryAfter : null;
  return seconds === null ? null : seconds * 1000;
}
