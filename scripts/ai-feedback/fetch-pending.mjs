// Run by .github/workflows/ai-feedback.yml. Finds the oldest actionable
// feedback doc (pending, or in_progress but stale — a previous run crashed
// mid-way), claims it by marking it in_progress, writes its text to
// ai-feedback/current.txt for Claude to read, and reports the doc id via
// $GITHUB_OUTPUT. See docs/feedbackbot.md.
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { listDocs, patchDoc } from "./firestore.mjs";

const STALE_MS = 20 * 60 * 1000; // an in_progress doc this old is treated as abandoned

function output(key, value) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main() {
  const docs = await listDocs("feedback");
  const now = Date.now();

  const actionable = docs.filter(
    (d) =>
      d.status === "pending" ||
      (d.status === "in_progress" && now - (d.updatedAt ?? 0) > STALE_MS)
  );

  if (actionable.length === 0) {
    output("has_pending", "false");
    return;
  }

  actionable.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const next = actionable[0];

  await patchDoc("feedback", next.id, { status: "in_progress", updatedAt: now });

  mkdirSync("ai-feedback", { recursive: true });
  writeFileSync("ai-feedback/current.txt", next.text ?? "");

  output("has_pending", "true");
  output("feedback_id", next.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
