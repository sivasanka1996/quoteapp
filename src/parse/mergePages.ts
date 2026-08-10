// Several photos of one order list → one confirm list.
//
// Pure and separate from the component because the interesting behaviour is
// partial failure, and that is worth pinning down with tests rather than
// discovering in a shop. Reading is sequential — one call per page, never
// batched (spec §5.2): a long list already sits against a single 8192-token
// ceiling, which is the first suspect for an empty read, and batching would
// make that known risk worse to save a few cents.

import type { ReadItem } from "../readImage";
import { log } from "../log/logger";

/** One page's outcome. A page that read zero items still counts as read. */
export type PageResult =
  | { ok: true; items: ReadItem[] }
  | { ok: false; error: string };

/** A read item, plus which photo it came from. */
export interface TaggedItem extends ReadItem {
  /** 1-based, because it is shown to Dad as "p2". */
  page: number;
}

export interface MergedPages {
  items: TaggedItem[];
  /** 1-based page numbers that could not be read, in order. */
  failed: number[];
}

/**
 * Flatten page results into one list, in page order, each item badged with the
 * page it came from.
 *
 * A failed page does not lose the others. That is the whole point: losing a
 * five-page order to one blurry photo is the failure Dad would actually hit,
 * and re-shooting one page is a much smaller ask than re-shooting all of them.
 */
export function mergePages(pages: PageResult[]): MergedPages {
  const items: TaggedItem[] = [];
  const failed: number[] = [];

  pages.forEach((page, index) => {
    const pageNumber = index + 1;

    if (!page?.ok) {
      failed.push(pageNumber);
      return;
    }

    // Defensive: a provider is contracted to return an array, but this list is
    // what Dad is about to price, so a malformed page is treated as a failed
    // one rather than allowed to throw mid-merge and lose every page.
    if (!Array.isArray(page.items)) {
      log.warn("image", "page returned no item array", { page: pageNumber });
      failed.push(pageNumber);
      return;
    }

    for (const item of page.items) {
      items.push({ ...item, page: pageNumber });
    }
  });

  if (pages.length > 1 || failed.length > 0) {
    log.info("image", "pages merged", {
      pageCount: pages.length,
      itemCount: items.length,
      failed,
    });
  }

  return { items, failed };
}
