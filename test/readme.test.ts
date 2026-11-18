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
