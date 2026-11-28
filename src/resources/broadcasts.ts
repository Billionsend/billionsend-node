import type { RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class Broadcasts extends Resource {
  /** `POST /broadcasts` */
  create(payload: RequestBody<"/broadcasts", "post">, options?: RequestOptions) {
    return this.core.request("post", "/broadcasts", { body: payload, options });
  }

  /** `GET /broadcasts` */
  list(params?: QueryParams<"/broadcasts", "get">, options?: RequestOptions) {
    return this.core.request("get", "/broadcasts", { query: params, options });
  }

  /** Every broadcast, fetched page by page. */
  listAll(
    params?: QueryParams<"/broadcasts", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/broadcasts">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /broadcasts/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/broadcasts/{id}", { path: { id }, options });
  }

  /** `PATCH /broadcasts/{id}` */
  update(id: string, payload: RequestBody<"/broadcasts/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/broadcasts/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /broadcasts/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/broadcasts/{id}", { path: { id }, options });
  }

  /** `GET /broadcasts/{id}/recipients`: the recipients with the given outcome (`type` is required). */
  recipients(
    id: string,
    params: QueryParams<"/broadcasts/{id}/recipients", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/broadcasts/{id}/recipients", {
      path: { id },
      query: params,
      options,
    });
  }

  /** Every recipient of a broadcast, fetched page by page. */
  recipientsAll(
    id: string,
    params: QueryParams<"/broadcasts/{id}/recipients", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/broadcasts/{id}/recipients">, void, undefined> {
    return paginate((cursor) => this.recipients(id, { ...params, ...cursor }, options), params);
  }

  /** `GET /broadcasts/{id}/clicked-links` */
  clickedLinks(
    id: string,
    params?: QueryParams<"/broadcasts/{id}/clicked-links", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/broadcasts/{id}/clicked-links", {
      path: { id },
      query: params,
      options,
    });
  }

  /** Every link clicked in a broadcast, fetched page by page. */
  clickedLinksAll(
    id: string,
    params?: QueryParams<"/broadcasts/{id}/clicked-links", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/broadcasts/{id}/clicked-links">, void, undefined> {
    return paginate((cursor) => this.clickedLinks(id, { ...params, ...cursor }, options), params);
  }

  /** `POST /broadcasts/{id}/send` */
  send(id: string, payload: RequestBody<"/broadcasts/{id}/send", "post">, options?: RequestOptions) {
    return this.core.request("post", "/broadcasts/{id}/send", { path: { id }, body: payload, options });
  }

  /** `POST /broadcasts/{id}/duplicate` */
  duplicate(id: string, options?: RequestOptions) {
    return this.core.request("post", "/broadcasts/{id}/duplicate", { path: { id }, options });
  }

  /** `POST /broadcasts/{id}/cancel` */
  cancel(id: string, options?: RequestOptions) {
    return this.core.request("post", "/broadcasts/{id}/cancel", { path: { id }, options });
  }
}

export class BroadcastGroups extends Resource {
  /** `POST /broadcast-groups`: one broadcast per sending domain, sent as one group. */
  create(payload: RequestBody<"/broadcast-groups", "post">, options?: RequestOptions) {
    return this.core.request("post", "/broadcast-groups", { body: payload, options });
  }

  /** `GET /broadcast-groups` */
  list(params?: QueryParams<"/broadcast-groups", "get">, options?: RequestOptions) {
    return this.core.request("get", "/broadcast-groups", { query: params, options });
  }

  /** Every broadcast group, fetched page by page. */
  listAll(
    params?: QueryParams<"/broadcast-groups", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/broadcast-groups">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /broadcast-groups/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/broadcast-groups/{id}", { path: { id }, options });
  }

  /** `PATCH /broadcast-groups/{id}` */
  update(id: string, payload: RequestBody<"/broadcast-groups/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/broadcast-groups/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /broadcast-groups/{id}` */
  remove(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/broadcast-groups/{id}", { path: { id }, options });
  }

  /** `POST /broadcast-groups/{id}/send` (the body is optional) */
  send(id: string, payload?: RequestBody<"/broadcast-groups/{id}/send", "post">, options?: RequestOptions) {
    return this.core.request("post", "/broadcast-groups/{id}/send", { path: { id }, body: payload, options });
  }

  /** `POST /broadcast-groups/{id}/cancel` */
  cancel(id: string, options?: RequestOptions) {
    return this.core.request("post", "/broadcast-groups/{id}/cancel", { path: { id }, options });
  }
}

export class Templates extends Resource {
  /** `POST /templates` */
  create(payload: RequestBody<"/templates", "post">, options?: RequestOptions) {
    return this.core.request("post", "/templates", { body: payload, options });
  }

  /** `GET /templates` */
  list(params?: QueryParams<"/templates", "get">, options?: RequestOptions) {
    return this.core.request("get", "/templates", { query: params, options });
  }

  /** Every template, fetched page by page. */
  listAll(
    params?: QueryParams<"/templates", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/templates">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /templates/{id}`: `id` is the template id or its alias. */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/templates/{id}", { path: { id }, options });
  }

  /** `PATCH /templates/{id}` */
  update(id: string, payload: RequestBody<"/templates/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/templates/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /templates/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/templates/{id}", { path: { id }, options });
  }

  /** `POST /templates/{id}/publish` */
  publish(id: string, options?: RequestOptions) {
    return this.core.request("post", "/templates/{id}/publish", { path: { id }, options });
  }

  /** `POST /templates/{id}/duplicate` */
  duplicate(id: string, options?: RequestOptions) {
    return this.core.request("post", "/templates/{id}/duplicate", { path: { id }, options });
  }
}
