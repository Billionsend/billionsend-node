// Loads the built CommonJS entry through the package's own exports map.
const assert = require("node:assert/strict");
const sdk = require("billionsend");

assert.equal(typeof sdk.BillionSend, "function");
const bs = new sdk.BillionSend({ apiKey: "bs_smoke", baseUrl: "https://api.example.com/" });
assert.equal(bs.baseUrl, "https://api.example.com");
assert.equal(typeof bs.emails.send, "function");
assert.equal(typeof bs.inboxes.events.stream, "function");
assert.equal(sdk.VERSION, require("../../package.json").version);
assert.ok(new sdk.BillionSendRequestError({ statusCode: 400, name: "x", message: "y" }) instanceof Error);
console.log("cjs ok");
