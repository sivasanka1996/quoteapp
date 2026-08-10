// Structured logging — the app's one eye.
//
// The point is not console noise. It is that when Dad says "it did not work",
// Siva can talk him through turning the flag on, reproducing it, and sending a
// file. Everything here is built around that single sentence.
//
// THE ONE RULE: nothing in this module may ever throw. Every call site is a
// catch block or a hot path, so a logger that can crash the app is strictly
// worse than no logger at all. Every public entry point is wrapped, every sink
// is guarded individually, and failure is silent by design.

import * as Buffer from "./buffer";
import { persist, loadPersisted } from "./idb";

export type LogLevel = "debug" | "info" | "warn" | "error";

// A closed union rather than a free string, so logs stay filterable and a typo
// cannot silently invent a new category.
export type LogScope =
  | "firestore"
  | "voice"
  | "image"
  | "calc"
  | "ui"
  | "pdf"
  | "worker";

export interface LogRecord {
  ts: number; // epoch ms — formatted only at export
  level: LogLevel;
  scope: LogScope;
  msg: string;
  data?: unknown; // already reduced to something structuredClone survives
  err?: { name: string; message: string; stack?: string };
}

export type Sink = (r: LogRecord) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const DEBUG_KEY = "quoteapp.debug";

/** The read half of storage — all `detectDebug` needs, and easy to fake. */
type ReadableStore = { getItem: (key: string) => string | null };

/**
 * Is verbose tracing on? Pure, so it can be tested without a browser.
 *
 * Two ways in, and the URL one is the reason this is not just a setting:
 * `?debug=1` is the only form Siva can talk Dad through over the phone. The
 * stored flag is what makes it survive the reload that follows.
 *
 * Storage access is wrapped because a private-mode browser throws on it rather
 * than returning null — and a diagnostic that crashes the app it is diagnosing
 * would be a poor joke.
 */
export function detectDebug(
  search: string,
  storage: ReadableStore | null
): boolean {
  try {
    if (/(?:^|[?&])debug=1(?:&|$)/.test(search)) return true;
  } catch {
    /* fall through to storage */
  }
  try {
    return storage?.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function readEnvironment(): boolean {
  try {
    return detectDebug(
      typeof location === "undefined" ? "" : location.search,
      typeof localStorage === "undefined" ? null : localStorage
    );
  } catch {
    return false;
  }
}

// Read once at module init: the flag must be live before the first log line,
// and re-reading it per call would put a storage hit in a hot path.
let debugEnabled = readEnvironment();

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/**
 * Turn verbose tracing on or off, and remember it.
 *
 * The in-memory switch stays the runtime source of truth; the write to storage
 * is what carries the choice across a reload.
 */
export function setDebug(on: boolean): void {
  debugEnabled = on;
  try {
    localStorage.setItem(DEBUG_KEY, on ? "1" : "0");
  } catch {
    /* no storage — the session still gets the flag, it just will not persist */
  }
}

const sinks: Sink[] = [];

/** Register an extra destination. Returns the unsubscribe. */
export function addSink(sink: Sink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

/**
 * Reduce arbitrary caller data to something that survives both
 * `structuredClone` (IndexedDB) and `JSON.stringify` (export).
 *
 * A round-trip through JSON is the cheapest way to get both at once: it drops
 * functions, flattens class instances and — the case that actually bites —
 * throws on a circular reference instead of poisoning the IDB write later,
 * where the failure would be far from its cause.
 */
function safeData(data: unknown): unknown {
  try {
    const json = JSON.stringify(data);
    return json === undefined ? String(data) : JSON.parse(json);
  } catch {
    return "[unserializable]";
  }
}

function normaliseError(err: unknown): LogRecord["err"] {
  try {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    return { name: "NonError", message: String(err) };
  } catch {
    return { name: "NonError", message: "[unprintable]" };
  }
}

/**
 * Mirror to the console, but only when the flag is on.
 *
 * Dad's phone gets a clean console; Siva with `?debug=1` gets everything live
 * without having to export a file first.
 */
function mirrorToConsole(r: LogRecord): void {
  try {
    if (!debugEnabled) return;
    const line = `[${r.scope}] ${r.msg}`;
    const method =
      r.level === "error"
        ? console.error
        : r.level === "warn"
          ? console.warn
          : console.log;
    method(line, r.data ?? "", r.err ?? "");
  } catch {
    /* a console that cannot print is not a reason to fail a save */
  }
}

function emit(
  level: LogLevel,
  scope: LogScope,
  msg: string,
  err?: unknown,
  data?: unknown
): void {
  try {
    if (LEVEL_RANK[level] < LEVEL_RANK.info && !debugEnabled) return;

    const r: LogRecord = { ts: Date.now(), level, scope, msg: String(msg) };
    if (data !== undefined) r.data = safeData(data);
    if (err !== undefined && err !== null) r.err = normaliseError(err);

    Buffer.push(r);
    persist(r);

    // Each sink is guarded on its own so one broken destination cannot stop
    // the others from receiving the record.
    for (const sink of sinks.slice()) {
      try {
        sink(r);
      } catch {
        /* a sink's problem is never the caller's problem */
      }
    }

    mirrorToConsole(r);
  } catch {
    /* THE ONE RULE — see the file header */
  }
}

/**
 * Pull earlier sessions' records back into the ring, ahead of this session's.
 *
 * Called once from `main.tsx`. It matters because the log worth reading is
 * usually the one from *before* the reload — a crash, a force-close, or Dad
 * simply killing the app and reopening it after something looked wrong.
 */
export async function restorePersistedLogs(): Promise<void> {
  try {
    const older = await loadPersisted();
    if (older.length > 0) Buffer.seed(older);
  } catch {
    /* an unreadable history is not worth a broken boot */
  }
}

export const log = {
  debug: (scope: LogScope, msg: string, data?: unknown) =>
    emit("debug", scope, msg, undefined, data),
  info: (scope: LogScope, msg: string, data?: unknown) =>
    emit("info", scope, msg, undefined, data),
  warn: (scope: LogScope, msg: string, data?: unknown) =>
    emit("warn", scope, msg, undefined, data),
  error: (scope: LogScope, msg: string, err?: unknown, data?: unknown) =>
    emit("error", scope, msg, err, data),
};
