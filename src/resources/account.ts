import type { RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class Domains extends Resource {
  /** `POST /domains` */
  create(payload: RequestBody<"/domains", "post">, options?: RequestOptions) {
    return this.core.request("post", "/domains", { body: payload, options });
  }

  /** `GET /domains` */
  list(params?: QueryParams<"/domains", "get">, options?: RequestOptions) {
    return this.core.request("get", "/domains", { query: params, options });
  }

  /** Every domain, fetched page by page. */
  listAll(
    params?: QueryParams<"/domains", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/domains">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /domains/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/domains/{id}", { path: { id }, options });
  }

  /** `PATCH /domains/{id}` */
  update(id: string, payload: RequestBody<"/domains/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/domains/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /domains/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/domains/{id}", { path: { id }, options });
  }

  /** `POST /domains/{id}/verify` */
  verify(id: string, options?: RequestOptions) {
    return this.core.request("post", "/domains/{id}/verify", { path: { id }, options });
  }
}

export class ApiKeys extends Resource {
  /** `POST /api-keys`: the token is returned only in this answer. */
  create(payload: RequestBody<"/api-keys", "post">, options?: RequestOptions) {
    return this.core.request("post", "/api-keys", { body: payload, options });
  }

  /** `GET /api-keys` */
  list(params?: QueryParams<"/api-keys", "get">, options?: RequestOptions) {
    return this.core.request("get", "/api-keys", { query: params, options });
  }

  /** Every API key, fetched page by page. */
  listAll(
    params?: QueryParams<"/api-keys", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/api-keys">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `DELETE /api-keys/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/api-keys/{id}", { path: { id }, options });
  }
}

export class Webhooks extends Resource {
  /** `POST /webhooks` */
  create(payload: RequestBody<"/webhooks", "post">, options?: RequestOptions) {
    return this.core.request("post", "/webhooks", { body: payload, options });
  }

  /** `GET /webhooks` */
  list(params?: QueryParams<"/webhooks", "get">, options?: RequestOptions) {
    return this.core.request("get", "/webhooks", { query: params, options });
  }

  /** Every webhook, fetched page by page. */
  listAll(
    params?: QueryParams<"/webhooks", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/webhooks">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /webhooks/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/webhooks/{id}", { path: { id }, options });
  }

  /** `PATCH /webhooks/{id}` */
  update(id: string, payload: RequestBody<"/webhooks/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/webhooks/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /webhooks/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/webhooks/{id}", { path: { id }, options });
  }

  /** `POST /webhooks/{id}/rotate`: rotates the signing secret. */
  rotate(id: string, payload: RequestBody<"/webhooks/{id}/rotate", "post">, options?: RequestOptions) {
    return this.core.request("post", "/webhooks/{id}/rotate", { path: { id }, body: payload, options });
  }
}

export class Usage extends Resource {
  /** `GET /usage` */
  get(options?: RequestOptions) {
    return this.core.request("get", "/usage", { options });
  }
}

export class Deliverability extends Resource {
  /** `GET /deliverability` */
  get(options?: RequestOptions) {
    return this.core.request("get", "/deliverability", { options });
  }
}

export class Agent extends Resource {
  /** `POST /agent/signup`: needs no API key; the answer carries the new account's key. */
  signup(payload: RequestBody<"/agent/signup", "post">, options?: RequestOptions) {
    return this.core.request("post", "/agent/signup", { body: payload, options, auth: false });
  }

  /** `GET /agent/status` */
  status(options?: RequestOptions) {
    return this.core.request("get", "/agent/status", { options });
  }

  /** `POST /agent/claim-email`: sends the claim link again. */
  claimEmail(options?: RequestOptions) {
    return this.core.request("post", "/agent/claim-email", { options });
  }
}
