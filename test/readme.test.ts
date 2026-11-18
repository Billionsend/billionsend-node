// The README is what a developer copies from: every code block in it is accounted for. The live
// suite runs the blocks it can (test/e2e/readme-blocks.ts says which); this offline test fails when
// the README and that list drift apart, and when a block that is run has no test that names it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { README_BLOCKS } from "./e2e/readme-blocks.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const live = readFileSync(new URL("./e2e/live.e2e.ts", import.meta.url), "utf8");

const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => {
  const body = m[1] ?? "";
  return body.split("\n").find((line) => line.trim() !== "") ?? "";
});

describe("README idempotency list", () => {
  it("names every operation the API document gives an Idempotency-Key", () => {
    const spec = JSON.parse(
      readFileSync(new URL("../openapi/api.openapi.json", import.meta.url), "utf8"),
    ) as {
      paths: Record<string, Record<string, { operationId?: string; parameters?: { name?: string }[] }>>;
    };
    const paragraph = readme.split("\n").find((line) => line.startsWith("**Idempotency.**")) ?? "";
    const keyed: string[] = [];
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) {
        const takesKey = (op.parameters ?? []).some((p) => p.name?.toLowerCase() === "idempotency-key");
        if (takesKey && op.operationId) keyed.push(op.operationId);
      }
    }
    expect(keyed.length).toBeGreaterThan(5);
    for (const id of keyed) {
      const last = id.slice(id.lastIndexOf(".") + 1);
      const parent = id.slice(0, id.lastIndexOf(".") + 1);
      // The README writes `a.b.reply` / `forward` for two siblings.
      const named =
        paragraph.includes(`\`${id}\``) ||
        (paragraph.includes(`\`${parent}`) && paragraph.includes(`\`${last}\``));
      expect(named, id).toBe(true);
    }
  });
});

describe("README code blocks", () => {
  it("are exactly the blocks the live suite accounts for, in order", () => {
    expect(blocks).toEqual(README_BLOCKS.map((b) => b.start));
  });

  it("each live block names a test of the live suite that exists", () => {
    for (const block of README_BLOCKS.filter((b) => b.status === "live")) {
      expect(block.test, block.start).toBeTruthy();
      expect(live.includes(block.test ?? "?"), `${block.start} → ${block.test}`).toBe(true);
    }
  });

  it("every block that is not run says why", () => {
    for (const block of README_BLOCKS.filter((b) => b.status !== "live")) {
      expect((block.why ?? "").length, block.start).toBeGreaterThan(15);
    }
  });
});
