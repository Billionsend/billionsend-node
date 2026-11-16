// The OpenAPI snapshot as a test oracle: operations, JSON Schema validation
// (Ajv, draft 2020-12, as OpenAPI 3.1 uses) and deterministic sample instances.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

// ajv-formats is CommonJS; its default export arrives wrapped under ESM.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as typeof import("ajv-formats").default;

export type JsonSchema = Record<string, unknown>;

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema: JsonSchema;
}

export interface Operation {
  /** `"GET /emails/{id}"` */
  key: string;
  method: string;
  path: string;
  /** JSON pointer (inside the document) to the operation object. */
  pointer: string;
  parameters: Parameter[];
  requestBody?: { required?: boolean; content: Record<string, { schema: JsonSchema }> };
  responses: Record<string, { content?: Record<string, { schema: JsonSchema }> }>;
  security?: unknown[];
}

const SPEC_URL = fileURLToPath(new URL("../../openapi/api.openapi.json", import.meta.url));
export const DOC = JSON.parse(readFileSync(SPEC_URL, "utf8")) as {
  security?: unknown[];
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, JsonSchema> };
};

const DOC_ID = "https://contract.test/openapi.json";
const METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

export const OPERATIONS: Operation[] = Object.entries(DOC.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m] !== undefined).map((m) => {
    const op = item[m] as Omit<Operation, "key" | "method" | "path" | "pointer">;
    return {
      ...op,
      parameters: op.parameters ?? [],
      key: `${m.toUpperCase()} ${path}`,
      method: m.toUpperCase(),
      path,
      pointer: `/paths/${escapePointer(path)}/${m}`,
    };
  }),
);

export const OPERATION_KEYS: ReadonlySet<string> = new Set(OPERATIONS.map((op) => op.key));

export function operation(key: string): Operation {
  const op = OPERATIONS.find((candidate) => candidate.key === key);
  if (!op) throw new Error(`No operation ${key} in the snapshot`);
  return op;
}

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv);
ajv.addSchema(DOC as unknown as JsonSchema, DOC_ID);

const compiled = new Map<string, ValidateFunction>();

/** A validator for the schema at `pointer` (a JSON pointer into the document). */
export function validatorAt(pointer: string): ValidateFunction {
  let validate = compiled.get(pointer);
  if (!validate) {
    validate = ajv.compile({ $ref: `${DOC_ID}#${pointer}` });
    compiled.set(pointer, validate);
  }
  return validate;
}

export function schemaErrors(pointer: string, value: unknown): string | null {
  const validate = validatorAt(pointer);
  if (validate(value)) return null;
  return ajv.errorsText(validate.errors, { dataVar: "value" });
}

export function pointerOf(op: Operation, ...segments: string[]): string {
  return `${op.pointer}/${segments.map(escapePointer).join("/")}`;
}

/** The lowest 2xx status with a JSON body, if the operation declares one. */
export function successStatus(op: Operation): string | undefined {
  return Object.keys(op.responses)
    .filter((status) => /^2\d\d$/.test(status) && op.responses[status]?.content?.["application/json"])
    .sort()[0];
}

export function resolve(schema: JsonSchema): JsonSchema {
  let current = schema;
  for (let guard = 0; typeof current.$ref === "string" && guard < 32; guard++) {
    const ref = current.$ref as string;
    const name = ref.replace("#/components/schemas/", "");
    const target = DOC.components.schemas[name];
    if (!target) throw new Error(`Unresolvable $ref ${ref}`);
    current = target;
  }
  return current;
}

const SAMPLE_UUID = "6f1c2a1e-1b7a-4c51-9e43-2f2d7a9c0b11";

function sampleString(schema: JsonSchema): string {
  switch (schema.format) {
    case "uuid":
      return SAMPLE_UUID;
    case "date-time":
      return "2026-11-16T12:00:00.000Z";
    case "date":
      return "2026-11-16";
    case "email":
      return "person@example.com";
    case "uri":
    case "url":
      return "https://example.com/resource";
    default:
      break;
  }
  let value = "sample";
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) value = "a";
  const min = typeof schema.minLength === "number" ? schema.minLength : 0;
  const max = typeof schema.maxLength === "number" ? schema.maxLength : Number.POSITIVE_INFINITY;
  if (value.length < min) value = value.padEnd(min, "a");
  if (value.length > max) value = value.slice(0, max);
  return value;
}

function sampleNumber(schema: JsonSchema, integer: boolean): number {
  let value = 0;
  if (typeof schema.minimum === "number") value = schema.minimum;
  if (typeof schema.exclusiveMinimum === "number") value = schema.exclusiveMinimum + 1;
  if (typeof schema.maximum === "number" && value > schema.maximum) value = schema.maximum;
  return integer ? Math.ceil(value) : value;
}

/** A small, deterministic instance of `schema` (required properties only, one item per array). */
export function sample(input: JsonSchema, depth = 0): unknown {
  const schema = resolve(input);
  if ("example" in schema) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  for (const key of ["oneOf", "anyOf"] as const) {
    const options = schema[key];
    if (Array.isArray(options)) {
      const preferred = (options as JsonSchema[]).find((o) => resolve(o).type !== "null") ?? options[0];
      return sample(preferred as JsonSchema, depth + 1);
    }
  }
  if (Array.isArray(schema.allOf)) {
    return Object.assign({}, ...(schema.allOf as JsonSchema[]).map((part) => sample(part, depth + 1)));
  }
  let type = schema.type;
  if (Array.isArray(type)) type = type.find((t) => t !== "null") ?? "null";
  if (type === undefined && schema.properties) type = "object";
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      for (const name of (schema.required ?? []) as string[]) {
        out[name] = properties[name] ? sample(properties[name], depth + 1) : "sample";
      }
      return out;
    }
    case "array": {
      const min = typeof schema.minItems === "number" ? schema.minItems : 0;
      const max = typeof schema.maxItems === "number" ? schema.maxItems : Number.POSITIVE_INFINITY;
      const count = Math.min(Math.max(min, depth < 6 ? 1 : 0), max);
      const items = (schema.items ?? {}) as JsonSchema;
      return Array.from({ length: count }, () => sample(items, depth + 1));
    }
    case "string":
      return sampleString(schema);
    case "integer":
      return sampleNumber(schema, true);
    case "number":
      return sampleNumber(schema, false);
    case "boolean":
      return true;
    case "null":
      return null;
    default:
      return {};
  }
}

/** A sample body for an operation's response with the given status. */
export function sampleResponse(op: Operation, status: string): unknown {
  const schema = op.responses[status]?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`${op.key} declares no JSON body for ${status}`);
  return sample(schema);
}

export { SAMPLE_UUID };
