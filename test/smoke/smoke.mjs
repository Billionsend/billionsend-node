// Loads the built ES module entry through the package's own exports map, then
// makes one JSON call and reads one event stream against a local server, so the
// runtime's own fetch and streams are exercised (CI runs this on Node 18 and 20 too).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const sdk = await import("@billionsend/node");
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));

assert.equal(typeof sdk.BillionSend, "function");
const bs = new sdk.BillionSend("bs_smoke");
assert.equal(
  bs.baseUrl,
  (process.env.BILLIONSEND_BASE_URL || "https://api.billionsend.com").replace(/\/+$/, ""),
);
assert.equal(typeof bs.contacts.listAll, "function");
assert.equal(sdk.VERSION, pkg.version);

delete process.env.BILLIONSEND_API_KEY;
const keyless = await new sdk.BillionSend({ baseUrl: "https://api.example.com" }).agent.status();
assert.equal(keyless.error?.name, "missing_api_key");

const server = createServer((req, res) => {
  if (req.url === "/usage") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "usage", auth: req.headers.authorization }));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end('id: 1\nevent: inbox.email.received\ndata: {"ok":true}\n\n');
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const local = new sdk.BillionSend({
  apiKey: "bs_smoke",
  baseUrl: `http://127.0.0.1:${server.address().port}`,
});

const usage = await local.usage.get();
assert.deepEqual(usage.data, { object: "usage", auth: "Bearer bs_smoke" });

const opened = await local.inboxes.events.stream(undefined, { reconnect: false });
const events = [];
for await (const event of opened.data) events.push(event);
assert.deepEqual(
  events.map((e) => [e.id, e.event, e.data]),
  [["1", "inbox.email.received", { ok: true }]],
);

const verified = await sdk.verifyWebhook(
  '{"test": 2432232314}',
  {
    "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
    "webhook-timestamp": "1614265330",
    "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
  },
  "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  { now: new Date(1614265330 * 1000) },
);
assert.deepEqual(verified, { test: 2432232314 });

server.close();
console.log(`esm ok (node ${process.version})`);
