import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BillionSendError, verifyWebhook, WebhookVerificationError } from "../src/index.js";

// The known-answer vector the API's own signing test pins (Standard Webhooks).
const VECTOR = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: "1614265330",
  payload: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const AT = new Date(Number(VECTOR.timestamp) * 1000);

const headersOf = (signature = VECTOR.signature, timestamp = VECTOR.timestamp) => ({
  "webhook-id": VECTOR.id,
  "webhook-timestamp": timestamp,
  "webhook-signature": signature,
});

/** Signs as the API does, with Node's own HMAC as an independent check. */
function sign(secret: string, id: string, timestamp: string, payload: string): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
}

async function failure(promise: Promise<unknown>): Promise<WebhookVerificationError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(WebhookVerificationError);
  expect(error).toBeInstanceOf(BillionSendError);
  return error as WebhookVerificationError;
}

describe("verifyWebhook", () => {
  it("verifies the published vector and returns the parsed body", async () => {
    const event = await verifyWebhook(VECTOR.payload, headersOf(), VECTOR.secret, { now: AT });
    expect(event).toEqual({ test: 2432232314 });
  });

  it("takes the body as bytes and the headers as a Headers object in any case", async () => {
    const headers = new Headers({
      "Webhook-Id": VECTOR.id,
      "WEBHOOK-TIMESTAMP": VECTOR.timestamp,
      "webhook-signature": VECTOR.signature,
    });
    const bytes = new TextEncoder().encode(VECTOR.payload);
    expect(await verifyWebhook(bytes, headers, VECTOR.secret, { now: AT })).toEqual({ test: 2432232314 });
    expect(await verifyWebhook(bytes.buffer, headers, VECTOR.secret, { now: AT })).toEqual({
      test: 2432232314,
    });
    // Node's IncomingHttpHeaders: lower-case keys, a value may be an array.
    const node = { ...headersOf(), "webhook-id": [VECTOR.id] };
    expect(await verifyWebhook(VECTOR.payload, node, VECTOR.secret, { now: AT })).toEqual({
      test: 2432232314,
    });
  });

  it("accepts any of the signatures a rotation sends, and refuses a v2 or a wrong one", async () => {
    const other = `whsec_${randomBytes(32).toString("base64")}`;
    const rotated = `${sign(other, VECTOR.id, VECTOR.timestamp, VECTOR.payload)} ${VECTOR.signature}`;
    expect(await verifyWebhook(VECTOR.payload, headersOf(rotated), VECTOR.secret, { now: AT })).toBeTruthy();
    expect(await verifyWebhook(VECTOR.payload, headersOf(rotated), other, { now: AT })).toBeTruthy();

    const wrongVersion = VECTOR.signature.replace("v1,", "v2,");
    expect(
      (await failure(verifyWebhook(VECTOR.payload, headersOf(wrongVersion), VECTOR.secret, { now: AT })))
        .message,
    ).toBe("No webhook signature matches");
    await failure(verifyWebhook(`${VECTOR.payload} `, headersOf(), VECTOR.secret, { now: AT }));
    await failure(verifyWebhook(VECTOR.payload, headersOf(), other, { now: AT }));
    await failure(verifyWebhook(VECTOR.payload, headersOf("v1,not base64!"), VECTOR.secret, { now: AT }));
  });

  it("refuses a timestamp outside the tolerance, either way", async () => {
    const late = new Date(AT.getTime() + 301_000);
    const early = new Date(AT.getTime() - 301_000);
    expect(
      (await failure(verifyWebhook(VECTOR.payload, headersOf(), VECTOR.secret, { now: late }))).message,
    ).toMatch(/too old/);
    expect(
      (await failure(verifyWebhook(VECTOR.payload, headersOf(), VECTOR.secret, { now: early }))).message,
    ).toMatch(/too new/);
    expect(
      await verifyWebhook(VECTOR.payload, headersOf(), VECTOR.secret, { now: late, tolerance: 600 }),
    ).toBeTruthy();
    await failure(
      verifyWebhook(VECTOR.payload, headersOf(VECTOR.signature, "16142e5"), VECTOR.secret, { now: AT }),
    );
  });

  it("verifies against the current time by default", async () => {
    const secret = `whsec_${randomBytes(24).toString("base64")}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = '{"type":"inbox.email.received","created_at":"2026-11-16T00:00:00.000Z","data":{}}';
    const event = await verifyWebhook(
      payload,
      {
        "webhook-id": "msg_1",
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(secret, "msg_1", timestamp, payload),
      },
      secret,
    );
    expect(event.type).toBe("inbox.email.received");
  });

  it("refuses missing headers, a malformed secret and a body that is not JSON", async () => {
    const { "webhook-signature": _, ...unsigned } = headersOf();
    await failure(verifyWebhook(VECTOR.payload, unsigned, VECTOR.secret, { now: AT }));
    for (const secret of [
      "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      "whsec_short",
      `whsec_${randomBytes(65).toString("base64")}`,
      "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaS",
    ]) {
      expect(
        (await failure(verifyWebhook(VECTOR.payload, headersOf(), secret, { now: AT }))).message,
        secret,
      ).toBe("The webhook secret is not a whsec_ secret");
    }
    const text = "not json";
    const signature = sign(VECTOR.secret, VECTOR.id, VECTOR.timestamp, text);
    const error = await failure(verifyWebhook(text, headersOf(signature), VECTOR.secret, { now: AT }));
    expect(error).toMatchObject({ name: "webhook_verification_error", statusCode: null, requestId: null });
  });
});
