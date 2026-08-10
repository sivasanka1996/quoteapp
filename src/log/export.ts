// Turning the ring buffer into a file Dad can send.
//
// This is the payoff for all of PI-5. A browser cannot write to a folder —
// there is no filesystem API that works on Android Chrome (spec D1/D2) — so
// the honest shape is a download with a name that says what it is and when it
// was taken. Dad taps "Export logs", the file lands in Downloads, and he
// shares it like any other file.

import type { LogLevel, LogRecord } from "./logger";
import * as Buffer from "./buffer";

/** Which slice of the log a file holds. */
export type ExportKind = "info" | "error";

/**
 * `quoteapp-error-2026-08-10T14-23-07.log`
 *
 * Colons are stripped because they are illegal in Windows filenames, and these
 * files get opened on a laptop. Seconds precision is enough to tell two
 * exports apart without making the name unreadable.
 */
export function logFileName(kind: ExportKind, when: Date = new Date()): string {
  let stamp: string;
  try {
    stamp = when.toISOString().slice(0, 19).replace(/:/g, "-");
  } catch {
    stamp = "unknown";
  }
  return `quoteapp-${kind}-${stamp}.log`;
}

const LEVEL_WIDTH = 5; // "DEBUG" / "ERROR" are the longest
const SCOPE_WIDTH = 9; // "firestore" is the longest

function renderData(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    return json === undefined ? String(data) : json;
  } catch {
    return "[unserializable]";
  }
}

/**
 * One record as one line, in fixed columns so the eye can scan down the level
 * and scope without reading every message:
 *
 * `2026-08-10T14:23:07.412Z  INFO   firestore  quote saved  {"id":"aBc123"}`
 */
export function formatLine(r: LogRecord): string {
  let ts: string;
  try {
    ts = new Date(r.ts).toISOString();
  } catch {
    ts = String(r.ts);
  }

  const parts = [
    ts,
    r.level.toUpperCase().padEnd(LEVEL_WIDTH),
    r.scope.padEnd(SCOPE_WIDTH),
    r.msg,
  ];
  let line = parts.join("  ");

  if (r.err) line += `  ${r.err.name}: ${r.err.message}`;
  if (r.data !== undefined) line += `  ${renderData(r.data)}`;
  return line;
}

/** The whole file body, one record per line, newest last. */
export function formatLog(records: LogRecord[]): string {
  if (records.length === 0) {
    return "no records — nothing has been logged in this session\n";
  }
  return records.map(formatLine).join("\n") + "\n";
}

const KIND_KEEPS: Record<ExportKind, LogLevel[]> = {
  // The file to read first: only what went wrong. A fired retry (warn) is
  // part of a failure story, so it belongs here too.
  error: ["warn", "error"],
  // The whole story, debug included when the flag captured it — otherwise
  // turning the flag on would add nothing to the file Dad sends.
  info: ["debug", "info", "warn", "error"],
};

export function selectRecords(
  records: LogRecord[],
  kind: ExportKind
): LogRecord[] {
  const keep = KIND_KEEPS[kind] ?? KIND_KEEPS.info;
  return records.filter((r) => keep.includes(r.level));
}

/**
 * Write the current buffer out as a download.
 *
 * Silent on failure like everything else in `src/log/` — but it returns the
 * record count so the caller can tell Dad "sent 431 lines" instead of leaving
 * him wondering whether the button did anything.
 */
export function exportLogs(kind: ExportKind): number {
  try {
    const records = selectRecords(Buffer.all(), kind);
    const blob = new Blob([formatLog(records)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = logFileName(kind);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on a delay: Android Chrome has been seen to start the download
    // asynchronously, and revoking immediately can cancel it.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* nothing to do about a URL that will not revoke */
      }
    }, 10_000);
    return records.length;
  } catch {
    return 0;
  }
}
