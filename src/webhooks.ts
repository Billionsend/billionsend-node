import { WebhookVerificationError } from "./errors.js";
import type { CreateWebhookRequest } from "./generated/openapi.js";

/** Every webhook event name. */
export type WebhookEventType = NonNullable<CreateWebhookRequest["events"]>[number];

/** A verified webhook delivery's body. */
export interface WebhookEvent {
  type: WebhookEventType;
  created_at: string;
  data: Record<string, unknown>;
}

/** The request headers, as a `Headers` object or a plain object (any case; Node's `IncomingHttpHeaders` works). */
export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /** How far the `webhook-timestamp` may be from now, in seconds (default 300). */
  tolerance?: number;
  /** The time to check the timestamp against (default: now). */
  now?: Date;
}

/** The default `tolerance`, in seconds. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const SECRET_PREFIX = "whsec_";
const SECRET_MIN_BYTES = 24;
const SECRET_MAX_BYTES = 64;

function header(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as Headers).get === "function" && typeof (headers as Headers).forEach === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (key.toLowerCase() !== name) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The key of a `whsec_` secret: canonical base64 of 24 to 64 bytes, as the dashboard and the API hand it out. */
function secretKey(secret: string): Uint8Array<ArrayBuffer> {
  // A secret read from an environment variable or a file often carries a trailing newline.
  const text = secret.trim();
  const encoded = text.startsWith(SECRET_PREFIX) ? text.slice(SECRET_PREFIX.length) : null;
  const key = encoded === null ? null : decodeBase64(encoded);
  if (
    encoded === null ||
    key === null ||
    key.length < SECRET_MIN_BYTES ||
    key.length > SECRET_MAX_BYTES ||
    encodeBase64(key) !== encoded
  ) {
    throw new WebhookVerificationError("The webhook secret is not a whsec_ secret");
  }
  return key;
}

async function subtleCrypto(): Promise<SubtleCrypto> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (subtle) return subtle;
  // Node.js 18 keeps Web Crypto off the global object.
  const nodeCrypto = (await import("node:crypto")) as { webcrypto: Crypto };
  return nodeCrypto.webcrypto.subtle;
}

function bytesOf(payload: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof payload === "string") return new TextEncoder().encode(payload);
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.reduce((diff, byte, i) => diff | (byte ^ (b[i] as number)), 0) === 0;
}

/**
 * Verifies a webhook delivery and returns its parsed body.
 *
 * The signature is HMAC-SHA256 over `<webhook-id>.<webhook-timestamp>.<body>`
 * with the endpoint's `whsec_` secret, sent as `v1,<base64>` in
 * `webhook-signature`; during a secret rotation the header carries one
 * signature per secret, space-separated, and any of them matching is enough.
 * The timestamp (Unix seconds) must be within `tolerance` of now, so a
 * captured delivery cannot be replayed later.
 *
 * Pass the body exactly as it arrived (the raw text or bytes, before any JSON
 * parsing): re-serialised JSON does not verify.
 *
 * @throws WebhookVerificationError when a header is missing, the timestamp is
 *   out of tolerance, no signature matches, the secret is malformed, or the
 *   body is not JSON.
 *
 * ```ts
 * const event = await verifyWebhook(rawBody, request.headers, process.env.BILLIONSEND_WEBHOOK_SECRET);
 * if (event.type === "inbox.email.received") { ... }
 * ```
 */
export async function verifyWebhook(
  payload: string | Uint8Array | ArrayBuffer,
  headers: WebhookHeaders,
  secret: string,
  options: VerifyWebhookOptions = {},
): Promise<WebhookEvent> {
  const id = header(headers, "webhook-id")?.trim();
  const timestamp = header(headers, "webhook-timestamp")?.trim();
  const signature = header(headers, "webhook-signature")?.trim();
  if (!id || !timestamp || !signature) {
    throw new WebhookVerificationError(
      "Missing the webhook-id, webhook-timestamp or webhook-signature header",
    );
  }
  if (!/^\d+$/.test(timestamp)) throw new WebhookVerificationError("Invalid webhook-timestamp header");
  const tolerance = options.tolerance ?? WEBHOOK_TOLERANCE_SECONDS;
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const seconds = Number(timestamp);
  if (now - seconds > tolerance) throw new WebhookVerificationError("The webhook timestamp is too old");
  if (seconds - now > tolerance) throw new WebhookVerificationError("The webhook timestamp is too new");

  const body = bytesOf(payload);
  const subtle = await subtleCrypto();
  const key = await subtle.importKey("raw", secretKey(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  const expected = new Uint8Array(await subtle.sign("HMAC", key, signed));

  const matched = signature.split(/\s+/).some((candidate) => {
    const comma = candidate.indexOf(",");
    if (comma === -1 || candidate.slice(0, comma) !== "v1") return false;
    const given = decodeBase64(candidate.slice(comma + 1));
    return given !== null && equal(given, expected);
  });
  if (!matched) throw new WebhookVerificationError("No webhook signature matches");

  try {
    return JSON.parse(new TextDecoder().decode(body)) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError("The webhook body is not JSON");
  }
}
