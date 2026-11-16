import type { Result } from "./core.js";
import { BillionSendRequestError } from "./errors.js";

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
 * thrown as a {@link BillionSendRequestError}.
 */
export async function* paginate<Item extends { id: string }>(
  fetchPage: (cursor: Cursor) => Promise<Result<CursorPage<Item>>>,
  start: Cursor = {},
): AsyncGenerator<Item, void, undefined> {
  const backward = start.before !== undefined && start.before !== null;
  let cursor: Cursor = backward ? { before: start.before } : start.after ? { after: start.after } : {};
  while (true) {
    const page = await fetchPage(cursor);
    if (page.error !== null) throw new BillionSendRequestError(page.error);
    const items = page.data.data;
    for (const item of items) yield item;
    if (!page.data.has_more || items.length === 0) return;
    const edge = backward ? items[0] : items[items.length - 1];
    if (edge === undefined) return;
    cursor = backward ? { before: edge.id } : { after: edge.id };
  }
}
