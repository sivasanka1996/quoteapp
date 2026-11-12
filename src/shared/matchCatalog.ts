import { type ItemDoc } from "../types";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Up to `limit` catalog items whose name contains `query` — for the line-item autocomplete. */
export function findMatches(items: ItemDoc[], query: string, limit = 5): ItemDoc[] {
  const q = norm(query);
  if (!q) return [];
  return items.filter((it) => norm(it.name).includes(q)).slice(0, limit);
}

/**
 * The single catalog item whose name exactly matches `name` — used to
 * auto-fill cost for scanned (image/voice) items. Only fires when there's
 * no brand ambiguity; when the same name exists under multiple brands,
 * this returns null and Dad picks the right one via the line editor's
 * autocomplete instead.
 */
export function exactMatch(items: ItemDoc[], name: string): ItemDoc | null {
  const n = norm(name);
  if (!n) return null;
  const matches = items.filter((it) => norm(it.name) === n);
  return matches.length === 1 ? matches[0] : null;
}
