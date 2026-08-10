import { describe, it, expect } from "vitest";
import { logFileName, formatLine, formatLog, selectRecords } from "./export";
import type { LogRecord } from "./logger";

const at = (iso: string): number => new Date(iso).getTime();

const rec = (over: Partial<LogRecord> = {}): LogRecord => ({
  ts: at("2026-08-10T14:23:07.412Z"),
  level: "info",
  scope: "firestore",
  msg: "quote saved",
  ...over,
});

describe("logFileName", () => {
  it("names the file by level and timestamp, to the second", () => {
    const when = new Date("2026-08-10T14:23:07.412Z");
    expect(logFileName("error", when)).toBe(
      "quoteapp-error-2026-08-10T14-23-07.log"
    );
    expect(logFileName("info", when)).toBe(
      "quoteapp-info-2026-08-10T14-23-07.log"
    );
  });

  // Colons are illegal in Windows filenames and Siva opens these on a laptop.
  it("carries no colons", () => {
    expect(logFileName("info", new Date())).not.toContain(":");
  });
});

describe("formatLine", () => {
  it("lays out timestamp, level, scope and message in fixed columns", () => {
    expect(formatLine(rec())).toBe(
      "2026-08-10T14:23:07.412Z  INFO   firestore  quote saved"
    );
  });

  it("appends data as JSON", () => {
    const line = formatLine(rec({ data: { id: "aBc123", queued: false } }));
    expect(line).toBe(
      '2026-08-10T14:23:07.412Z  INFO   firestore  quote saved  {"id":"aBc123","queued":false}'
    );
  });

  it("renders an error as name and message", () => {
    const line = formatLine(
      rec({
        ts: at("2026-08-10T14:23:11.887Z"),
        level: "error",
        scope: "image",
        msg: "read failed",
        err: { name: "TypeError", message: "Failed to fetch" },
      })
    );
    expect(line).toBe(
      "2026-08-10T14:23:11.887Z  ERROR  image      read failed  TypeError: Failed to fetch"
    );
  });

  it("keeps the columns aligned across every level and scope", () => {
    const levels = (["debug", "info", "warn", "error"] as const).map((level) =>
      formatLine(rec({ level }))
    );
    const msgColumn = levels.map((l) => l.indexOf("firestore"));
    expect(new Set(msgColumn).size).toBe(1);
  });

  it("does not throw on data it cannot stringify", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatLine(rec({ data: circular }))).not.toThrow();
  });
});

describe("formatLog", () => {
  it("writes one record per line, newest last", () => {
    const out = formatLog([
      rec({ msg: "first" }),
      rec({ ts: at("2026-08-10T14:24:00.000Z"), msg: "second" }),
    ]);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("first");
    expect(lines[1]).toContain("second");
  });

  it("ends with a newline, so the file is well-formed", () => {
    expect(formatLog([rec()]).endsWith("\n")).toBe(true);
  });

  it("says so rather than producing an empty file", () => {
    expect(formatLog([])).toContain("no records");
  });
});

describe("selectRecords", () => {
  const all = [
    rec({ level: "debug", msg: "d" }),
    rec({ level: "info", msg: "i" }),
    rec({ level: "warn", msg: "w" }),
    rec({ level: "error", msg: "e" }),
  ];

  // "error" is the file Siva reads first — it should hold only what went
  // wrong. warn belongs there too: a fired retry is part of a failure story.
  it("error keeps warn and error only", () => {
    expect(selectRecords(all, "error").map((r) => r.msg)).toEqual(["w", "e"]);
  });

  // "info" is the whole story, debug included when the flag captured it —
  // otherwise turning the flag on would produce nothing extra to send.
  it("info keeps everything", () => {
    expect(selectRecords(all, "info").map((r) => r.msg)).toEqual([
      "d",
      "i",
      "w",
      "e",
    ]);
  });
});
