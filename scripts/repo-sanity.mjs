/**
 * Repository sanity check — structure, strays, dead code and doc drift.
 *
 * Zero dependencies, no network, no Firestore, reads only. Safe to run any
 * time, and safe to run in CI. Deliberately NOT a `*.test.ts`: it is a
 * housekeeping report, not a correctness assertion about the app, and a red
 * result here must never block a deploy that ships correct arithmetic.
 *
 *   node scripts/repo-sanity.mjs           # report, exit 0 unless ERRORs
 *   node scripts/repo-sanity.mjs --strict  # exit 1 on WARN too
 *
 * Each check answers a question that was asked by hand during the 2026-08-19
 * repo review and would otherwise have to be re-derived from scratch.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const strict = process.argv.includes("--strict");

const findings = [];
const ok = (check, msg) => findings.push({ level: "OK", check, msg });
const warn = (check, msg) => findings.push({ level: "WARN", check, msg });
const err = (check, msg) => findings.push({ level: "ERROR", check, msg });

const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

// ---------------------------------------------------------------------------
// 1. Strays — directories that belong to no toolchain this project uses.
// ---------------------------------------------------------------------------
{
  const CHECK = "strays";
  // This is a Node/TypeScript project. package.json is the only manifest.
  // A Python virtualenv here is always an accident (CLAUDE.md says so too).
  const pyVenvs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(path.join(d.name, "pyvenv.cfg")))
    .map((d) => d.name);

  if (pyVenvs.length) {
    const sizes = pyVenvs.map((v) => `${v}/ (${dirSizeMB(v)} MB)`).join(", ");
    err(CHECK, `Python virtualenv in a Node project: ${sizes} — delete it`);
  } else {
    ok(CHECK, "no Python virtualenv");
  }

  // wrangler's build scratch. Gitignored, but it grows and it confuses greps
  // (bundled copies of our own worker look like real source).
  if (exists("cf-worker/.wrangler")) {
    warn(
      CHECK,
      `cf-worker/.wrangler/ present (${dirSizeMB("cf-worker/.wrangler")} MB) — ` +
        "build scratch, safe to delete; it shadows real source in grep results",
    );
  } else {
    ok(CHECK, "no wrangler scratch");
  }
}

// ---------------------------------------------------------------------------
// 2. Assets nobody references.
// ---------------------------------------------------------------------------
{
  const CHECK = "unused-assets";
  const referencedIn = tracked
    .filter((f) => /\.(ts|tsx|js|html|css|json|webmanifest)$/.test(f))
    .map((f) => read(f))
    .join("\n");

  // public/ is copied verbatim into dist/ AND swept into the PWA precache by
  // vite.config.ts's globPatterns. An unreferenced file here is downloaded and
  // cached on Dad's phone for nothing.
  const publicOrphans = tracked
    .filter((f) => f.startsWith("public/") && !f.includes(".well-known"))
    .filter((f) => !referencedIn.includes(path.basename(f)));

  if (publicOrphans.length) {
    const total = publicOrphans.reduce((n, f) => n + fileSize(f), 0);
    warn(
      CHECK,
      `${publicOrphans.length} unreferenced file(s) in public/ ship to production ` +
        `and enter the service-worker precache (${(total / 1024).toFixed(1)} KB): ` +
        publicOrphans.join(", "),
    );
  } else {
    ok(CHECK, "every public/ asset is referenced");
  }

  // src/assets is import-driven, so an unreferenced file is not bundled —
  // it is repo clutter only, not shipped weight.
  const srcOrphans = tracked
    .filter((f) => f.startsWith("src/assets/"))
    .filter((f) => !referencedIn.includes(path.basename(f)));

  if (srcOrphans.length) {
    const total = srcOrphans.reduce((n, f) => n + fileSize(f), 0);
    warn(
      CHECK,
      `${srcOrphans.length} unimported file(s) in src/assets/ ` +
        `(${(total / 1024).toFixed(1)} KB, not bundled — repo clutter): ` +
        srcOrphans.join(", "),
    );
  } else {
    ok(CHECK, "every src/assets file is imported");
  }
}

// ---------------------------------------------------------------------------
// 3. Module reachability — is anything in src/ orphaned?
// ---------------------------------------------------------------------------
{
  const CHECK = "dead-modules";
  const EXT = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
  const norm = (p) => path.relative(root, p).split(path.sep).join("/");

  const resolveSpec = (fromAbs, spec) => {
    if (!spec.startsWith(".")) return null;
    const base = path.resolve(path.dirname(fromAbs), spec);
    for (const e of EXT) {
      const c = base + e;
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return norm(c);
    }
    return null;
  };

  const walk = (entries) => {
    const seen = new Set(entries);
    const q = [...entries];
    while (q.length) {
      const abs = path.join(root, q.shift());
      if (!fs.existsSync(abs)) continue;
      const src = fs.readFileSync(abs, "utf8");
      const re = /(?:from\s*|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g;
      let m;
      while ((m = re.exec(src))) {
        const r = resolveSpec(abs, m[1]);
        if (r && !seen.has(r)) {
          seen.add(r);
          q.push(r);
        }
      }
    }
    return seen;
  };

  const appReach = walk(["src/main.tsx"]);
  const testReach = walk([
    ...tracked.filter((f) => /\.test\.(ts|tsx|js)$/.test(f)),
    "src/test-setup.ts",
  ]);
  const scriptReach = walk(tracked.filter((f) => /^scripts\/.*\.ts$/.test(f)));

  const orphans = tracked
    .filter((f) => /^(src|config)\/.*\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
    .filter((f) => !appReach.has(f) && !testReach.has(f) && !scriptReach.has(f));

  if (orphans.length) {
    err(CHECK, `module(s) nothing imports: ${orphans.join(", ")}`);
  } else {
    ok(CHECK, `all ${appReach.size} app modules reachable from src/main.tsx`);
  }

  // Shipped-but-untested is not a defect, but it is worth seeing.
  const untested = [...appReach]
    .filter((f) => /^(src|config)\//.test(f) && !testReach.has(f))
    .sort();
  if (untested.length) {
    warn(CHECK, `shipped with no test reaching them: ${untested.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Unused dependencies.
// ---------------------------------------------------------------------------
{
  const CHECK = "deps";
  const pkg = JSON.parse(read("package.json"));
  const corpus = tracked
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
    .map((f) => read(f))
    .join("\n");

  // Packages that are never imported by name and are not invoked by a script.
  // Type packages, plugins and configs are resolved by tooling, not imports.
  const toolingManaged = /^(@types\/|@eslint\/|eslint|typescript|globals|jsdom|vite$|vitest$|@vitejs\/|@testing-library\/)/;
  const scriptText = Object.values(pkg.scripts || {}).join(" ");

  const unused = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ].filter(
    (d) =>
      !toolingManaged.test(d) &&
      !corpus.includes(`"${d}"`) &&
      !corpus.includes(`'${d}'`) &&
      !corpus.includes(`${d}/`) &&
      !scriptText.includes(d),
  );

  if (unused.length) {
    warn(CHECK, `declared but never imported or invoked: ${unused.join(", ")}`);
  } else {
    ok(CHECK, "no obviously unused dependencies");
  }

  // firebase-tools is invoked via npx in deploy.yml and `npm run emulators`,
  // so its version floats — a deploy can pick up a different CLI than the one
  // last tested against.
  const wf = exists(".github/workflows/deploy.yml") ? read(".github/workflows/deploy.yml") : "";
  if ((wf + scriptText).includes("npx firebase-tools") && !(pkg.devDependencies || {})["firebase-tools"]) {
    warn(CHECK, "firebase-tools runs via npx (unpinned) but is not a devDependency");
  }
}

// ---------------------------------------------------------------------------
// 5. Config wiring — files that exist but nothing reads.
// ---------------------------------------------------------------------------
{
  const CHECK = "config-wiring";
  if (exists("firebase.json")) {
    const fb = JSON.parse(read("firebase.json"));
    const deployYml = exists(".github/workflows/deploy.yml")
      ? read(".github/workflows/deploy.yml")
      : "";

    if (exists("firestore.indexes.json") && !fb.firestore?.indexes) {
      const deploysIndexes = deployYml.includes("firestore:indexes");
      err(
        CHECK,
        "firestore.indexes.json exists but firebase.json has no `firestore.indexes` key" +
          (deploysIndexes
            ? " — yet deploy.yml deploys `firestore:indexes`. Wire it or drop both."
            : " — nothing reads it."),
      );
    } else {
      ok(CHECK, "firestore index config is consistent");
    }

    if (fb.hosting?.public && !exists(fb.hosting.public)) {
      warn(CHECK, `firebase.json hosting.public = "${fb.hosting.public}" (not built yet)`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Secrets — the repo is public, so this one matters.
// ---------------------------------------------------------------------------
{
  const CHECK = "secrets";
  const mustBeIgnored = [".env", ".env.local", "cf-worker/.dev.vars"];
  const leaked = mustBeIgnored.filter((f) => tracked.includes(f));
  if (leaked.length) {
    err(CHECK, `SECRET FILE IS TRACKED: ${leaked.join(", ")}`);
  } else {
    ok(CHECK, "no secret-bearing file is tracked");
  }

  // Key names must match between the real sheet and the committed template,
  // or standing up a new environment silently misses one.
  if (exists(".env") && exists(".env.example")) {
    const keys = (f) =>
      new Set(
        read(f)
          .split("\n")
          .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
          .filter(Boolean),
      );
    const a = keys(".env");
    const b = keys(".env.example");
    const onlyEnv = [...a].filter((k) => !b.has(k));
    const onlyEx = [...b].filter((k) => !a.has(k));
    if (onlyEnv.length || onlyEx.length) {
      warn(
        CHECK,
        `.env / .env.example key drift — only in .env: [${onlyEnv}], only in .env.example: [${onlyEx}]`,
      );
    } else {
      ok(CHECK, `.env and .env.example declare the same ${a.size} keys`);
    }
  }

  // A live-looking key committed anywhere in the working tree.
  const keyPat = /sk-or-v1-[A-Za-z0-9]{24,}|sk-[A-Za-z0-9]{40,}/;
  const hits = tracked.filter((f) => {
    if (!/\.(ts|tsx|js|mjs|json|md|toml|yml|yaml)$/.test(f)) return false;
    try {
      return keyPat.test(read(f));
    } catch {
      return false;
    }
  });
  if (hits.length) err(CHECK, `possible live API key in tracked file(s): ${hits.join(", ")}`);
  else ok(CHECK, "no live-looking API key in tracked files");
}

// ---------------------------------------------------------------------------
// 7. Documentation drift — the counts docs assert vs the suite that exists.
// ---------------------------------------------------------------------------
{
  const CHECK = "doc-drift";
  // Count `it(`/`test(` across the suite. Verified exact against `vitest run`
  // on 2026-08-19 (327 = 327). It is exact only while the suite uses no
  // table-driven forms — `it.each` declares one call site but runs N cases —
  // so that is detected and the comparison loosened rather than lying.
  let actual = 0;
  let tableDriven = false;
  for (const f of tracked.filter((f) => /\.test\.(ts|tsx|js)$/.test(f))) {
    const text = read(f);
    actual += (text.match(/^\s*(it|test)\s*(\.\w+)?\s*\(/gm) || []).length;
    if (/\b(it|test|describe)\.each\b/.test(text)) tableDriven = true;
  }
  const tolerance = tableDriven ? actual * 0.1 : 0;

  // Only whole-suite claims. CLAUDE.md legitimately lists per-file counts
  // ("31 engine, 30 voiceParse, …"); flagging those would make this check
  // noise, and a noisy check gets ignored. These patterns each assert a total.
  const TOTAL_CLAIM = [
    /npm test\s+#\s*(\d{2,4})\s+(?:unit\s+)?tests/g, // README's command table
    /npm test\s+#\s*(\d{2,4})\s+tests\s*\(Vitest/g, // CLAUDE.md's command table
    /suite to \*?\*?(\d{2,4}) *\n? *tests?\*?\*?/g,
    /(\d{2,4})\s+tests?,\s*all\s+passing/g,
    /\*\*(\d{2,4})\s+tests?,\s*all\s+passing/g,
    /suite is (\d{2,4}) *\n? *tests\b/g, // TESTING.md prose
    /(\d{2,4}) tests · \d+ files/g, // DESIGN.md §12's tree header
  ];
  const claims = [];
  // TESTING.md and DESIGN.md were added to this list on 2026-08-20: TESTING.md
  // still claimed 222 and DESIGN.md §12 still claimed 215 while the suite had
  // reached 327, and nothing caught either because this check only read two
  // files. A count asserted anywhere is a count that can rot.
  for (const doc of ["README.md", "CLAUDE.md", "TESTING.md", "DESIGN.md"]) {
    if (!exists(doc)) continue;
    const text = read(doc);
    for (const re of TOTAL_CLAIM) {
      for (const m of text.matchAll(re)) claims.push({ doc, n: Number(m[1]) });
    }
  }
  const wrong = claims.filter((c) => Math.abs(c.n - actual) > tolerance);
  if (wrong.length) {
    const byDoc = {};
    for (const c of wrong) (byDoc[c.doc] ||= new Set()).add(c.n);
    warn(
      CHECK,
      `suite has ~${actual} tests; docs claim ` +
        Object.entries(byDoc)
          .map(([d, s]) => `${d}: ${[...s].sort((x, y) => x - y).join("/")}`)
          .join(", "),
    );
  } else {
    ok(CHECK, `test counts in docs agree with the suite (~${actual})`);
  }

  // CLAUDE.md is loaded into context every session, so its size is a running
  // cost paid on every run. The verification tables were split out to
  // docs/history/ on 2026-08-19 (133 KB -> 72 KB); this keeps that from
  // silently growing back.
  if (exists("CLAUDE.md")) {
    const kb = fileSize("CLAUDE.md") / 1024;
    const lines = read("CLAUDE.md").split("\n").length;
    const histKB = exists("docs/history")
      ? fs
          .readdirSync(path.join(root, "docs/history"))
          .reduce((n, f) => n + fileSize(`docs/history/${f}`), 0) / 1024
      : 0;
    const where = histKB
      ? ` (docs/history/ holds a further ${histKB.toFixed(0)} KB of evidence, correctly out of context)`
      : "";

    if (kb > 90) {
      warn(
        CHECK,
        `CLAUDE.md is ${kb.toFixed(0)} KB (~${lines} lines)${where} — read in full every ` +
          "session. Move receipts to docs/history/ and keep only what must be acted on. " +
          "See its own 'Keeping this file current' section.",
      );
    } else {
      ok(CHECK, `CLAUDE.md is ${kb.toFixed(0)} KB (~${lines} lines)${where}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Typecheck coverage — which tracked TS files does `npm run build` skip?
// ---------------------------------------------------------------------------
{
  const CHECK = "typecheck-coverage";
  // Read whatever the root solution file actually references, so adding or
  // removing a project config cannot silently drift from this check.
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const rootRefs = exists("tsconfig.json")
    ? (JSON.parse(stripComments(read("tsconfig.json"))).references || []).map((r) =>
        r.path.replace(/^\.\//, ""),
      )
    : [];

  const includes = [];
  const excludes = [];
  for (const tc of rootRefs) {
    if (!exists(tc)) continue;
    const json = JSON.parse(stripComments(read(tc)));
    includes.push(...(json.include || []));
    excludes.push(...(json.exclude || []));
  }

  // A file is covered if it sits under an include root and is not excluded.
  // Files merely imported by those roots are checked too, so this flags only
  // disconnected trees.
  const under = (f, i) => f === i || f.startsWith(i.replace(/\/?$/, "/"));
  const covered = (f) =>
    includes.some((i) => under(f, i)) && !excludes.some((e) => under(f, e));
  const uncovered = tracked.filter((f) => /\.(ts|tsx)$/.test(f) && !covered(f));

  // config/ is imported by src/, so tsc follows it even though no include
  // names it. Only scripts/ can be genuinely disconnected.
  const disconnected = uncovered.filter((f) => f.startsWith("scripts/"));
  if (disconnected.length) {
    const excluded = disconnected.filter((f) => excludes.some((e) => under(f, e)));
    const unlisted = disconnected.filter((f) => !excludes.some((e) => under(f, e)));
    if (unlisted.length) {
      warn(CHECK, `not typechecked and not declared as excluded: ${unlisted.join(", ")}`);
    }
    if (excluded.length) {
      // Deliberate and documented, but kept visible so it cannot quietly
      // become the norm.
      warn(
        CHECK,
        `typecheck excluded on purpose (see the comment in the tsconfig): ${excluded.join(", ")}`,
      );
    }
  } else {
    ok(CHECK, `every tracked .ts/.tsx is covered by ${rootRefs.length} tsconfig project(s)`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function fileSize(p) {
  try {
    return fs.statSync(path.join(root, p)).size;
  } catch {
    return 0;
  }
}

function dirSizeMB(rel) {
  let total = 0;
  const stack = [path.join(root, rel)];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else
        try {
          total += fs.statSync(p).size;
        } catch {
          /* unreadable, skip */
        }
    }
  }
  return (total / 1024 / 1024).toFixed(1);
}

const ICON = { OK: "  ok  ", WARN: " warn ", ERROR: "ERROR " };
let lastCheck = "";
console.log("\nRepository sanity check\n" + "=".repeat(60));
for (const f of findings) {
  if (f.check !== lastCheck) {
    console.log(`\n[${f.check}]`);
    lastCheck = f.check;
  }
  console.log(`  ${ICON[f.level]} ${f.msg}`);
}

const errors = findings.filter((f) => f.level === "ERROR").length;
const warns = findings.filter((f) => f.level === "WARN").length;
console.log("\n" + "=".repeat(60));
console.log(`${errors} error(s), ${warns} warning(s), ${findings.length - errors - warns} ok\n`);

process.exit(errors > 0 || (strict && warns > 0) ? 1 : 0);
