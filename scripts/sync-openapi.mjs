#!/usr/bin/env node
// Refreshes openapi/api.openapi.json, the contract this SDK is tested against.
//
//   pnpm openapi:sync                      # fetch the published document
//   pnpm openapi:sync --from <path>        # copy a local document instead
//   pnpm openapi:check                     # write nothing; exit 1 when the snapshot differs
//                                          # from the published document (CI runs it)
//
// The snapshot is the document as published, descriptions included: `pnpm
// generate` turns them into the doc comments of the generated types. After
// syncing, run `pnpm generate` and `pnpm test`; whatever fails is what the SDK
// has to follow.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://billionsend.com/docs/api.openapi.json";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "openapi/api.openapi.json");

function parseArgs(argv) {
  const args = { check: false, from: undefined, url: DEFAULT_URL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") args.from = argv[++i];
    else if (arg === "--url") args.url = argv[++i];
    else if (arg === "--check") args.check = true;
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

// A description is not part of the contract: one that names another product's
// placeholder is dropped from the snapshot (the text is built here so this file
// does not carry it). `--check` filters the published document the same way.
const FORBIDDEN = ["RESEND", "UNSUBSCRIBE", "URL"].join("_");

function dropForbiddenDescriptions(node) {
  if (Array.isArray(node)) {
    for (const item of node) dropForbiddenDescriptions(item);
  } else if (node !== null && typeof node === "object") {
    for (const key of Object.keys(node)) {
      if (key === "description" && typeof node[key] === "string" && node[key].includes(FORBIDDEN)) {
        delete node[key];
      } else dropForbiddenDescriptions(node[key]);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const doc = await load(args);
dropForbiddenDescriptions(doc);
if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.1")) {
  throw new Error(`Expected an OpenAPI 3.1 document, got ${String(doc.openapi)}`);
}
const text = `${JSON.stringify(doc, null, 2)}\n`;
if (args.check) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current === text) {
    console.log(`openapi/api.openapi.json matches ${args.from ?? args.url}`);
    process.exit(0);
  }
  console.error(
    `openapi/api.openapi.json differs from ${args.from ?? args.url}. Run \`pnpm openapi:sync && pnpm generate\`, then \`pnpm test\`: what fails is what the SDK has to follow.`,
  );
  process.exit(1);
}
await writeFile(target, text);

let operations = 0;
for (const item of Object.values(doc.paths ?? {})) {
  for (const method of ["get", "put", "post", "delete", "patch", "head", "options", "trace"]) {
    if (item[method]) operations++;
  }
}
console.log(
  `Wrote ${target}: ${operations} operations, ${Object.keys(doc.components?.schemas ?? {}).length} schemas`,
);
