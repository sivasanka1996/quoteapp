// Log persistence, so a log survives the reload that a crash forces.
//
// IndexedDB rather than localStorage for one concrete reason: localStorage is
// synchronous, so every log line would block the main thread — and PI-5 adds
// log lines to the save path. Firestore already keeps its cache in IDB, so
// this adds no new storage technology to the app.
//
// Same rule as the rest of `src/log/`: nothing here may throw, and nothing here
// may reject. A browser in private mode refuses `indexedDB.open` outright, and
// that has to be survivable — the app keeps working, it just keeps no log.

import type { LogRecord } from "./logger";
import { MAX_RECORDS } from "./buffer";

const DB_NAME = "quoteapp-logs";
const STORE = "records";
const VERSION = 1;

/** Is there an IndexedDB to talk to at all? False under Vitest's node env. */
function available(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

// One connection, opened at most once. `null` means "unavailable, stop trying"
// — a private-mode browser will refuse every time, and retrying per log line
// would be a steady trickle of rejected promises.
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (!available()) return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { autoIncrement: true });
          }
        } catch {
          /* the onsuccess/onerror pair below still settles the promise */
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// Records are batched rather than written one transaction each. A voice parse
// with debug on emits a dozen lines in a few milliseconds; one transaction per
// line would be pure jank on a phone for no diagnostic gain.
const FLUSH_MS = 1000;
let pending: LogRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  const batch = pending;
  pending = [];
  flushTimer = null;
  if (batch.length === 0) return;

  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const r of batch) {
      try {
        store.add(r);
      } catch {
        /* one unclonable record must not lose the rest of the batch */
      }
    }
    tx.onerror = () => {};
  } catch {
    /* the log is a diagnostic, never a reason to fail the thing being logged */
  }
}

/**
 * Queue a record for persistence. Fire-and-forget by design — no caller ever
 * waits on a log write, and no caller ever learns that one failed.
 */
export function persist(r: LogRecord): void {
  try {
    if (!available()) return;
    pending.push(r);
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        void flush();
      }, FLUSH_MS);
    }
  } catch {
    /* see the file header */
  }
}

/**
 * Everything persisted by earlier sessions, oldest first, trimmed to the ring's
 * cap. Resolves to `[]` rather than rejecting when there is no usable database.
 */
export async function loadPersisted(): Promise<LogRecord[]> {
  try {
    const db = await openDb();
    if (!db) return [];

    const records = await new Promise<LogRecord[]>((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as LogRecord[]) ?? []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    if (records.length > MAX_RECORDS) {
      void trimToCap(db, records.length - MAX_RECORDS);
      return records.slice(-MAX_RECORDS);
    }
    return records;
  } catch {
    return [];
  }
}

/**
 * Drop the oldest `excess` rows. Trimming happens on open rather than on write
 * because the store is append-only in the hot path — doing it here keeps the
 * cost off every log line and pays it once per session.
 */
function trimToCap(db: IDBDatabase, excess: number): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      let remaining = excess;
      const req = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .openCursor();
      req.onsuccess = () => {
        try {
          const cursor = req.result;
          if (!cursor || remaining <= 0) return resolve();
          cursor.delete();
          remaining -= 1;
          cursor.continue();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Empty the store. Used by the "Clear logs" control in settings. */
export async function clearPersisted(): Promise<void> {
  try {
    pending = [];
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const req = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    /* nothing to clear is indistinguishable from cleared, for our purposes */
  }
}
