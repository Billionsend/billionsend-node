// Compile-time checks: method signatures follow the generated OpenAPI types.
import { describe, expectTypeOf, it } from "vitest";
import type {
  BillionSend,
  BillionSendError,
  DomainDeliverability,
  EventStream,
  GetDomainResponse,
  Inbox,
  InboxDraft,
  InboxEventType,
  InboxSentEmail,
  InboxStreamItem,
  Result,
  SendEmailRequest,
  SendEmailResponse,
  UsageResponse,
} from "../src/index.js";

type Data<T> = T extends Promise<Result<infer D>> ? D : never;

describe("types", () => {
  it("binds requests and answers to the schema types", () => {
    expectTypeOf<Parameters<BillionSend["emails"]["send"]>[0]>().toEqualTypeOf<SendEmailRequest>();
    expectTypeOf<Data<ReturnType<BillionSend["emails"]["send"]>>>().toEqualTypeOf<SendEmailResponse>();
    expectTypeOf<Data<ReturnType<BillionSend["domains"]["verify"]>>>().toEqualTypeOf<GetDomainResponse>();
    expectTypeOf<Data<ReturnType<BillionSend["inboxes"]["create"]>>>().toEqualTypeOf<Inbox>();
  });

  it("types usage as the emails / contacts / domains report", () => {
    type Usage = Data<ReturnType<BillionSend["usage"]["get"]>>;
    expectTypeOf<Usage>().toEqualTypeOf<UsageResponse>();
    expectTypeOf<Usage["emails"]["daily"]["limit"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Usage["emails"]["daily"]["resets_at"]>().toEqualTypeOf<string>();
    expectTypeOf<Usage["emails"]["monthly"]["overage_enabled"]>().toEqualTypeOf<boolean>();
    // the old limits.emails_per_day shape is gone
    expectTypeOf<Usage>().not.toHaveProperty("limits");
  });

  it("unions the answers of operations with several 2xx bodies", () => {
    expectTypeOf<Data<ReturnType<BillionSend["inboxes"]["send"]>>>().toEqualTypeOf<
      InboxSentEmail | InboxDraft
    >();
  });

  it("types a suppression as an address or a domain", () => {
    type Entry = Data<ReturnType<BillionSend["suppressions"]["get"]>>;
    expectTypeOf<Entry["email"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Entry["domain"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Entry["kind"]>().toEqualTypeOf<"email" | "domain">();
    expectTypeOf<Entry["removable"]>().toEqualTypeOf<boolean>();
    type Listed = BillionSend["suppressions"]["listAll"] extends (...args: never[]) => AsyncGenerator<infer I>
      ? I
      : never;
    expectTypeOf<Listed["email"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Listed["removable"]>().toEqualTypeOf<boolean>();
    type Create = Parameters<BillionSend["suppressions"]["create"]>[0];
    expectTypeOf<Create["email"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Create["domain"]>().toEqualTypeOf<string | undefined>();
    type Batch = Parameters<BillionSend["suppressions"]["batch"]["add"]>[0];
    expectTypeOf<Batch["emails"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<Batch["domains"]>().toEqualTypeOf<string[] | undefined>();
    type Query = NonNullable<Parameters<BillionSend["suppressions"]["list"]>[0]>;
    expectTypeOf<Query["kind"]>().toEqualTypeOf<"email" | "domain" | "all" | undefined>();
  });

  it("types the deliverability report with one standing per sending domain", () => {
    type Report = Data<ReturnType<BillionSend["deliverability"]["get"]>>;
    expectTypeOf<Report["domains"]>().toEqualTypeOf<DomainDeliverability[]>();
    expectTypeOf<DomainDeliverability["domain_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<DomainDeliverability["status"]>().toEqualTypeOf<"ok" | "warning" | "paused">();
    expectTypeOf<DomainDeliverability["tier"]>().toEqualTypeOf<
      "ok" | "warning" | "paused" | "insufficient"
    >();
    expectTypeOf<DomainDeliverability["paused_by"]>().toEqualTypeOf<"domain" | "team" | "both" | null>();
    expectTypeOf<DomainDeliverability["pause_margin"]>().toEqualTypeOf<number>();
  });

  it("follows the webhook event enum for inbox stream events", () => {
    expectTypeOf<"inbox.thread.assigned">().toMatchTypeOf<InboxEventType>();
    expectTypeOf<"inbox.thread.unassigned">().toMatchTypeOf<InboxEventType>();
    expectTypeOf<"email.received">().toMatchTypeOf<InboxEventType>();
    expectTypeOf<"email.sent">().not.toMatchTypeOf<InboxEventType>();
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
