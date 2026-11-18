// Every ```ts block of the README and what the live suite does with it. `test/readme.test.ts` fails
// when the README gains, loses or changes the first line of a block without this list following.

export interface ReadmeBlock {
  /** The block's first non-empty line, as written in the README. */
  start: string;
  /** `live`: run against the live API by test/e2e/live.e2e.ts. `illustration`: not code. `not-run`: see `why`. */
  status: "live" | "illustration" | "not-run";
  /** For `live`: a part of the title of the live test that runs it (it must occur in live.e2e.ts). */
  test?: string;
  /** For `illustration` and `not-run`: why the block is not run. */
  why?: string;
}

export const README_BLOCKS: ReadmeBlock[] = [
  {
    start: 'import { BillionSend } from "@billionsend/node";',
    status: "live",
    test: "a client with every option set",
  },
  {
    start: "const { data, error } = await bs.emails.send({",
    status: "live",
    test: "sends an email and reads it back",
  },
  {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the README's own text
    start: "await bs.emails.send(message, { idempotencyKey: `welcome/${user.id}` });",
    status: "live",
    test: "an Idempotency-Key makes a repeat answer the first send",
  },
  {
    start: 'const bs = new BillionSend({ apiKey: "bs_...", maxRetries: 4 });',
    status: "live",
    test: "maxRetries 0 per call sends once",
  },
  {
    start: "{ data: T, error: null, headers }",
    status: "illustration",
    why: "the shape of a result, not code",
  },
  {
    start: 'import { NotFoundError, RateLimitError } from "@billionsend/node";',
    status: "live",
    test: "answers an unknown id with NotFoundError and a request id",
  },
  {
    start: "for await (const contact of bs.contacts.listAll({ limit: 100 })) {",
    status: "live",
    test: "iterates contacts and stops early",
  },
  {
    start: 'const inboxId = "support@acme.dev"; // an inbox id or its address',
    status: "not-run",
    why: "needs an inbox that receives mail; the company account's inboxes are off limits and a new shared-domain inbox uses quota. Covered offline: test/sse.test.ts, test/resources.test.ts, test/readme-examples.ts",
  },
  {
    start:
      'const { data: code } = await bs.inboxes.codes.latest("support@acme.dev", { from: "example.com", wait: 30 });',
    status: "not-run",
    why: "waits for mail in an inbox; same reason as the block above",
  },
  {
    start:
      'const opened = await bs.inboxes.events.stream({ types: "inbox.email.received,inbox.thread.created" }, {',
    status: "live",
    test: "opens the team's stream, reads what arrives for a few seconds and closes it",
  },
  {
    start: 'import express from "express";',
    status: "live",
    test: "verifies a delivery with the Fetch API and with a Node server",
  },
  {
    start: "const started = await bs.contacts.imports.create({",
    status: "live",
    test: "imports a CSV and polls the import",
  },
  {
    start: "const signup = await new BillionSend().agent.signup({",
    status: "not-run",
    why: "creates a real account and a real inbox and mails a human; only offline",
  },
  { start: "const bs = new BillionSend({", status: "live", test: "a client with every option set" },
];
