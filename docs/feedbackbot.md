# AI Feedback Bot

## Status
Built — not in the original five-area plan; added on request, see
[ROADMAP.md](ROADMAP.md).

## What it does
A floating "give feedback" button, visible on every screen to anyone using
the app, lets a person type a problem or a change they want (e.g. "the
discount field should start at 0, not blank"). That gets written to an open
`feedback` collection. A GitHub Actions workflow polls that collection every
15 minutes; when it finds a pending entry, it runs Claude Code against this
repo — reading `CLAUDE.md` and the relevant `docs/*.md` first, then making
the smallest safe code change, updating docs, and running the same
`lint`/`test`/`build` gate normal CI runs. If all three pass, it commits and
pushes straight to `main` itself, which triggers the existing
`deploy.yml` the same way a human push would. If anything fails, or the
feedback isn't a safe scoped change, it discards its work and marks the
entry failed with a reason — no code reaches `main` in that case.

There is **no human review step** before a fix goes live. That was an
explicit choice (see below), not an oversight.

## Key files
- `src/shared/FeedbackBot.tsx` + `.css` — the floating button + panel;
  textarea to submit, list of recent submissions (everyone's — the
  collection is public) with a status pill and the agent's one-line result
  once it's done
- `src/shared/useFeedback.ts` — `onSnapshot` on `feedback` + `addFeedback`,
  same shape as `useIdeas.ts`
- `src/types.ts` — `FeedbackStatus`/`FEEDBACK_STATUS_LABEL`, `FeedbackDoc`
- `src/AppRouter.tsx` — mounts `<FeedbackBot />` once, outside the route
  switch, so it's present on every screen
- `.github/workflows/ai-feedback.yml` — the agent workflow: polls, invokes
  `anthropics/claude-code-action@v1` with a prompt instructing the whole
  read → fix → test → commit → push → report-back loop, with a fallback step
  that marks the entry failed if the run itself errors out
- `scripts/ai-feedback/firestore.mjs` — tiny Firestore REST helpers (list,
  patch) — no `firebase-admin` dependency needed since `feedback` has
  `allow read, write: if true` like everything else today
- `scripts/ai-feedback/fetch-pending.mjs` — run by the workflow: finds the
  oldest pending (or stale `in_progress`, >20 min — a self-heal for a run
  that crashed mid-way) entry, claims it, writes its text to
  `ai-feedback/current.txt` for Claude to read
- `scripts/ai-feedback/set-status.mjs` — run by Claude itself, as its last
  step, to write `applied`/`failed` + a short result back onto the doc

## Decisions made
- **Fully automatic, no PR/review gate.** Siva's explicit call: feedback →
  live, in one pass, with no one checking the diff first. The only
  non-negotiable safety net kept is that `npm run lint`, `npm test`, and
  `npm run build` must all pass before anything is committed — that's a
  correctness floor, not a review step.
- **Public, for now.** Anyone using the app (not just Siva) can submit
  feedback, same as every other collection's current `allow read, write: if
  true`. Siva's own words: "everything is public for now, the other things
  can change later" — revisit alongside the handover auth work in
  `CLAUDE.md`.
- **Breaks the "everything free" lock.** `CLAUDE.md`'s locked decisions said
  Spark-plan-only, no paid services. This feature needs a paid
  `ANTHROPIC_API_KEY` (Siva already has one) — GitHub Actions minutes stay
  free (public repo), but each feedback item now costs real API spend. Noted
  as an explicit exception in `CLAUDE.md`, not a silent break of the rule.
- **Poll a Firestore collection, not a webhook.** Spark plan has no Cloud
  Functions, so there's no Firestore-trigger option. A `schedule`-triggered
  GitHub Actions workflow polling the public REST API is the free, no-new-
  infra way to bridge "a browser wrote a Firestore doc" to "a CI job should
  start." 15-minute interval balances responsiveness against 96 wasted-but-
  cheap polls/day when nothing's pending.
- **The agent pushes directly, not via the default `GITHUB_TOKEN`.** A push
  authenticated as the default Actions token would *not* trigger
  `deploy.yml`'s `on: push` (GitHub suppresses that to prevent workflow
  loops). `claude-code-action`, left to authenticate as the Claude GitHub
  App (no `github_token` input passed), pushes under the App's own identity
  instead — which does trigger downstream workflows. This is why `deploy.yml`
  fires on the bot's commits without any change to that file.
- **Prompt-injection is a known, accepted risk, mitigated but not solved.**
  The feedback text is public input that becomes literal instructions to a
  coding agent with push access. The workflow's prompt explicitly tells
  Claude to treat the feedback as a product request only, to refuse anything
  touching `.github/workflows/**`, `firestore.rules`, `src/firebase.ts`, any
  secret, or the bot's own files, and to fail closed (mark "failed", push
  nothing) when the request is unclear or out of scope. This reduces but
  does not eliminate the risk — see Open questions.
- **Self-healing claim, not a lock service.** `fetch-pending.mjs` marks a doc
  `in_progress` before handing it to Claude so two overlapping runs don't
  grab the same entry; if a run crashes without finishing, the doc is
  treated as abandoned and re-claimed after 20 minutes rather than stuck
  forever.
- **Scratch file, not a Firestore round-trip, for the feedback text.** The
  claimed entry's text is written to a local `ai-feedback/current.txt`
  (gitignored) instead of interpolated into the workflow YAML or the
  prompt string, so arbitrary feedback content never has to be escaped into
  a shell command or a GitHub Actions expression — it's just a file Claude
  reads with its normal Read tool, like any other file in the repo.

## Open questions / not yet decided
- No rate limiting — a burst of feedback submissions (accidental or not)
  queues up and each one costs a real Claude API run; worth a cap if this
  turns out to matter.
- No visible audit trail beyond each `feedback` doc's own `result`/
  `commitSha` fields and the Actions run log — fine for now, revisit if this
  needs a proper history view.
- Prompt-injection guardrails are instructions to the model, not hard
  enforcement (no sandboxing/branch-protection backstop). Acceptable at
  today's scale per Siva's "everything public for now" call; reconsider
  before this app has real customers/money flowing through it unattended.
- No distinction yet between Dad's feedback and anyone else's — once there's
  auth, worth deciding whether the bot should still act on feedback from
  people who aren't Dad or Siva.
