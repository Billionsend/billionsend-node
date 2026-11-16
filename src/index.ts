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
export { type BillionSendError, BillionSendRequestError } from "./errors.js";
export type * from "./generated/openapi.js";
export { type Cursor, type CursorPage, paginate } from "./pagination.js";
export type { BatchRequestOptions, BatchSendOptions, BatchValidation } from "./resource.js";
export type { SendEmailParams } from "./resources/emails.js";
export { EventStream, type EventStreamOptions, type ServerSentEvent } from "./sse.js";
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
