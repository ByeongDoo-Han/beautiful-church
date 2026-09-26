import type { Item } from './model';

/** Ranges follow the displayed service order, including the starting card.
 * A covering range takes precedence over settings on cards inside that range.
 * Resolve from the list, rather than click history, so direct selection/reload agree. */
export function presentationRange(items: Item[], selectedId?: string) {
  const target = Math.max(0, items.findIndex(item => item.id === selectedId));
  for (let start = 0; start < items.length;) {
    const owner = items[start];
    const count = owner.presentationId ? owner.slideHoldCount ?? 1 : 1;
    const end = Math.min(items.length - 1, start + count - 1);
    if (target <= end) return { owner, start, end, position: target - start + 1, count: end - start + 1 };
    start = end + 1;
  }
  return undefined;
}
