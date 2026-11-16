// Called by the AI feedback agent itself (see the prompt in
// .github/workflows/ai-feedback.yml) as its last step, to report what it
// did back onto the feedback doc the frontend is watching.
//
// Usage:
//   node scripts/ai-feedback/set-status.mjs <docId> <applied|failed> [--result "text"] [--commit <sha>]
import { patchDoc } from "./firestore.mjs";

const [docId, status, ...rest] = process.argv.slice(2);

if (!docId || !["applied", "failed"].includes(status)) {
  console.error("Usage: set-status.mjs <docId> <applied|failed> [--result text] [--commit sha]");
  process.exit(1);
}

let result;
let commitSha;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--result") result = rest[++i];
  if (rest[i] === "--commit") commitSha = rest[++i];
}

const fields = { status, updatedAt: Date.now() };
if (result) fields.result = result.slice(0, 500);
if (commitSha) fields.commitSha = commitSha;

await patchDoc("feedback", docId, fields);
console.log(`feedback/${docId} -> ${status}`);
