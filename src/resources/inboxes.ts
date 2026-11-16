import type { IdempotentRequestOptions, RequestOptions, Result, StreamConnection } from "../core.js";
import { paginate } from "../pagination.js";
import { idempotent, Resource } from "../resource.js";
import { type Connect, EventStream, type EventStreamOptions } from "../sse.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

type ThreadEmailPath = "/inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}";

export class InboxAgentSettings extends Resource {
  /** `GET /inboxes/{inbox_id}/agent` */
  get(inboxId: string, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}/agent", { path: { inbox_id: inboxId }, options });
  }
}

export class InboxSafety extends Resource {
  /** `GET /inboxes/{inbox_id}/safety` */
  get(inboxId: string, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}/safety", { path: { inbox_id: inboxId }, options });
  }

  /** `PATCH /inboxes/{inbox_id}/safety` */
  update(
    inboxId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/safety", "patch">,
    options?: RequestOptions,
  ) {
    return this.core.request("patch", "/inboxes/{inbox_id}/safety", {
      path: { inbox_id: inboxId },
      body: payload,
      options,
    });
  }
}

export class InboxLabels extends Resource {
  /** `GET /inboxes/{inbox_id}/labels` */
  list(inboxId: string, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}/labels", { path: { inbox_id: inboxId }, options });
  }

  /** `POST /inboxes/{inbox_id}/labels` */
  create(
    inboxId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/labels", "post">,
    options?: RequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/labels", {
      path: { inbox_id: inboxId },
      body: payload,
      options,
    });
  }

  /** `PATCH /inboxes/{inbox_id}/labels/{label_id}` */
  update(
    inboxId: string,
    labelId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/labels/{label_id}", "patch">,
    options?: RequestOptions,
  ) {
    return this.core.request("patch", "/inboxes/{inbox_id}/labels/{label_id}", {
      path: { inbox_id: inboxId, label_id: labelId },
      body: payload,
      options,
    });
  }

  /** `DELETE /inboxes/{inbox_id}/labels/{label_id}` */
  delete(inboxId: string, labelId: string, options?: RequestOptions) {
    return this.core.request("delete", "/inboxes/{inbox_id}/labels/{label_id}", {
      path: { inbox_id: inboxId, label_id: labelId },
      options,
    });
  }
}

export class ThreadLabels extends Resource {
  /** `POST /inboxes/{inbox_id}/threads/{thread_id}/labels`: adds labels. */
  add(
    inboxId: string,
    threadId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/threads/{thread_id}/labels", "post">,
    options?: RequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/threads/{thread_id}/labels", {
      path: { inbox_id: inboxId, thread_id: threadId },
      body: payload,
      options,
    });
  }

  /** `PUT /inboxes/{inbox_id}/threads/{thread_id}/labels`: replaces the labels. */
  set(
    inboxId: string,
    threadId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/threads/{thread_id}/labels", "put">,
    options?: RequestOptions,
  ) {
    return this.core.request("put", "/inboxes/{inbox_id}/threads/{thread_id}/labels", {
      path: { inbox_id: inboxId, thread_id: threadId },
      body: payload,
      options,
    });
  }

  /** `DELETE /inboxes/{inbox_id}/threads/{thread_id}/labels/{label_id}` */
  remove(inboxId: string, threadId: string, labelId: string, options?: RequestOptions) {
    return this.core.request("delete", "/inboxes/{inbox_id}/threads/{thread_id}/labels/{label_id}", {
      path: { inbox_id: inboxId, thread_id: threadId, label_id: labelId },
      options,
    });
  }
}

