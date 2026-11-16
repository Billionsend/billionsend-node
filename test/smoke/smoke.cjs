// Loads the built CommonJS entry through the package's own exports map.
const assert = require("node:assert/strict");
const sdk = require("billionsend");

assert.equal(typeof sdk.BillionSend, "function");
const bs = new sdk.BillionSend({ apiKey: "bs_smoke", baseUrl: "https://api.example.com/" });
assert.equal(bs.baseUrl, "https://api.example.com");
assert.equal(typeof bs.emails.send, "function");
assert.equal(typeof bs.inboxes.events.stream, "function");
assert.equal(sdk.VERSION, require("../../package.json").version);
assert.ok(
  new sdk.NotFoundError({ statusCode: 404, name: "not_found", message: "y" }) instanceof sdk.BillionSendError,
);

// The webhook vector, through the runtime's Web Crypto (Node 18 takes it from node:crypto).
const vector = {
  "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
  "webhook-timestamp": "1614265330",
  "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
sdk
  .verifyWebhook('{"test": 2432232314}', vector, "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", {
    now: new Date(1614265330 * 1000),
  })
  .then((event) => {
    assert.deepEqual(event, { test: 2432232314 });
    console.log(`cjs ok (node ${process.version})`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
