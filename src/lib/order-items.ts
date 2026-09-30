// src/lib/order-items.ts
//
// The same dish ordered in separate rounds lands as several order_items rows,
// so a summary built straight off the rows lists it once per row:
// "1× Test Item" twice instead of "2× Test Item". Every screen that shows an
// order's contents — the live board, order history, the customer drawer, the
// kitchen display — wants the collapsed view, so the rule lives here rather
// than being re-implemented per screen.
//
// Rows merge only when the dish, its unit price and any kitchen note all
// match. A "no chilli" round is a different line to the kitchen even though
// the dish name is identical, and two rows at different prices (a price change
// mid-service, a manual override) must not be folded into one — the line
// amount would then be wrong.
//
// This is display only. The rows in state stay untouched, so anything that
// writes back (Add items, the WhatsApp invoice, CSV export) still sees the
// real records.

/** Identity of a line: same dish, same unit price, same note. */
function lineKey(item: any): string {
  return [
    item?.menu_item_id ?? item?.item_id ?? item?.name ?? "",
    item?.price ?? item?.unit_price ?? "",
    item?.notes ?? item?.note ?? item?.special_instructions ?? "",
  ].join("|");
}

/**
 * Collapse duplicate order_items rows into one line each, summing quantities.
 * First-appearance order is preserved, and each merged line keeps the first
 * row's fields (including its id, which stays unique within the order and so
 * is still safe as a React key).
 */
export function mergeOrderItems<T extends Record<string, any>>(list: T[] | null | undefined): T[] {
  if (!list?.length) return [];
  const merged: T[] = [];
  const positions = new Map<string, number>();

  for (const item of list) {
    const key = lineKey(item);
    const at = positions.get(key);
    if (at === undefined) {
      positions.set(key, merged.length);
      merged.push({ ...item, quantity: Number(item.quantity) || 0 });
    } else {
      merged[at] = {
        ...merged[at],
        quantity: (Number(merged[at].quantity) || 0) + (Number(item.quantity) || 0),
      };
    }
  }
  return merged;
}

/** Same collapse, applied to a Record<orderId, rows> map. */
export function mergeOrderItemsMap<T extends Record<string, any>>(
  byOrder: Record<string, T[]>,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [orderId, list] of Object.entries(byOrder)) out[orderId] = mergeOrderItems(list);
  return out;
}

// ---------------------------------------------------------------------------
// Round detection — used by the live board and the kitchen display
// ---------------------------------------------------------------------------

export const NEW_ROUND_MARKER = "__nr__";

const ROUND_GRACE_MS = 30_000;

export function isNewRound(item: any, order: any): boolean {
  if (item?.notes === NEW_ROUND_MARKER) return true;
  if (!item?.created_at) return false;
  const ref = order?.served_at ?? order?.created_at;
  if (!ref) return false;
  return (
    new Date(item.created_at).getTime() - new Date(ref).getTime() > ROUND_GRACE_MS
  );
}

export function splitByRound<T extends Record<string, any>>(
  items: T[],
  order: any,
): { original: T[]; newRound: T[] } {
  const original: T[] = [];
  const newRound: T[] = [];
  for (const item of items) {
    (isNewRound(item, order) ? newRound : original).push(item);
  }
  return { original, newRound };
}

