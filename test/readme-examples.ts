// The README's examples, kept here so `pnpm typecheck` fails when they drift from the SDK.
// Never executed.
import {
  BillionSend,
  NotFoundError,
  RateLimitError,
  verifyWebhook,
  WebhookVerificationError,
} from "../src/index.js";

declare function draftAnswer(subject: string | null, text: string | null): Promise<string>;

export async function readmeExamples(
  customFetch: typeof fetch,
  message: Parameters<BillionSend["emails"]["send"]>[0],
  user: { id: string },
  id: string,
  request: Request,
  saved: string | undefined,
  csvText: string,
) {
  const bs = new BillionSend("bs_...");

  const { data, error } = await bs.emails.send({
    from: "Acme <hello@acme.dev>",
    to: ["ana@example.com"],
    subject: "Welcome to Acme",
    html: "<p>Glad you are here.</p>",
  });
  if (error) console.error(error.statusCode, error.name, error.message, error.requestId);
  else console.log("queued", data.id);

  await bs.emails.send(message, { idempotencyKey: `welcome/${user.id}` });
  await bs.emails.send(message, { maxRetries: 0 });

  const got = await bs.emails.get(id);
  if (got.error instanceof NotFoundError) return null;
  if (got.error instanceof RateLimitError) console.log("retry in", got.error.retryAfter, "s");
  else if (got.error) throw got.error;

  const inboxId = "support@acme.dev";
  const agentStream = await bs.inboxes.events.streamInbox(inboxId, { types: "inbox.email.received" });
  if (agentStream.error) throw agentStream.error;
  for await (const item of agentStream.data) {
    if (item.event === "stream.gap") continue;
    if (item.event !== "inbox.email.received") continue;
    const { thread_id, email_id } = item.data.data;
    if (!thread_id || !email_id) continue;
    const email = await bs.inboxes.threads.emails.get(inboxId, thread_id, email_id);
    if (email.error) throw email.error;
    const answer = await draftAnswer(email.data.subject, email.data.text);
    const sent = await bs.inboxes.threads.emails.reply(
      inboxId,
      thread_id,
      email_id,
      { text: answer },
      { idempotencyKey: `reply/${email_id}` },
    );
    if (sent.error) throw sent.error;
  }

  const team = await bs.inboxes.events.stream(
    { types: "inbox.email.received,inbox.thread.created" },
    { lastEventId: saved },
  );
  if (team.error) throw team.error;
  for await (const _ of team.data) saved = team.data.lastEventId ?? undefined;

  try {
    const event = await verifyWebhook(await request.text(), request.headers, "whsec_...");
    if (event.type === "email.bounced") console.log(event.data);
  } catch (e) {
    if (!(e instanceof WebhookVerificationError)) throw e;
  }

  const inbox = await bs.inboxes.create({ username: "support", kind: "agent" });
  if (inbox.error) throw new Error(inbox.error.message);
  const opened = await bs.inboxes.events.streamInbox(inbox.data.email_address, {
    types: "inbox.email.received",
  });
  if (opened.error) throw new Error(opened.error.message);
  for await (const event of opened.data) console.log(event.id, event.event, event.data);

  const { data: code } = await bs.inboxes.codes.latest("support@acme.dev", {
    from: "example.com",
    wait: 30,
  });
  console.log(code?.code);

  const started = await bs.contacts.imports.create({
    file: csvText,
    column_map: { email: "Email", first_name: "First Name" },
    on_conflict: "skip",
  });
  if (started.error) throw started.error;
  const done = await bs.contacts.imports.get(started.data.id);
  console.log(done.data?.status);

  const signup = await new BillionSend().agent.signup({
    human_email: "owner@acme.dev",
    name: "Support agent",
  });
  if (signup.data) {
    const agent = new BillionSend(signup.data.api_key);
    console.log(agent.baseUrl, signup.data.inbox.email_address);
  }

  for await (const contact of bs.contacts.listAll({ limit: 100 })) console.log(contact.email);

  const configured = new BillionSend({
    apiKey: "bs_...",
    baseUrl: "https://api.billionsend.com",
    timeoutMs: 60_000,
    maxRetries: 2,
    fetch: customFetch,
    headers: { "x-my-header": "value" },
  });
  await configured.emails.send(message, { idempotencyKey: "welcome-1" });
}