export class ThreadEmails extends Resource {
  /** `GET /inboxes/{inbox_id}/threads/{thread_id}/emails` */
  list(
    inboxId: string,
    threadId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/threads/{thread_id}/emails", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/inboxes/{inbox_id}/threads/{thread_id}/emails", {
      path: { inbox_id: inboxId, thread_id: threadId },
      query: params,
      options,
    });
  }

  /** Every email of a thread, fetched page by page. */
  listAll(
    inboxId: string,
    threadId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/threads/{thread_id}/emails", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/inboxes/{inbox_id}/threads/{thread_id}/emails">, void, undefined> {
    return paginate((cursor) => this.list(inboxId, threadId, { ...params, ...cursor }, options), params);
  }

  /** `GET /inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}` */
  get(
    inboxId: string,
    threadId: string,
    emailId: string,
    params?: QueryParams<ThreadEmailPath, "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}", {
      path: { inbox_id: inboxId, thread_id: threadId, email_id: emailId },
      query: params,
      options,
    });
  }

  /** `POST .../emails/{email_id}/reply`: answers the sent email, or (202) the draft the inbox's rules held. */
  reply(
    inboxId: string,
    threadId: string,
    emailId: string,
    payload: RequestBody<`${ThreadEmailPath}/reply`, "post">,
    options?: IdempotentRequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/reply", {
      path: { inbox_id: inboxId, thread_id: threadId, email_id: emailId },
      body: payload,
      ...idempotent(options),
    });
  }

  /** `POST .../emails/{email_id}/forward`: answers the sent email, or (202) the draft the inbox's rules held. */
  forward(
    inboxId: string,
    threadId: string,
    emailId: string,
    payload: RequestBody<`${ThreadEmailPath}/forward`, "post">,
    options?: IdempotentRequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/threads/{thread_id}/emails/{email_id}/forward", {
      path: { inbox_id: inboxId, thread_id: threadId, email_id: emailId },
      body: payload,
      ...idempotent(options),
    });
  }
}

export class InboxThreads extends Resource {
  readonly labels: ThreadLabels = new ThreadLabels(this.core);
  readonly emails: ThreadEmails = new ThreadEmails(this.core);

  /** `GET /inboxes/{inbox_id}/threads` */
  list(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/threads", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/inboxes/{inbox_id}/threads", {
      path: { inbox_id: inboxId },
      query: params,
      options,
    });
  }

  /** Every thread matching `params`, fetched page by page. */
  listAll(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/threads", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/inboxes/{inbox_id}/threads">, void, undefined> {
    return paginate((cursor) => this.list(inboxId, { ...params, ...cursor }, options), params);
  }

  /** `GET /inboxes/{inbox_id}/threads/search` */
  search(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/threads/search", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/inboxes/{inbox_id}/threads/search", {
      path: { inbox_id: inboxId },
      query: params,
      options,
    });
  }

  /** Every thread a search finds, fetched page by page. */
  searchAll(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/threads/search", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/inboxes/{inbox_id}/threads/search">, void, undefined> {
    return paginate((cursor) => this.search(inboxId, { ...params, ...cursor }, options), params);
  }

  /** `GET /inboxes/{inbox_id}/threads/{thread_id}` */
  get(inboxId: string, threadId: string, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}/threads/{thread_id}", {
      path: { inbox_id: inboxId, thread_id: threadId },
      options,
    });
  }

  /** `PATCH /inboxes/{inbox_id}/threads/{thread_id}` */
  update(
    inboxId: string,
    threadId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/threads/{thread_id}", "patch">,
    options?: RequestOptions,
  ) {
    return this.core.request("patch", "/inboxes/{inbox_id}/threads/{thread_id}", {
      path: { inbox_id: inboxId, thread_id: threadId },
      body: payload,
      options,
    });
  }

  /** `DELETE /inboxes/{inbox_id}/threads/{thread_id}` */
  delete(inboxId: string, threadId: string, options?: RequestOptions) {
    return this.core.request("delete", "/inboxes/{inbox_id}/threads/{thread_id}", {
      path: { inbox_id: inboxId, thread_id: threadId },
      options,
    });
  }
}

