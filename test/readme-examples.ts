// The README's examples, kept here so `pnpm typecheck` fails when they drift from the SDK.
// Never executed.
import { BillionSend } from "../src/index.js";

export async function readmeExamples(
  customFetch: typeof fetch,
  message: Parameters<BillionSend["emails"]["send"]>[0],
) {
  const bs = new BillionSend("bs_...");

  const { data, error } = await bs.emails.send({
    from: "Acme <hello@acme.dev>",
    to: ["ana@example.com"],
    subject: "Welcome to Acme",
    html: "<p>Glad you are here.</p>",
  });
  if (error) console.error(error.statusCode, error.name, error.message);
  else console.log("queued", data.id);

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
