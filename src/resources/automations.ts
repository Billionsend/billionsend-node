import type { IdempotentRequestOptions, RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { idempotent, Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class AutomationRuns extends Resource {
  /** `GET /automations/{id}/runs` */
  list(id: string, params?: QueryParams<"/automations/{id}/runs", "get">, options?: RequestOptions) {
    return this.core.request("get", "/automations/{id}/runs", { path: { id }, query: params, options });
  }

  /** Every run of one automation, fetched page by page. */
  listAll(
    id: string,
    params?: QueryParams<"/automations/{id}/runs", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/automations/{id}/runs">, void, undefined> {
    return paginate((cursor) => this.list(id, { ...params, ...cursor }, options), params);
  }

  /** `GET /automations/{id}/runs/{run_id}` */
  get(id: string, runId: string, options?: RequestOptions) {
    return this.core.request("get", "/automations/{id}/runs/{run_id}", {
      path: { id, run_id: runId },
      options,
    });
  }

  /** `POST /automations/{id}/runs/{run_id}/cancel` */
  cancel(id: string, runId: string, options?: RequestOptions) {
    return this.core.request("post", "/automations/{id}/runs/{run_id}/cancel", {
      path: { id, run_id: runId },
      options,
    });
  }
}

export class Automations extends Resource {
  readonly runs: AutomationRuns = new AutomationRuns(this.core);

  /** `POST /automations` */
  create(payload: RequestBody<"/automations", "post">, options?: RequestOptions) {
    return this.core.request("post", "/automations", { body: payload, options });
  }

  /** `GET /automations` */
  list(params?: QueryParams<"/automations", "get">, options?: RequestOptions) {
    return this.core.request("get", "/automations", { query: params, options });
  }

  /** Every automation, fetched page by page. */
  listAll(
    params?: QueryParams<"/automations", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/automations">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /automations/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/automations/{id}", { path: { id }, options });
  }

  /** `PATCH /automations/{id}` */
  update(id: string, payload: RequestBody<"/automations/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/automations/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /automations/{id}` */
  remove(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/automations/{id}", { path: { id }, options });
  }

  /** `POST /automations/validate`: checks a definition without saving it. */
  validate(payload: RequestBody<"/automations/validate", "post">, options?: RequestOptions) {
    return this.core.request("post", "/automations/validate", { body: payload, options });
  }

  /** `POST /automations/{id}/duplicate` */
  duplicate(id: string, options?: RequestOptions) {
    return this.core.request("post", "/automations/{id}/duplicate", { path: { id }, options });
  }

  /** `POST /automations/{id}/simulate` */
  simulate(id: string, payload: RequestBody<"/automations/{id}/simulate", "post">, options?: RequestOptions) {
    return this.core.request("post", "/automations/{id}/simulate", { path: { id }, body: payload, options });
  }

  /** `POST /automations/{id}/stop` */
  stop(id: string, options?: RequestOptions) {
    return this.core.request("post", "/automations/{id}/stop", { path: { id }, options });
  }

  /** `GET /automations/{id}/metrics` */
  metrics(id: string, params?: QueryParams<"/automations/{id}/metrics", "get">, options?: RequestOptions) {
    return this.core.request("get", "/automations/{id}/metrics", { path: { id }, query: params, options });
  }
}

export class Events extends Resource {
  /** `POST /events`: defines a custom event. */
  create(payload: RequestBody<"/events", "post">, options?: RequestOptions) {
    return this.core.request("post", "/events", { body: payload, options });
  }

  /** `GET /events` */
  list(params?: QueryParams<"/events", "get">, options?: RequestOptions) {
    return this.core.request("get", "/events", { query: params, options });
  }

  /** Every custom event, fetched page by page. */
  listAll(
    params?: QueryParams<"/events", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/events">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /events/{id_or_name}` */
  get(idOrName: string, options?: RequestOptions) {
    return this.core.request("get", "/events/{id_or_name}", { path: { id_or_name: idOrName }, options });
  }

  /** `PATCH /events/{id_or_name}` */
  update(idOrName: string, payload: RequestBody<"/events/{id_or_name}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/events/{id_or_name}", {
      path: { id_or_name: idOrName },
      body: payload,
      options,
    });
  }

  /** `DELETE /events/{id_or_name}` */
  remove(idOrName: string, options?: RequestOptions) {
    return this.core.request("delete", "/events/{id_or_name}", { path: { id_or_name: idOrName }, options });
  }

  /** `POST /events/send`: sends an event that starts the automations listening for it. */
  send(payload: RequestBody<"/events/send", "post">, options?: IdempotentRequestOptions) {
    return this.core.request("post", "/events/send", { body: payload, ...idempotent(options) });
  }
}
