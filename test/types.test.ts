// Compile-time checks: method signatures follow the generated OpenAPI types.
import { describe, expectTypeOf, it } from "vitest";
import type {
  BillionSend,
  BillionSendError,
  EventStream,
  GetDomainResponse,
  Inbox,
  InboxDraft,
  InboxSentEmail,
  Result,
  SendEmailRequest,
  SendEmailResponse,
  ServerSentEvent,
} from "../src/index.js";

type Data<T> = T extends Promise<Result<infer D>> ? D : never;

describe("types", () => {
  it("binds requests and answers to the schema types", () => {
    expectTypeOf<Parameters<BillionSend["emails"]["send"]>[0]>().toEqualTypeOf<SendEmailRequest>();
    expectTypeOf<Data<ReturnType<BillionSend["emails"]["send"]>>>().toEqualTypeOf<SendEmailResponse>();
    expectTypeOf<Data<ReturnType<BillionSend["domains"]["verify"]>>>().toEqualTypeOf<GetDomainResponse>();
    expectTypeOf<Data<ReturnType<BillionSend["inboxes"]["create"]>>>().toEqualTypeOf<Inbox>();
  });

  it("unions the answers of operations with several 2xx bodies", () => {
    expectTypeOf<Data<ReturnType<BillionSend["inboxes"]["send"]>>>().toEqualTypeOf<
      InboxSentEmail | InboxDraft
    >();
  });

  it("types the result as a data/error union", () => {
    type R = Awaited<ReturnType<BillionSend["usage"]["get"]>>;
    expectTypeOf<Extract<R, { error: null }>["error"]>().toEqualTypeOf<null>();
    expectTypeOf<Extract<R, { data: null }>["error"]>().toEqualTypeOf<BillionSendError>();
  });

  it("keeps API field names and enums", () => {
    type Metrics = NonNullable<Parameters<BillionSend["emails"]["metrics"]>[0]>;
    expectTypeOf<Metrics["granularity"]>().toEqualTypeOf<
      "hourly" | "daily" | "weekly" | "monthly" | undefined
    >();
    // @ts-expect-error: unknown query parameters are refused at compile time
    const bad: Metrics = { page: 2 };
    void bad;
  });

  it("yields list items and stream events", () => {
    type Item = BillionSend["contacts"]["listAll"] extends (...args: never[]) => AsyncGenerator<infer I>
      ? I
      : never;
    expectTypeOf<Item["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Data<ReturnType<BillionSend["inboxes"]["events"]["stream"]>>>().toEqualTypeOf<EventStream>();
    expectTypeOf<EventStream>().toMatchTypeOf<AsyncIterable<ServerSentEvent>>();
  });
});
