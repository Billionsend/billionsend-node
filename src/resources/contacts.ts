import type { RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { type BatchRequestOptions, Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class ContactBatch extends Resource {
  /**
   * `POST /contacts/batch`: up to 1000 contacts, each shaped like {@link Contacts.create}'s payload.
   * The API document leaves the items untyped; the endpoint validates each one as a contact.
   */
  create(
    payload: RequestBody<"/contacts", "post">[],
    params?: QueryParams<"/contacts/batch", "post">,
    options?: BatchRequestOptions,
  ) {
    return this.core.request("post", "/contacts/batch", {
      body: payload,
      query: params,
      headers: { "x-batch-validation": options?.batchValidation },
      options,
    });
  }

  /** `POST /contacts/batch/get` */
  get(payload: RequestBody<"/contacts/batch/get", "post">, options?: RequestOptions) {
    return this.core.request("post", "/contacts/batch/get", { body: payload, options });
  }

  /** `POST /contacts/batch/remove` */
  remove(payload: RequestBody<"/contacts/batch/remove", "post">, options?: RequestOptions) {
    return this.core.request("post", "/contacts/batch/remove", { body: payload, options });
  }
}

export class ContactTopics extends Resource {
  /** `GET /contacts/{id}/topics` */
  list(contactId: string, options?: RequestOptions) {
    return this.core.request("get", "/contacts/{id}/topics", { path: { id: contactId }, options });
  }

  /** `PATCH /contacts/{id}/topics` */
  update(
    contactId: string,
    payload: RequestBody<"/contacts/{id}/topics", "patch">,
    options?: RequestOptions,
  ) {
    return this.core.request("patch", "/contacts/{id}/topics", {
      path: { id: contactId },
      body: payload,
      options,
    });
  }
}

export class ContactSegments extends Resource {
  /** `POST /contacts/{id}/segments/{segmentId}` */
  add(contactId: string, segmentId: string, options?: RequestOptions) {
    return this.core.request("post", "/contacts/{id}/segments/{segmentId}", {
      path: { id: contactId, segmentId },
      options,
    });
  }

  /** `DELETE /contacts/{id}/segments/{segmentId}` */
  remove(contactId: string, segmentId: string, options?: RequestOptions) {
    return this.core.request("delete", "/contacts/{id}/segments/{segmentId}", {
      path: { id: contactId, segmentId },
      options,
    });
  }
}

export class Contacts extends Resource {
  readonly batch: ContactBatch = new ContactBatch(this.core);
  readonly topics: ContactTopics = new ContactTopics(this.core);
  readonly segments: ContactSegments = new ContactSegments(this.core);

  /** `POST /contacts` */
  create(payload: RequestBody<"/contacts", "post">, options?: RequestOptions) {
    return this.core.request("post", "/contacts", { body: payload, options });
  }

  /** `GET /contacts` */
  list(params?: QueryParams<"/contacts", "get">, options?: RequestOptions) {
    return this.core.request("get", "/contacts", { query: params, options });
  }

  /** Every contact, fetched page by page. */
  listAll(
    params?: QueryParams<"/contacts", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/contacts">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /contacts/{id}`: `id` is the contact id or its email address. */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/contacts/{id}", { path: { id }, options });
  }

  /** `PATCH /contacts/{id}` */
  update(id: string, payload: RequestBody<"/contacts/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/contacts/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /contacts/{id}` */
  delete(id: string, params?: QueryParams<"/contacts/{id}", "delete">, options?: RequestOptions) {
    return this.core.request("delete", "/contacts/{id}", { path: { id }, query: params, options });
  }

  /** `POST /contacts/{id}/preferences-link` */
  preferencesLink(id: string, options?: RequestOptions) {
    return this.core.request("post", "/contacts/{id}/preferences-link", { path: { id }, options });
  }
}

export class AudienceContacts extends Resource {
  /** `POST /audiences/{audienceId}/contacts` */
  create(
    audienceId: string,
    payload: RequestBody<"/audiences/{audienceId}/contacts", "post">,
    options?: RequestOptions,
  ) {
    return this.core.request("post", "/audiences/{audienceId}/contacts", {
      path: { audienceId },
      body: payload,
      options,
    });
  }

  /** `GET /audiences/{audienceId}/contacts/{id}` */
  get(audienceId: string, id: string, options?: RequestOptions) {
    return this.core.request("get", "/audiences/{audienceId}/contacts/{id}", {
      path: { audienceId, id },
      options,
    });
  }

  /** `PATCH /audiences/{audienceId}/contacts/{id}` */
  update(
    audienceId: string,
    id: string,
    payload: RequestBody<"/audiences/{audienceId}/contacts/{id}", "patch">,
    options?: RequestOptions,
  ) {
    return this.core.request("patch", "/audiences/{audienceId}/contacts/{id}", {
      path: { audienceId, id },
      body: payload,
      options,
    });
  }

  /** `DELETE /audiences/{audienceId}/contacts/{id}` */
  delete(
    audienceId: string,
    id: string,
    params?: QueryParams<"/audiences/{audienceId}/contacts/{id}", "delete">,
    options?: RequestOptions,
  ) {
    return this.core.request("delete", "/audiences/{audienceId}/contacts/{id}", {
      path: { audienceId, id },
      query: params,
      options,
    });
  }
}

export class Audiences extends Resource {
  readonly contacts: AudienceContacts = new AudienceContacts(this.core);
}

export class ContactProperties extends Resource {
  /** `POST /contact-properties` */
  create(payload: RequestBody<"/contact-properties", "post">, options?: RequestOptions) {
    return this.core.request("post", "/contact-properties", { body: payload, options });
  }

  /** `GET /contact-properties` */
  list(params?: QueryParams<"/contact-properties", "get">, options?: RequestOptions) {
    return this.core.request("get", "/contact-properties", { query: params, options });
  }

  /** Every contact property, fetched page by page. */
  listAll(
    params?: QueryParams<"/contact-properties", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/contact-properties">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /contact-properties/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/contact-properties/{id}", { path: { id }, options });
  }

  /** `PATCH /contact-properties/{id}` */
  update(id: string, payload: RequestBody<"/contact-properties/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/contact-properties/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /contact-properties/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/contact-properties/{id}", { path: { id }, options });
  }
}

