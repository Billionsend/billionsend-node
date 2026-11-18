// A local HTTP server that plays the API as the OpenAPI snapshot describes it.
// Every request is matched to an operation and checked (path, query, headers,
// auth, body); anything off-contract is recorded in `violations` and answered
// with a 400. Successful calls answer a sample that validates against the
// operation's response schema; tests can queue other answers per operation.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type JsonSchema,
  OPERATIONS,
  type Operation,
  pointerOf,
  resolve,
  sampleResponse,
  schemaErrors,
  successStatus,
} from "./spec.js";

export interface Hit {
  key: string;
  method: string;
  url: URL;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  status: number;
  response: unknown;
}

export interface Reply {
  status: number;
  body?: unknown;
  /** A raw body sent as-is (with `content-type` from `headers`). */
  raw?: string;
  headers?: Record<string, string>;
  /** Wait before answering. */
  delayMs?: number;
}

export type SseHandler = (res: ServerResponse, req: IncomingMessage) => void | Promise<void>;

type Queued = { reply: Reply; handler?: undefined } | { handler: SseHandler; reply?: undefined };

interface CompiledRoute {
  op: Operation;
  regex: RegExp;
  names: string[];
  literals: number;
}

const ROUTES: CompiledRoute[] = OPERATIONS.map((op) => {
  const names: string[] = [];
  const segments = op.path.split("/").filter(Boolean);
  const pattern = segments
    .map((segment) => {
      const match = /^\{(.+)\}$/.exec(segment);
      if (match?.[1]) {
        names.push(match[1]);
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return {
    op,
    regex: new RegExp(`^/${pattern}$`),
    names,
    literals: segments.filter((s) => !s.startsWith("{")).length,
  };
});

function isSse(op: Operation): boolean {
  return Object.values(op.responses).some((r) => r.content?.["text/event-stream"]);
}

/** Converts a query or header string to the type its schema asks for, so Ajv can check it. */
function coerce(value: string, schema: JsonSchema): unknown {
  const resolved = resolve(schema);
  const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
  if (
    (types.includes("integer") || types.includes("number")) &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }
  if (types.includes("boolean") && (value === "true" || value === "false")) return value === "true";
  return value;
}

export class ContractMock {
  readonly hits: Hit[] = [];
  readonly violations: string[] = [];
  #server: Server | null = null;
  /** Queued answers per operation, consumed in order (JSON replies and stream handlers share one queue). */
  #queue = new Map<string, Queued[]>();
  #url = "";

  get url(): string {
    return this.#url;
  }

  async start(): Promise<this> {
    this.#server = createServer((req, res) => {
      void this.#handle(req, res);
    });
    await new Promise<void>((done) => this.#server?.listen(0, "127.0.0.1", done));
    const { port } = this.#server.address() as AddressInfo;
    this.#url = `http://127.0.0.1:${port}`;
    return this;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    this.#server = null;
  }

  /** Clears hits, violations and queued replies. */
  reset(): void {
    this.hits.length = 0;
    this.violations.length = 0;
    this.#queue.clear();
  }

  /** Queues one answer for the next call of `key` (`"GET /emails"`). */
  reply(key: string, reply: Reply): this {
    return this.#enqueue(key, { reply });
  }

  /** Queues a custom handler for the next connection to an event-stream operation. */
  stream(key: string, handler: SseHandler): this {
    return this.#enqueue(key, { handler });
  }

  hitsFor(key: string): Hit[] {
    return this.hits.filter((hit) => hit.key === key);
  }

  #enqueue(key: string, entry: Queued): this {
    if (!ROUTES.some((route) => route.op.key === key)) throw new Error(`No operation ${key} in the snapshot`);
    const queue = this.#queue.get(key) ?? [];
    queue.push(entry);
    this.#queue.set(key, queue);
    return this;
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://mock.test");
    const method = (req.method ?? "GET").toUpperCase();
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBuffer = Buffer.concat(chunks);
    const rawBody = rawBuffer.toString("utf8");

    const candidates = ROUTES.filter((route) => route.regex.test(url.pathname));
    const route = candidates
      .filter((candidate) => candidate.op.method === method)
      .sort((a, b) => b.literals - a.literals)[0];
    if (!route) {
      const problem = candidates.length
        ? `${method} ${url.pathname}: method not in the contract`
        : `${method} ${url.pathname}: path not in the contract`;
      this.#violate(res, problem, { key: `${method} ${url.pathname}`, method, url, req, body: rawBody });
      return;
    }
    const { op } = route;
    const problems: string[] = [];

    // Path parameters.
    const match = route.regex.exec(url.pathname);
    route.names.forEach((name, index) => {
      const param = op.parameters.find((p) => p.in === "path" && p.name === name);
      const value = decodeURIComponent(match?.[index + 1] ?? "");
      if (!param) problems.push(`path parameter ${name} is not declared`);
      else {
        const error = schemaErrors(
          pointerOf(op, "parameters", String(op.parameters.indexOf(param)), "schema"),
          coerce(value, param.schema),
        );
        if (error) problems.push(`path parameter ${name}: ${error}`);
      }
    });

    // Query parameters: only declared names, right types, required present.
    const queryNames = new Set(url.searchParams.keys());
    for (const name of queryNames) {
      const param = op.parameters.find((p) => p.in === "query" && p.name === name);
      if (!param) {
        problems.push(`query parameter ${name} is not declared`);
        continue;
      }
      const values = url.searchParams.getAll(name);
      const schema = resolve(param.schema);
      const isArray =
        schema.type === "array" || (Array.isArray(schema.type) && schema.type.includes("array"));
      const items = (schema.items ?? {}) as JsonSchema;
      // A list without explode is one comma-separated value; with it (the default), repeated keys.
      const exploded = param.explode ?? (param.style ?? "form") === "form";
      if (isArray && !exploded && values.length > 1) problems.push(`query parameter ${name} repeated`);
      const listed = isArray && !exploded ? (values[0] ?? "").split(",") : values;
      const value = isArray ? listed.map((v) => coerce(v, items)) : coerce(values[0] ?? "", param.schema);
      if (!isArray && values.length > 1) problems.push(`query parameter ${name} repeated`);
      const error = schemaErrors(
        pointerOf(op, "parameters", String(op.parameters.indexOf(param)), "schema"),
        value,
      );
      if (error) problems.push(`query parameter ${name}: ${error}`);
    }
    for (const param of op.parameters) {
      if (param.in === "query" && param.required && !queryNames.has(param.name)) {
        problems.push(`required query parameter ${param.name} is missing`);
      }
      if (param.in === "header") {
        const value = req.headers[param.name.toLowerCase()];
        if (value === undefined) {
          if (param.required) problems.push(`required header ${param.name} is missing`);
        } else {
          const error = schemaErrors(
            pointerOf(op, "parameters", String(op.parameters.indexOf(param)), "schema"),
            coerce(String(value), param.schema),
          );
          if (error) problems.push(`header ${param.name}: ${error}`);
        }
      }
    }

    // Authentication.
    const security = op.security ?? [];
    const authorization = req.headers.authorization;
    if (op.security !== undefined && security.length === 0) {
      if (authorization !== undefined) problems.push("sends Authorization to an operation that takes none");
    } else if (!authorization || !/^Bearer \S+$/.test(authorization)) {
      problems.push("missing or malformed Authorization: Bearer header");
    }

    // Request body: a declared body must be sent unless the document says `required: false`.
    let body: unknown;
    if (op.requestBody) {
      if (rawBody === "") {
        if (op.requestBody.required !== false) problems.push("request body is missing");
      } else if (String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
        if (!op.requestBody.content["multipart/form-data"]) {
          problems.push("request body sent as multipart/form-data, which the operation does not take");
        } else {
          // A file part is checked as present and replaced by a marker; every other part is a string.
          const form = await new Response(rawBuffer, {
            headers: { "content-type": String(req.headers["content-type"]) },
          }).formData();
          const fields: Record<string, string> = {};
          for (const [name, value] of form.entries()) {
            fields[name] = typeof value === "string" ? value : `file:${value.name}:${value.size}`;
          }
          body = fields;
          const error = schemaErrors(
            pointerOf(op, "requestBody", "content", "multipart/form-data", "schema"),
            fields,
          );
          if (error) problems.push(`request body: ${error}`);
        }
      } else if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        problems.push(`request body sent as ${String(req.headers["content-type"])}`);
      } else if (!op.requestBody.content["application/json"]) {
        problems.push("request body sent as JSON, which the operation does not take");
      } else {
        try {
          body = JSON.parse(rawBody);
          const error = schemaErrors(
            pointerOf(op, "requestBody", "content", "application/json", "schema"),
            body,
          );
          if (error) problems.push(`request body: ${error}`);
        } catch {
          problems.push("request body is not JSON");
        }
      }
    } else if (rawBody !== "") {
      problems.push("sends a body to an operation that takes none");
    }

    const accept = String(req.headers.accept ?? "");
    if (isSse(op) && !accept.includes("text/event-stream"))
      problems.push("event stream requested without Accept: text/event-stream");

    if (problems.length > 0) {
      this.#violate(res, `${op.key}: ${problems.join("; ")}`, {
        key: op.key,
        method,
        url,
        req,
        body: body ?? rawBody,
      });
      return;
    }

    const hit: Hit = {
      key: op.key,
      method,
      url,
      headers: { ...req.headers },
      body,
      status: 0,
      response: undefined,
    };
    this.hits.push(hit);

    const queued = this.#queue.get(op.key)?.shift();
    const reply = queued?.reply;
    if (reply) {
      if (reply.delayMs) await new Promise((done) => setTimeout(done, reply.delayMs));
      hit.status = reply.status;
      hit.response = reply.raw ?? reply.body;
      const headers = { "content-type": "application/json", ...reply.headers };
      res.writeHead(reply.status, headers);
      res.end(reply.raw ?? (reply.body === undefined ? "" : JSON.stringify(reply.body)));
      return;
    }

    if (isSse(op)) {
      hit.status = 200;
      const handler = queued?.handler;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.flushHeaders();
      if (handler) await handler(res, req);
      else {
        res.write(': ok\n\nid: 1\nevent: inbox.email.received\ndata: {"type":"inbox.email.received"}\n\n');
        res.end();
      }
      return;
    }

    const status = successStatus(op);
    if (status === undefined) {
      // The document declares no success answer (PATCH /inboxes/{inbox_id}/agent): answer its first error.
      const errorStatus = Object.keys(op.responses).sort()[0] ?? "500";
      const sampleError = {
        statusCode: Number(errorStatus),
        name: "not_supported",
        message: "Not supported",
      };
      hit.status = Number(errorStatus);
      hit.response = sampleError;
      res.writeHead(Number(errorStatus), { "content-type": "application/json" });
      res.end(JSON.stringify(sampleError));
      return;
    }
    const response = sampleResponse(op, status);
    const error = schemaErrors(
      pointerOf(op, "responses", status, "content", "application/json", "schema"),
      response,
    );
    if (error) {
      this.#violate(res, `${op.key}: the mock's sample response does not validate: ${error}`, {
        key: op.key,
        method,
        url,
        req,
        body,
      });
      return;
    }
    hit.status = Number(status);
    hit.response = response;
    res.writeHead(Number(status), { "content-type": "application/json", "x-request-id": "req_mock" });
    res.end(JSON.stringify(response));
  }

  #violate(
    res: ServerResponse,
    problem: string,
    info: { key: string; method: string; url: URL; req: IncomingMessage; body: unknown },
  ): void {
    this.violations.push(problem);
    this.hits.push({
      key: info.key,
      method: info.method,
      url: info.url,
      headers: { ...info.req.headers },
      body: info.body,
      status: 400,
      response: undefined,
    });
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ statusCode: 400, name: "contract_violation", message: problem }));
  }
}
