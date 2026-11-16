import type { RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class SuppressionBatch extends Resource {
  /** `POST /suppressions/batch/add` */
  add(payload: RequestBody<"/suppressions/batch/add", "post">, options?: RequestOptions) {
    return this.core.request("post", "/suppressions/batch/add", { body: payload, options });
  }

  /** `POST /suppressions/batch/remove` */
  remove(payload: RequestBody<"/suppressions/batch/remove", "post">, options?: RequestOptions) {
    return this.core.request("post", "/suppressions/batch/remove", { body: payload, options });
  }
}

export class Suppressions extends Resource {
  readonly batch: SuppressionBatch = new SuppressionBatch(this.core);

  /** `POST /suppressions` */
  create(payload: RequestBody<"/suppressions", "post">, options?: RequestOptions) {
    return this.core.request("post", "/suppressions", { body: payload, options });
  }

  /** `GET /suppressions` */
  list(params?: QueryParams<"/suppressions", "get">, options?: RequestOptions) {
    return this.core.request("get", "/suppressions", { query: params, options });
  }

  /** Every suppression, fetched page by page. */
  listAll(
    params?: QueryParams<"/suppressions", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/suppressions">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /suppressions/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/suppressions/{id}", { path: { id }, options });
  }

  /** `DELETE /suppressions/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/suppressions/{id}", { path: { id }, options });
  }
}

export class Unsubscribes extends Resource {
  /** `POST /unsubscribes` */
  create(payload: RequestBody<"/unsubscribes", "post">, options?: RequestOptions) {
    return this.core.request("post", "/unsubscribes", { body: payload, options });
  }

  /** `GET /unsubscribes` */
  list(params?: QueryParams<"/unsubscribes", "get">, options?: RequestOptions) {
    return this.core.request("get", "/unsubscribes", { query: params, options });
  }

  /** Every opt-out, fetched page by page. */
  listAll(
    params?: QueryParams<"/unsubscribes", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/unsubscribes">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `DELETE /unsubscribes/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/unsubscribes/{id}", { path: { id }, options });
  }
}

export class Verifications extends Resource {
  /** `GET /verifications/availability` */
  availability(options?: RequestOptions) {
    return this.core.request("get", "/verifications/availability", { options });
  }

  /** `POST /verifications/estimate` */
  estimate(payload: RequestBody<"/verifications/estimate", "post">, options?: RequestOptions) {
    return this.core.request("post", "/verifications/estimate", { body: payload, options });
  }

  /** `POST /verifications`: starts a verification run. */
  create(payload: RequestBody<"/verifications", "post">, options?: RequestOptions) {
    return this.core.request("post", "/verifications", { body: payload, options });
  }

  /** `GET /verifications` */
  list(params?: QueryParams<"/verifications", "get">, options?: RequestOptions) {
    return this.core.request("get", "/verifications", { query: params, options });
  }

  /** Every verification run, fetched page by page. */
  listAll(
    params?: QueryParams<"/verifications", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/verifications">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /verifications/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/verifications/{id}", { path: { id }, options });
  }
}
