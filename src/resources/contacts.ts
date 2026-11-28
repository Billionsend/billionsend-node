import type { RequestOptions } from "../core.js";
import type { CreateContactImportForm } from "../generated/openapi.js";
import { paginate } from "../pagination.js";
import { type BatchRequestOptions, Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class ContactBatch extends Resource {
  /** `POST /contacts/batch`: up to 1000 contacts, each shaped like {@link Contacts.create}'s payload. */
  create(
    payload: RequestBody<"/contacts/batch", "post">,
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
  list(contactId: string, params?: QueryParams<"/contacts/{id}/topics", "get">, options?: RequestOptions) {
    return this.core.request("get", "/contacts/{id}/topics", {
      path: { id: contactId },
      query: params,
      options,
    });
  }

  /** Every topic setting of a contact, fetched page by page. */
  listAll(
    contactId: string,
    params?: QueryParams<"/contacts/{id}/topics", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/contacts/{id}/topics">, void, undefined> {
    return paginate((cursor) => this.list(contactId, { ...params, ...cursor }, options), params);
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

/**
 * What {@link ContactImports.create} uploads: the CSV and the import's settings.
 * The endpoint takes `multipart/form-data` whose `column_map`, `segments` and
 * `topics` parts are JSON text; here they are the objects themselves (or text
 * you already encoded).
 */
export interface CreateContactImportParams {
  /** The CSV: a header row, then one contact per row, at most 20 MiB. A string is the CSV text. */
  file: Blob | string;
  /** The file name sent with the upload (default `contacts.csv`; a `File` keeps its own name). */
  filename?: string;
  /** CSV column to contact field, such as `{ email: "Email", first_name: "First Name" }`. */
  column_map?: Record<string, unknown> | string;
  on_conflict?: CreateContactImportForm["on_conflict"];
  /** Segments every imported contact joins, such as `[{ id: segmentId }]`. */
  segments?: readonly Record<string, unknown>[] | string;
  /** Topic subscriptions set for every imported contact, such as `[{ id: topicId, subscription: "opt_in" }]`. */
  topics?: readonly Record<string, unknown>[] | string;
}

export class ContactImports extends Resource {
  /** `POST /contacts/imports`: uploads a CSV and imports it in the background; poll {@link ContactImports.get}. */
  create(params: CreateContactImportParams, options?: RequestOptions) {
    const form = new FormData();
    const { file, filename, column_map, on_conflict, segments, topics } = params;
    const named =
      typeof file !== "string" && "name" in file && typeof file.name === "string" && file.name !== "";
    form.append(
      "file",
      typeof file === "string" ? new Blob([file], { type: "text/csv" }) : file,
      filename ?? (named ? (file as File).name : "contacts.csv"),
    );
    const json = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));
    if (column_map !== undefined) form.append("column_map", json(column_map));
    if (on_conflict !== undefined) form.append("on_conflict", on_conflict);
    if (segments !== undefined) form.append("segments", json(segments));
    if (topics !== undefined) form.append("topics", json(topics));
    return this.core.request("post", "/contacts/imports", { form, options });
  }

  /** `GET /contacts/imports` */
  list(params?: QueryParams<"/contacts/imports", "get">, options?: RequestOptions) {
    return this.core.request("get", "/contacts/imports", { query: params, options });
  }

  /** Every contact import, fetched page by page. */
  listAll(
    params?: QueryParams<"/contacts/imports", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/contacts/imports">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /contacts/imports/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/contacts/imports/{id}", { path: { id }, options });
  }
}

export class ContactSegments extends Resource {
  /** `GET /contacts/{id}/segments` */
  list(contactId: string, params?: QueryParams<"/contacts/{id}/segments", "get">, options?: RequestOptions) {
    return this.core.request("get", "/contacts/{id}/segments", {
      path: { id: contactId },
      query: params,
      options,
    });
  }

  /** Every segment a contact belongs to, fetched page by page. */
  listAll(
    contactId: string,
    params?: QueryParams<"/contacts/{id}/segments", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/contacts/{id}/segments">, void, undefined> {
    return paginate((cursor) => this.list(contactId, { ...params, ...cursor }, options), params);
  }

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
  readonly imports: ContactImports = new ContactImports(this.core);
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

  /** `GET /topics` */
  list(params?: QueryParams<"/topics", "get">, options?: RequestOptions) {
    return this.core.request("get", "/topics", { query: params, options });
  }

  /** Every topic, fetched page by page. */
  listAll(
    params?: QueryParams<"/topics", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/topics">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
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
