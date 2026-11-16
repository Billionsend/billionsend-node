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
  InboxStreamItem,
  Result,
  SendEmailRequest,
  SendEmailResponse,
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

  it("narrows errors by class", () => {
    type E = Extract<Awaited<ReturnType<BillionSend["usage"]["get"]>>, { data: null }>["error"];
    expectTypeOf<E["requestId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<E["statusCode"]>().toEqualTypeOf<number | null>();
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
    expectTypeOf<EventStream>().toMatchTypeOf<AsyncIterable<InboxStreamItem>>();
    // Narrowing on `event` gives the gap its own data and every other event the payload.
    const narrow = (item: InboxStreamItem) =>
      item.event === "stream.gap" ? item.data.reason : item.data.data.email_id;
    expectTypeOf(narrow).returns.toEqualTypeOf<string | undefined>();
  });
});
