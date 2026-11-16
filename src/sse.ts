import type { Result, StreamConnection } from "./core.js";
import { applicationError, BillionSendRequestError } from "./errors.js";
import { sleep } from "./retry.js";

/** One server-sent event. */
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
  /** Reconnect attempts in a row before giving up (default 5). */
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
 * A live event stream. Iterate it with `for await`; leaving the loop, or
 * calling {@link EventStream.close}, closes the connection. When the
 * connection drops it reconnects with `Last-Event-ID` (unless `reconnect` is
 * false); after `maxReconnects` failures in a row, or on an error a retry
 * cannot fix, the loop throws a {@link BillionSendRequestError}.
 */
export class EventStream implements AsyncIterable<ServerSentEvent> {
  #connection: StreamConnection | null;
  #connect: Connect;
  #options: EventStreamOptions;
  #lastEventId: string | null;
  #delayMs: number;
  #closed = false;
  #started = false;
  #onAbort = () => this.close();

  constructor(connection: StreamConnection, connect: Connect, options: EventStreamOptions = {}) {
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

  [Symbol.asyncIterator](): AsyncIterator<ServerSentEvent> {
    if (this.#started) throw new TypeError("An EventStream can be iterated only once");
    this.#started = true;
    return this.#events();
  }

  async *#events(): AsyncGenerator<ServerSentEvent, void, undefined> {
    const reconnect = this.#options.reconnect !== false;
    const maxReconnects = this.#options.maxReconnects ?? 5;
    let failures = 0;
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
              failures = 0;
              this.#lastEventId = event.id;
              yield event;
            }
          } catch {
            // The connection dropped; fall through to reconnect.
          }
          connection.close();
          this.#connection = null;
        }
        if (this.#closed || !reconnect) return;

        failures++;
        if (failures > maxReconnects) {
          throw new BillionSendRequestError(
            applicationError(`The event stream disconnected; gave up after ${maxReconnects} reconnects`),
          );
        }
        if (!(await sleep(this.#delayMs, this.#options.signal)) || this.#closed) return;
        const next = await this.#connect(this.#lastEventId);
        if (this.#closed) {
          next.data?.close();
          return;
        }
        if (next.error !== null) {
          const status = next.error.statusCode;
          const retryable = status === null || status === 429 || status >= 500;
          if (!retryable || next.error.name === "missing_api_key") {
            throw new BillionSendRequestError(next.error);
          }
          continue;
        }
        this.#connection = next.data;
      }
    } finally {
      this.close();
    }
  }
}
