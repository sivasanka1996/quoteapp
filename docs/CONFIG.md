# Config & secrets map

Where every key/secret/env var lives and what reads it. Locations and
purpose only — never the actual secret values.

## Firebase web config

**Location:** hardcoded in `src/firebase.ts`.
**Safe to be public** — this is the Firebase *client* config (apiKey here is
not a secret; access is controlled by Firestore rules, not this key).
**Used by:** every Firestore read/write in the app, via the exported `db`.

## `VITE_IMAGE_PROXY_URL`

**What:** URL of the Cloudflare Worker that proxies image-reading requests to
Gemini.
**Read by:** `src/readImage.ts` (`import.meta.env.VITE_IMAGE_PROXY_URL`).
**Set in production:** `.github/workflows/deploy.yml`, as a build-time env
var on the `Build` step — baked into every production build, so image
reading has been live in production since that line was added.
**Set for local dev:** not set by default. To exercise image reading from
`npm run dev`, add a `.env.local` at the repo root:
```
VITE_IMAGE_PROXY_URL=https://quoteapp-image-reader.qouteappsub.workers.dev
```
(or point at your own worker, see below). Without it, `readImageItems()`
throws "Image reader not configured."

## `GEMINI_API_KEY`

**What:** the actual Gemini API key.
**Stored as:** a Cloudflare Worker secret, never in source or in this repo.
**Set/rotated with:**
```
cd cf-worker
npx wrangler secret put GEMINI_API_KEY
```
**Read by:** `cf-worker/image-reader.js`, as `env.GEMINI_API_KEY`, to call
`generativelanguage.googleapis.com`.
**Worker deployed at:** `quoteapp-image-reader.qouteappsub.workers.dev`
(deploy with `npx wrangler deploy` from `cf-worker/`, config in
`cf-worker/wrangler.toml`).

## `FIREBASE_TOKEN`

**What:** a Firebase CI token from `firebase login:ci`.
**Stored as:** a GitHub Actions repo secret (Settings → Secrets → Actions).
**Read by:** `.github/workflows/deploy.yml`'s deploy step, to run
`firebase-tools deploy --token "$FIREBASE_TOKEN"`.

## Summary table

| Secret / var | Lives in | Read by |
|---|---|---|
| Firebase web config | `src/firebase.ts` (public, not a secret) | `db` export, used everywhere |
| `VITE_IMAGE_PROXY_URL` | `deploy.yml` (prod) / `.env.local` (dev, not committed) | `src/readImage.ts` |
| `GEMINI_API_KEY` | Cloudflare Worker secret | `cf-worker/image-reader.js` |
| `FIREBASE_TOKEN` | GitHub Actions secret | `.github/workflows/deploy.yml` |