export class InboxQuarantine extends Resource {
  /** `GET /inboxes/{inbox_id}/quarantine` */
  list(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/quarantine", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/inboxes/{inbox_id}/quarantine", {
      path: { inbox_id: inboxId },
      query: params,
      options,
    });
  }

  /** Every held email of an inbox, fetched page by page. */
  listAll(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/quarantine", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/inboxes/{inbox_id}/quarantine">, void, undefined> {
    return paginate((cursor) => this.list(inboxId, { ...params, ...cursor }, options), params);
  }

  /** `POST /inboxes/{inbox_id}/quarantine/{email_id}/release` (the body is optional) */
  release(
    inboxId: string,
    emailId: string,
    payload?: RequestBody<"/inboxes/{inbox_id}/quarantine/{email_id}/release", "post">,
    options?: RequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/quarantine/{email_id}/release", {
      path: { inbox_id: inboxId, email_id: emailId },
      body: payload,
      options,
    });
  }
}

export class InboxCodes extends Resource {
  /** `GET /inboxes/{inbox_id}/codes/latest`: the newest verification code, optionally waiting for one. */
  latest(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/codes/latest", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/inboxes/{inbox_id}/codes/latest", {
      path: { inbox_id: inboxId },
      query: params,
      options,
    });
  }
}

export class InboxDrafts extends Resource {
  /** `POST /inboxes/{inbox_id}/drafts` */
  create(
    inboxId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/drafts", "post">,
    options?: RequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/drafts", {
      path: { inbox_id: inboxId },
      body: payload,
      options,
    });
  }

  /** `GET /inboxes/{inbox_id}/drafts` */
  list(inboxId: string, params?: QueryParams<"/inboxes/{inbox_id}/drafts", "get">, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}/drafts", {
      path: { inbox_id: inboxId },
      query: params,
      options,
    });
  }

  /** Every draft of an inbox, fetched page by page. */
  listAll(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/drafts", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/inboxes/{inbox_id}/drafts">, void, undefined> {
    return paginate((cursor) => this.list(inboxId, { ...params, ...cursor }, options), params);
  }

  /** `GET /inboxes/{inbox_id}/drafts/{draft_id}` */
  get(inboxId: string, draftId: string, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}/drafts/{draft_id}", {
      path: { inbox_id: inboxId, draft_id: draftId },
      options,
    });
  }

  /** `PATCH /inboxes/{inbox_id}/drafts/{draft_id}` */
  update(
    inboxId: string,
    draftId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/drafts/{draft_id}", "patch">,
    options?: RequestOptions,
  ) {
    return this.core.request("patch", "/inboxes/{inbox_id}/drafts/{draft_id}", {
      path: { inbox_id: inboxId, draft_id: draftId },
      body: payload,
      options,
    });
  }

  /** `DELETE /inboxes/{inbox_id}/drafts/{draft_id}` */
  delete(inboxId: string, draftId: string, options?: RequestOptions) {
    return this.core.request("delete", "/inboxes/{inbox_id}/drafts/{draft_id}", {
      path: { inbox_id: inboxId, draft_id: draftId },
      options,
    });
  }

  /** `POST /inboxes/{inbox_id}/drafts/{draft_id}/send` */
  send(inboxId: string, draftId: string, options?: IdempotentRequestOptions) {
    return this.core.request("post", "/inboxes/{inbox_id}/drafts/{draft_id}/send", {
      path: { inbox_id: inboxId, draft_id: draftId },
      ...idempotent(options),
    });
  }

  /** `POST /inboxes/{inbox_id}/drafts/{draft_id}/reject` */
  reject(inboxId: string, draftId: string, options?: RequestOptions) {
    return this.core.request("post", "/inboxes/{inbox_id}/drafts/{draft_id}/reject", {
      path: { inbox_id: inboxId, draft_id: draftId },
      options,
    });
  }
}

function lastEventIdHeader(id: string | null | undefined): Record<string, string | undefined> {
  return { "last-event-id": id ?? undefined };
}

function connectOptions(options: EventStreamOptions, retries: number | undefined): RequestOptions {
  return {
    signal: options.signal,
    headers: options.headers,
    timeoutMs: options.timeoutMs,
    maxRetries: retries,
  };
}

function wrap(
  first: Result<StreamConnection>,
  connect: Connect,
  options: EventStreamOptions,
): Result<EventStream> {
  if (first.error !== null) return first;
  return { data: new EventStream(first.data, connect, options), error: null, headers: first.headers };
}

