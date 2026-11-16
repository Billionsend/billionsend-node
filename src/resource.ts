import type { Core, IdempotentRequestOptions, RequestOptions } from "./core.js";
import type { paths } from "./generated/openapi.js";

/** Base class of every resource group. */
export abstract class Resource {
  protected readonly core: Core;

  constructor(core: Core) {
    this.core = core;
  }
}

/** `strict` (default) fails the whole batch on one invalid item; `permissive` writes the valid ones. */
export type BatchValidation = NonNullable<
  NonNullable<paths["/contacts/batch"]["post"]["parameters"]["header"]>["x-batch-validation"]
>;

export interface BatchRequestOptions extends RequestOptions {
  /** Sent as the `x-batch-validation` header. */
  batchValidation?: BatchValidation;
}

export interface BatchSendOptions extends IdempotentRequestOptions {
  /** Sent as the `x-batch-validation` header. */
  batchValidation?: BatchValidation;
}

export function idempotent(options: IdempotentRequestOptions | undefined) {
  return { idempotencyKey: options?.idempotencyKey, options };
}
