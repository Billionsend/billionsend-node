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
