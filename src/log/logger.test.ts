import { describe, it, expect, beforeEach } from "vitest";
import {
  log,
  setDebug,
  isDebugEnabled,
  addSink,
  detectDebug,
  type LogRecord,
} from "./logger";
import * as Buffer from "./buffer";

beforeEach(() => {
  Buffer.clear();
  setDebug(false);
});

describe("levels", () => {
  it("drops debug records when the flag is off", () => {
    log.debug("voice", "tokenized");
    expect(Buffer.all()).toHaveLength(0);
  });

  it("keeps debug records when the flag is on", () => {
    setDebug(true);
    log.debug("voice", "tokenized");
    expect(Buffer.all()).toHaveLength(1);
    expect(Buffer.all()[0].level).toBe("debug");
  });

  it("keeps info, warn and error whatever the flag says", () => {
    log.info("firestore", "quote saved");
    log.warn("firestore", "write queued");
    log.error("image", "read failed");
    expect(Buffer.all().map((r) => r.level)).toEqual(["info", "warn", "error"]);
  });

  it("records the scope and message it was given", () => {
    log.info("pdf", "shared", { pages: 1 });
    const r = Buffer.all()[0];
    expect(r.scope).toBe("pdf");
    expect(r.msg).toBe("shared");
    expect(r.data).toEqual({ pages: 1 });
    expect(typeof r.ts).toBe("number");
  });
});

describe("the debug flag", () => {
  it("reports its own state", () => {
    expect(isDebugEnabled()).toBe(false);
    setDebug(true);
    expect(isDebugEnabled()).toBe(true);
  });

  const noStore = { getItem: () => null };

  it("is on for ?debug=1 in the URL", () => {
    expect(detectDebug("?debug=1", noStore)).toBe(true);
    expect(detectDebug("?foo=bar&debug=1", noStore)).toBe(true);
  });

  it("is on for the stored flag", () => {
    expect(detectDebug("", { getItem: () => "1" })).toBe(true);
  });

  it("is off when neither says so", () => {
    expect(detectDebug("", noStore)).toBe(false);
    expect(detectDebug("?debug=0", noStore)).toBe(false);
    expect(detectDebug("?other=1", noStore)).toBe(false);
    expect(detectDebug("", { getItem: () => "0" })).toBe(false);
  });

  it("is off, not a crash, with no storage at all", () => {
    expect(detectDebug("", null)).toBe(false);
  });

  // Safari in private mode throws on localStorage access rather than
  // returning null. Dad is on Android Chrome, but this costs one try/catch.
  it("is off, not a crash, when storage throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => detectDebug("", hostile)).not.toThrow();
    expect(detectDebug("", hostile)).toBe(false);
  });

  it("still honours the URL when storage throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(detectDebug("?debug=1", hostile)).toBe(true);
  });
});

describe("error normalisation", () => {
  it("turns an Error into name, message and stack", () => {
    log.error("image", "read failed", new TypeError("Failed to fetch"));
    const err = Buffer.all()[0].err;
    expect(err?.name).toBe("TypeError");
    expect(err?.message).toBe("Failed to fetch");
    expect(typeof err?.stack).toBe("string");
  });

  it("survives a thrown non-Error", () => {
    log.error("worker", "boom", "just a string");
    const err = Buffer.all()[0].err;
    expect(err?.message).toBe("just a string");
    expect(err?.name).toBeTruthy();
  });

  it("leaves err unset when none was passed", () => {
    log.error("ui", "no exception here");
    expect(Buffer.all()[0].err).toBeUndefined();
  });
});

describe("the ring buffer", () => {
  it("evicts the oldest record at the 2000 cap, newest last", () => {
    for (let i = 0; i < 2100; i++) log.info("ui", `msg ${i}`);
    const all = Buffer.all();
    expect(all).toHaveLength(Buffer.MAX_RECORDS);
    expect(all[0].msg).toBe("msg 100");
    expect(all[all.length - 1].msg).toBe("msg 2099");
  });

  it("evicts on the byte cap before the record cap is reached", () => {
    const big = "x".repeat(300_000);
    for (let i = 0; i < 6; i++) log.info("image", `page ${i}`, { blob: big });
    const all = Buffer.all();
    expect(all.length).toBeLessThan(6);
    expect(all[all.length - 1].msg).toBe("page 5");
  });

  it("keeps a single oversized record rather than evicting to nothing", () => {
    log.info("image", "one huge one", { blob: "x".repeat(2_000_000) });
    expect(Buffer.all()).toHaveLength(1);
  });

  it("clear() empties it", () => {
    log.info("ui", "a");
    Buffer.clear();
    expect(Buffer.all()).toHaveLength(0);
  });

  it("hands out a copy, so a caller cannot corrupt the ring", () => {
    log.info("ui", "a");
    Buffer.all().push({} as LogRecord);
    expect(Buffer.all()).toHaveLength(1);
  });
});

describe("sinks", () => {
  it("passes each record to a registered sink", () => {
    const seen: LogRecord[] = [];
    const off = addSink((r) => seen.push(r));
    log.info("ui", "hello");
    off();
    log.info("ui", "after unsubscribe");
    expect(seen).toHaveLength(1);
    expect(seen[0].msg).toBe("hello");
  });

  // The whole safety argument for logging from inside catch blocks: if the
  // logger can throw, every catch block becomes a new crash site.
  it("does not let a throwing sink escape log.info", () => {
    addSink(() => {
      throw new Error("sink is broken");
    });
    expect(() => log.info("ui", "still fine")).not.toThrow();
    expect(Buffer.all()).toHaveLength(1);
  });

  it("does not let unserialisable data escape either", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => log.info("ui", "circular", circular)).not.toThrow();
    expect(Buffer.all()).toHaveLength(1);
  });
});
