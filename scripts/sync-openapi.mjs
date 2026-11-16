#!/usr/bin/env node
// Refreshes openapi/api.openapi.json, the contract this SDK is tested against.
//
//   pnpm openapi:sync                      # fetch the published document
//   pnpm openapi:sync --from <path>        # copy a local document instead
//
// The snapshot keeps the machine-readable contract (paths, parameters, request
// bodies, responses, schemas, summaries) and drops the prose: every string
// `description` is removed, and a Response Object's required `description` is
// emptied. The prose lives on https://billionsend.com/docs. After syncing, run
// `pnpm generate` and `pnpm test`; whatever fails is what the SDK has to follow.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://billionsend.com/docs/api.openapi.json";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "openapi/api.openapi.json");

function parseArgs(argv) {
  const args = { from: undefined, url: DEFAULT_URL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") args.from = argv[++i];
    else if (arg === "--url") args.url = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.from === "" || args.url === "") throw new Error("--from and --url need a value");
  return args;
}

async function load({ from, url }) {
  if (from !== undefined) return JSON.parse(await readFile(resolve(process.cwd(), from), "utf8"));
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
  return res.json();
}

/** Removes prose annotations; a Response Object keeps an empty `description` because it is required. */
function stripProse(node, isResponseObject = false) {
  if (Array.isArray(node)) return node.map((item) => stripProse(item));
  if (node === null || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "description" && typeof value === "string") {
      if (isResponseObject) out.description = "";
      continue;
    }
    if (key === "responses" && value !== null && typeof value === "object" && !Array.isArray(value)) {
      out.responses = Object.fromEntries(
        Object.entries(value).map(([status, response]) => [status, stripProse(response, true)]),
      );
      continue;
    }
    out[key] = stripProse(value);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const doc = await load(args);
if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.1")) {
  throw new Error(`Expected an OpenAPI 3.1 document, got ${String(doc.openapi)}`);
}
await writeFile(target, `${JSON.stringify(stripProse(doc), null, 2)}\n`);

let operations = 0;
for (const item of Object.values(doc.paths ?? {})) {
  for (const method of ["get", "put", "post", "delete", "patch", "head", "options", "trace"]) {
    if (item[method]) operations++;
  }
}
console.log(
  `Wrote ${target}: ${operations} operations, ${Object.keys(doc.components?.schemas ?? {}).length} schemas`,
);
