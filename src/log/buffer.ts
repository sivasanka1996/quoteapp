// The in-memory ring of log records.
//
// Two caps, whichever bites first (spec §2.6): 2000 records or ~1 MB. The byte
// cap is not redundant with the record cap — one image-read log carrying a
// payload outweighs a thousand "quote saved" lines, and the point of the ring
// is a bounded footprint on Dad's phone, not a bounded count.

import type { LogRecord } from "./logger";
import { appConfig } from "../../config/app.config";

export const MAX_RECORDS = appConfig.log.maxRecords;
export const MAX_BYTES = appConfig.log.maxBytes;

/**
 * Rough byte cost of a record. JSON length is close enough for a budget, and
 * cannot be wrong in a way that matters — over-estimating just evicts early.
 *
 * Guarded because `data` is `unknown`: a caller can hand us something
 * `JSON.stringify` throws on, and nothing in this module may throw.
 */
function estimateBytes(r: LogRecord): number {
  try {
    return JSON.stringify(r)?.length ?? 0;
  } catch {
    return 200;
  }
}

const records: LogRecord[] = [];
let bytes = 0;

export function push(r: LogRecord): void {
  records.push(r);
  bytes += estimateBytes(r);

  // The `records.length > 1` guard keeps a single oversized record instead of
  // evicting down to nothing: a 2 MB record is still the most interesting
  // thing that happened, and dropping it would leave no trace of the event.
  while (
    records.length > MAX_RECORDS ||
    (bytes > MAX_BYTES && records.length > 1)
  ) {
    const dropped = records.shift();
    if (dropped) bytes -= estimateBytes(dropped);
  }
}

/** A copy — callers must not be able to corrupt the ring. */
export function all(): LogRecord[] {
  return records.slice();
}

export function clear(): void {
  records.length = 0;
  bytes = 0;
}

export function count(): number {
  return records.length;
}

/**
 * Put previously persisted records back, oldest first, ahead of anything
 * logged since this session started. Used once on boot by `idb.ts` so a log
 * survives the reload that a crash forces.
 */
export function seed(older: LogRecord[]): void {
  const current = records.slice();
  clear();
  for (const r of older) push(r);
  for (const r of current) push(r);
}
