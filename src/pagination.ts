import type { Result } from "./core.js";
import { applicationError } from "./errors.js";

/** A cursor-paginated list page: `data` items carry an `id`, `has_more` says whether another page exists. */
export interface CursorPage<Item extends { id: string }> {
  data: Item[];
  has_more: boolean;
}

/** The cursor for the next page: `after` walks forward (the default), `before` walks backward. */
export interface Cursor {
  after?: string;
  before?: string;
}

/**
 * Walks a cursor-paginated list one item at a time, fetching pages on demand.
 * Starting with `before` set walks backward (using the first id of each page);
 * otherwise it walks forward from `after` (using the last id). A failed page is
 * thrown as its `BillionSendError` (the same classes the methods return). A
 * page without a `data` array throws a `BillionSendError` named
 * `application_error` at once; a page that has more but whose item to
 * continue from has no id (a non-empty string) hands out its items first, then
 * throws one.
 */
export async function* paginate<Item extends { id: string }>(
  fetchPage: (cursor: Cursor) => Promise<Result<CursorPage<Item>>>,
  start: Cursor = {},
): AsyncGenerator<Item, void, undefined> {
  const backward = start.before !== undefined && start.before !== null;
  let cursor: Cursor = backward ? { before: start.before } : start.after ? { after: start.after } : {};
  while (true) {
    const page = await fetchPage(cursor);
    if (page.error !== null) throw page.error;
    const body: unknown = page.data;
    const items: unknown =
      typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
    if (!Array.isArray(items)) throw applicationError("The list page has no data array");
    for (const item of items as Item[]) yield item;
    if (page.data.has_more !== true || items.length === 0) return;
    const edge: unknown = backward ? items[0] : items[items.length - 1];
    const id = typeof edge === "object" && edge !== null ? (edge as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || id === "") {
      throw applicationError(
        `The ${backward ? "first" : "last"} item of the list page has no id to continue from`,
      );
    }
    cursor = backward ? { before: id } : { after: id };
  }
}