export class SegmentContacts extends Resource {
  /** `GET /segments/{id}/contacts` */
  list(segmentId: string, params?: QueryParams<"/segments/{id}/contacts", "get">, options?: RequestOptions) {
    return this.core.request("get", "/segments/{id}/contacts", {
      path: { id: segmentId },
      query: params,
      options,
    });
  }

  /** Every contact the segment resolves to, fetched page by page. */
  listAll(
    segmentId: string,
    params?: QueryParams<"/segments/{id}/contacts", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/segments/{id}/contacts">, void, undefined> {
    return paginate((cursor) => this.list(segmentId, { ...params, ...cursor }, options), params);
  }
}

export class Segments extends Resource {
  readonly contacts: SegmentContacts = new SegmentContacts(this.core);

  /** `POST /segments` */
  create(payload: RequestBody<"/segments", "post">, options?: RequestOptions) {
    return this.core.request("post", "/segments", { body: payload, options });
  }

  /** `GET /segments` */
  list(params?: QueryParams<"/segments", "get">, options?: RequestOptions) {
    return this.core.request("get", "/segments", { query: params, options });
  }

  /** Every segment, fetched page by page. */
  listAll(
    params?: QueryParams<"/segments", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/segments">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /segments/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/segments/{id}", { path: { id }, options });
  }

  /** `PATCH /segments/{id}` */
  update(id: string, payload: RequestBody<"/segments/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/segments/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /segments/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/segments/{id}", { path: { id }, options });
  }
}

export class Topics extends Resource {
  /** `POST /topics` */
  create(payload: RequestBody<"/topics", "post">, options?: RequestOptions) {
    return this.core.request("post", "/topics", { body: payload, options });
  }

  /** `GET /topics` (not paginated) */
  list(options?: RequestOptions) {
    return this.core.request("get", "/topics", { options });
  }

  /** `GET /topics/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/topics/{id}", { path: { id }, options });
  }

  /** `PATCH /topics/{id}` */
  update(id: string, payload: RequestBody<"/topics/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/topics/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /topics/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/topics/{id}", { path: { id }, options });
  }
}
