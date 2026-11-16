import type { IdempotentRequestOptions, RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { type BatchSendOptions, idempotent, Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export type SendEmailParams = RequestBody<"/emails", "post">;

export class ReceivedEmailAttachments extends Resource {
  /** `GET /emails/receiving/{email_id}/attachments` */
  list(
    emailId: string,
    params?: QueryParams<"/emails/receiving/{email_id}/attachments", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/emails/receiving/{email_id}/attachments", {
      path: { email_id: emailId },
      query: params,
      options,
    });
  }

  /** Every attachment of a received email, fetched page by page. */
  listAll(
    emailId: string,
    params?: QueryParams<"/emails/receiving/{email_id}/attachments", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/emails/receiving/{email_id}/attachments">, void, undefined> {
    return paginate((cursor) => this.list(emailId, { ...params, ...cursor }, options), params);
  }

  /** `GET /emails/receiving/{email_id}/attachments/{id}` */
  get(emailId: string, id: string, options?: RequestOptions) {
    return this.core.request("get", "/emails/receiving/{email_id}/attachments/{id}", {
      path: { email_id: emailId, id },
      options,
    });
  }

  /** `GET /emails/receiving/{email_id}/attachments/{id}/text` */
  text(emailId: string, id: string, options?: RequestOptions) {
    return this.core.request("get", "/emails/receiving/{email_id}/attachments/{id}/text", {
      path: { email_id: emailId, id },
      options,
    });
  }
}

export class ReceivedEmails extends Resource {
  readonly attachments: ReceivedEmailAttachments = new ReceivedEmailAttachments(this.core);

  /** `GET /emails/receiving` */
  list(params?: QueryParams<"/emails/receiving", "get">, options?: RequestOptions) {
    return this.core.request("get", "/emails/receiving", { query: params, options });
  }

  /** Every received email matching `params`, fetched page by page. */
  listAll(
    params?: QueryParams<"/emails/receiving", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/emails/receiving">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /emails/receiving/{id}` */
  get(id: string, params?: QueryParams<"/emails/receiving/{id}", "get">, options?: RequestOptions) {
    return this.core.request("get", "/emails/receiving/{id}", { path: { id }, query: params, options });
  }

  /** `DELETE /emails/receiving/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/emails/receiving/{id}", { path: { id }, options });
  }

  /** `POST /emails/receiving/{id}/reply` */
  reply(
    id: string,
    payload: RequestBody<"/emails/receiving/{id}/reply", "post">,
    options?: IdempotentRequestOptions,
  ) {
    return this.core.request("post", "/emails/receiving/{id}/reply", {
      path: { id },
      body: payload,
      ...idempotent(options),
    });
  }

  /** `POST /emails/receiving/{id}/forward` */
  forward(
    id: string,
    payload: RequestBody<"/emails/receiving/{id}/forward", "post">,
    options?: IdempotentRequestOptions,
  ) {
    return this.core.request("post", "/emails/receiving/{id}/forward", {
      path: { id },
      body: payload,
      ...idempotent(options),
    });
  }
}

export class Emails extends Resource {
  readonly receiving: ReceivedEmails = new ReceivedEmails(this.core);

  /** `POST /emails` */
  send(payload: SendEmailParams, options?: IdempotentRequestOptions) {
    return this.core.request("post", "/emails", { body: payload, ...idempotent(options) });
  }

  /**
   * `POST /emails/batch`: up to 100 emails, each shaped like {@link Emails.send}'s payload.
   * The API document leaves the items untyped; the endpoint validates each one as a send.
   */
  batch(payload: SendEmailParams[], options?: BatchSendOptions) {
    return this.core.request("post", "/emails/batch", {
      body: payload,
      headers: { "x-batch-validation": options?.batchValidation },
      ...idempotent(options),
    });
  }

  /** `GET /emails` */
  list(params?: QueryParams<"/emails", "get">, options?: RequestOptions) {
    return this.core.request("get", "/emails", { query: params, options });
  }

  /** Every sent email, fetched page by page. */
  listAll(
    params?: QueryParams<"/emails", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/emails">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /emails/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/emails/{id}", { path: { id }, options });
  }

  /** `PATCH /emails/{id}` */
  update(id: string, payload: RequestBody<"/emails/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/emails/{id}", { path: { id }, body: payload, options });
  }

  /** `POST /emails/{id}/cancel` */
  cancel(id: string, options?: RequestOptions) {
    return this.core.request("post", "/emails/{id}/cancel", { path: { id }, options });
  }

  /** `DELETE /emails/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/emails/{id}", { path: { id }, options });
  }

  /** `GET /emails/{id}/insights` */
  insights(id: string, options?: RequestOptions) {
    return this.core.request("get", "/emails/{id}/insights", { path: { id }, options });
  }

  /** `GET /emails/metrics` */
  metrics(params?: QueryParams<"/emails/metrics", "get">, options?: RequestOptions) {
    return this.core.request("get", "/emails/metrics", { query: params, options });
  }
}
