import type { RequestOptions } from "../core.js";
import { paginate } from "../pagination.js";
import { Resource } from "../resource.js";
import type { ListItem, QueryParams, RequestBody } from "../types.js";

export class DomainClaims extends Resource {
  /** `POST /domains/claim`: starts a claim on a domain another team already holds. */
  create(payload: RequestBody<"/domains/claim", "post">, options?: RequestOptions) {
    return this.core.request("post", "/domains/claim", { body: payload, options });
  }

  /** `GET /domains/{id}/claim` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/domains/{id}/claim", { path: { id }, options });
  }

  /** `POST /domains/{id}/claim/verify` */
  verify(id: string, options?: RequestOptions) {
    return this.core.request("post", "/domains/{id}/claim/verify", { path: { id }, options });
  }
}

export class Domains extends Resource {
  readonly claims: DomainClaims = new DomainClaims(this.core);

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

  /** `PATCH /api-keys/{id}` */
  update(id: string, payload: RequestBody<"/api-keys/{id}", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/api-keys/{id}", { path: { id }, body: payload, options });
  }

  /** `DELETE /api-keys/{id}` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/api-keys/{id}", { path: { id }, options });
  }
}

export class WebhookEventAttempts extends Resource {
  /** `GET /webhooks/{id}/events/{event_id}/attempts` */
  list(
    id: string,
    eventId: string,
    params?: QueryParams<"/webhooks/{id}/events/{event_id}/attempts", "get">,
    options?: RequestOptions,
  ) {
    return this.core.request("get", "/webhooks/{id}/events/{event_id}/attempts", {
      path: { id, event_id: eventId },
      query: params,
      options,
    });
  }

  /** Every delivery attempt of one webhook event, fetched page by page. */
  listAll(
    id: string,
    eventId: string,
    params?: QueryParams<"/webhooks/{id}/events/{event_id}/attempts", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/webhooks/{id}/events/{event_id}/attempts">, void, undefined> {
    return paginate((cursor) => this.list(id, eventId, { ...params, ...cursor }, options), params);
  }
}

export class WebhookEvents extends Resource {
  readonly attempts: WebhookEventAttempts = new WebhookEventAttempts(this.core);

  /** `GET /webhooks/{id}/events` */
  list(id: string, params?: QueryParams<"/webhooks/{id}/events", "get">, options?: RequestOptions) {
    return this.core.request("get", "/webhooks/{id}/events", { path: { id }, query: params, options });
  }

  /** Every event of one webhook, fetched page by page. */
  listAll(
    id: string,
    params?: QueryParams<"/webhooks/{id}/events", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/webhooks/{id}/events">, void, undefined> {
    return paginate((cursor) => this.list(id, { ...params, ...cursor }, options), params);
  }

  /** `GET /webhooks/{id}/events/{event_id}` */
  get(id: string, eventId: string, options?: RequestOptions) {
    return this.core.request("get", "/webhooks/{id}/events/{event_id}", {
      path: { id, event_id: eventId },
      options,
    });
  }

  /** `POST /webhooks/{id}/events/{event_id}/replay` */
  replay(id: string, eventId: string, options?: RequestOptions) {
    return this.core.request("post", "/webhooks/{id}/events/{event_id}/replay", {
      path: { id, event_id: eventId },
      options,
    });
  }
}

export class Webhooks extends Resource {
  readonly events: WebhookEvents = new WebhookEvents(this.core);

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

  /** `POST /webhooks/{id}/signing-secret/rotate`: rotates the signing secret. */
  rotateSigningSecret(
    id: string,
    payload: RequestBody<"/webhooks/{id}/signing-secret/rotate", "post">,
    options?: RequestOptions,
  ) {
    return this.core.request("post", "/webhooks/{id}/signing-secret/rotate", {
      path: { id },
      body: payload,
      options,
    });
  }
}

export class Logs extends Resource {
  /** `GET /logs` */
  list(params?: QueryParams<"/logs", "get">, options?: RequestOptions) {
    return this.core.request("get", "/logs", { query: params, options });
  }

  /** Every API request log entry, fetched page by page. */
  listAll(
    params?: QueryParams<"/logs", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/logs">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `GET /logs/{id}` */
  get(id: string, options?: RequestOptions) {
    return this.core.request("get", "/logs/{id}", { path: { id }, options });
  }
}

export class OauthGrants extends Resource {
  /** `GET /oauth/grants` */
  list(params?: QueryParams<"/oauth/grants", "get">, options?: RequestOptions) {
    return this.core.request("get", "/oauth/grants", { query: params, options });
  }

  /** Every OAuth grant, fetched page by page. */
  listAll(
    params?: QueryParams<"/oauth/grants", "get">,
    options?: RequestOptions,
  ): AsyncGenerator<ListItem<"/oauth/grants">, void, undefined> {
    return paginate((cursor) => this.list({ ...params, ...cursor }, options), params);
  }

  /** `DELETE /oauth/grants/{id}` */
  revoke(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/oauth/grants/{id}", { path: { id }, options });
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
