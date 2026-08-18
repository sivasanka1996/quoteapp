/**
 * One item moved to a new index, as a new array.
 *
 * Pages are badged p1/p2/p3 in the order they were picked, so photographing
 * page 3 first badges the whole order wrongly. Before this the only repair was
 * removing every page and re-adding them.
 *
 * Out-of-range indices return the list untouched rather than throwing: the
 * callers are ▲▼ buttons at the ends of a strip, and a disabled-button bug
 * should not be able to lose Dad's photos.
 */
export function movePage<T>(items: T[], from: number, to: number): T[] {
  if (!Array.isArray(items)) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;
  if (from === to) return items.slice();

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