export class InboxEvents extends Resource {
  /**
   * `GET /inboxes/events`: every inbox event of the team as a live stream.
   * Resolves once the stream is open (or with the error that refused it).
   */
  async stream(
    params?: QueryParams<"/inboxes/events", "get">,
    options: EventStreamOptions = {},
  ): Promise<Result<EventStream>> {
    const connect: Connect = (lastEventId) =>
      this.core.openStream("get", "/inboxes/events", {
        query: params,
        headers: lastEventIdHeader(lastEventId),
        options: connectOptions(options, 0),
      });
    const first = await this.core.openStream("get", "/inboxes/events", {
      query: params,
      headers: lastEventIdHeader(options.lastEventId),
      options: connectOptions(options, options.maxRetries),
    });
    return wrap(first, connect, options);
  }

  /** `GET /inboxes/{inbox_id}/events`: one inbox's events as a live stream. */
  async streamInbox(
    inboxId: string,
    params?: QueryParams<"/inboxes/{inbox_id}/events", "get">,
    options: EventStreamOptions = {},
  ): Promise<Result<EventStream>> {
    const connect: Connect = (lastEventId) =>
      this.core.openStream("get", "/inboxes/{inbox_id}/events", {
        path: { inbox_id: inboxId },
        query: params,
        headers: lastEventIdHeader(lastEventId),
        options: connectOptions(options, 0),
      });
    const first = await this.core.openStream("get", "/inboxes/{inbox_id}/events", {
      path: { inbox_id: inboxId },
      query: params,
      headers: lastEventIdHeader(options.lastEventId),
      options: connectOptions(options, options.maxRetries),
    });
    return wrap(first, connect, options);
  }
}

export class Inboxes extends Resource {
  readonly agent: InboxAgentSettings = new InboxAgentSettings(this.core);
  readonly safety: InboxSafety = new InboxSafety(this.core);
  readonly labels: InboxLabels = new InboxLabels(this.core);
  readonly threads: InboxThreads = new InboxThreads(this.core);
  readonly quarantine: InboxQuarantine = new InboxQuarantine(this.core);
  readonly codes: InboxCodes = new InboxCodes(this.core);
  readonly drafts: InboxDrafts = new InboxDrafts(this.core);
  readonly events: InboxEvents = new InboxEvents(this.core);

  /** `POST /inboxes` */
  create(payload: RequestBody<"/inboxes", "post">, options?: RequestOptions) {
    return this.core.request("post", "/inboxes", { body: payload, options });
  }

  /** `GET /inboxes` */
  list(params?: QueryParams<"/inboxes", "get">, options?: RequestOptions) {
    return this.core.request("get", "/inboxes", { query: params, options });
  }

  /** Every inbox, fetched page by page. */
  listAll(
    params?: QueryParams<"/inboxes", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/inboxes">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /inboxes/{inbox_id}`: `inboxId` is the inbox id or its email address. */
  get(inboxId: string, options?: RequestOptions) {
    return this.core.request("get", "/inboxes/{inbox_id}", { path: { inbox_id: inboxId }, options });
  }

  /** `PATCH /inboxes/{inbox_id}` */
  update(inboxId: string, payload: RequestBody<"/inboxes/{inbox_id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/inboxes/{inbox_id}", {
      path: { inbox_id: inboxId },
      body: payload,
      options,
    });
  }

  /** `DELETE /inboxes/{inbox_id}` */
  delete(inboxId: string, options?: RequestOptions) {
    return this.core.request("delete", "/inboxes/{inbox_id}", { path: { inbox_id: inboxId }, options });
  }

  /** `POST /inboxes/{inbox_id}/emails`: starts a conversation; answers the sent email or (202) a held draft. */
  send(
    inboxId: string,
    payload: RequestBody<"/inboxes/{inbox_id}/emails", "post">,
    options?: IdempotentRequestOptions,
  ) {
    return this.core.request("post", "/inboxes/{inbox_id}/emails", {
      path: { inbox_id: inboxId },
      body: payload,
      ...idempotent(options),
    });
  }
}
