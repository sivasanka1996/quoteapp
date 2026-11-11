# Deploy & ops runbook

## Releasing the web app

Push to `main` → `.github/workflows/deploy.yml` runs automatically:
1. `npm ci`
2. `npm test`
3. `npm run build` (with `VITE_IMAGE_PROXY_URL` baked in — see
   [CONFIG.md](CONFIG.md))
4. `firebase-tools deploy --only hosting,firestore:rules,firestore:indexes`
   to project `quoteapp-3f48e`, using the `FIREBASE_TOKEN` repo secret.

Nothing manual needed for a normal web release — just push.

## Building and releasing the Android APK

Manual, on demand (not triggered by every push):
1. GitHub → Actions → **Build Android APK** → Run workflow.
2. Download the built artifact from the completed run.
3. Create (or update) a GitHub Release and attach the APK as
   `app-debug.apk`.
4. Update `src/appInfo.ts`: `APP_VERSION` and `APK_URL` must point at the
   release you just created — **check these two match** before publishing;
   see the open item in `CLAUDE.md` about them drifting apart.

The Android project itself isn't committed to the repo — it's generated in
CI via Gradle/TWA (Trusted Web Activity), wrapping the hosted web app. Uses
`assembleDebug` (sideload only, not a Play Store build).

Firebase Spark blocks hosting executable files, which is why the APK lives
on GitHub Releases instead of Firebase Hosting.

## Rotating the Gemini / Cloudflare Worker key

```
cd cf-worker
npx wrangler secret put GEMINI_API_KEY   # paste the new key when prompted
npx wrangler deploy                      # redeploy so the worker picks it up
```
No frontend change needed — the worker URL doesn't change, only the secret
behind it.

## Rolling back a bad deploy

- **Web:** either revert the bad commit on `main` and push (triggers a fresh
  deploy), or run `firebase hosting:rollback --project quoteapp-3f48e`
  locally if you have the Firebase CLI authenticated, to restore the
  previous hosting release immediately without waiting on CI.
- **Firestore rules/indexes:** redeploying an older commit redeploys its
  `firestore.rules`/`firestore.indexes.json` too, since they're part of the
  same deploy step.
- **APK:** there's no "rollback" — cut a new release pointing at a known-good
  build and update `appInfo.ts`.

## Before handing the app to Dad

See the checklist in `CLAUDE.md` — Firebase Auth, locking Firestore rules
down from `allow read, write: if true`, testing on his actual phone/browser.
Once rules are locked down, this file's "Firestore rules" assumption
(currently open to everyone) needs a note here on how a deploy authenticates
against locked rules, if that changes the deploy step at all.
