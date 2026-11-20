export { BillionSend } from "./client.js";
export {
  type BillionSendOptions,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  type IdempotentRequestOptions,
  type RequestOptions,
  type ResponseHeaders,
  type Result,
} from "./core.js";
export {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BillionSendError,
  ConflictError,
  type ErrorShape,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ValidationError,
  WebhookVerificationError,
} from "./errors.js";
export type * from "./generated/openapi.js";
export { type Cursor, type CursorPage, paginate } from "./pagination.js";
export type { BatchRequestOptions, BatchSendOptions, BatchValidation } from "./resource.js";
export type { UploadLogoParams } from "./resources/brand.js";
export type { CreateContactImportParams } from "./resources/contacts.js";
export type { EmailMetrics, SendEmailParams } from "./resources/emails.js";
export {
  EventStream,
  type EventStreamOptions,
  type InboxEventData,
  type InboxEventPayload,
  type InboxEventType,
  type InboxStreamEvent,
  type InboxStreamItem,
  STREAM_GAP_EVENT,
  type StreamGapEvent,
} from "./sse.js";
export type {
  ApiPath,
  HttpMethod,
  ListItem,
  PathParams,
  QueryParams,
  RequestBody,
  ResponseBody,
} from "./types.js";
export { VERSION } from "./version.js";
export {
  type VerifyWebhookOptions,
  verifyWebhook,
  WEBHOOK_TOLERANCE_SECONDS,
  type WebhookEvent,
  type WebhookEventType,
  type WebhookHeaders,
} from "./webhooks.js";
