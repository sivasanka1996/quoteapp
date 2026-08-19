import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.wrangler/` is wrangler's build scratch — bundled copies of our own worker
  // plus Cloudflare's middleware shims. It is gitignored, but flat config does
  // not read .gitignore, so `npm run lint` was failing on generated code the
  // moment anyone ran `wrangler deploy` or `--dry-run`.
  globalIgnores(['dist', '**/.wrangler']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The worker is plain JS, and the block above matches only ts/tsx, so
    // `eslint .` used to walk it with no rules at all. It is the one file
    // deployed by hand, straight to Dad, and no test of it ever reaches the
    // real Gemini API — the last place to want no checking.
    files: ['cf-worker/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      // Cloudflare Workers get the service-worker globals (fetch, Request,
      // Response, URL), not Node's and not the DOM's.
      globals: globals.serviceworker,
    },
  },
  {
    // Config files at the root, and the Node-side helper scripts, run under
    // `type: module`. `*.js` alone matched only the root, so a file added at
    // `scripts/*.mjs` was walked by `eslint .` with NO rules at all — an
    // unused variable planted there passed clean. That is the same silent
    // skip PI-4.7 fixed for `cf-worker/` and PI-7 re-checked for the provider
    // files; this is the third instance, so the pattern is now explicit
    // rather than incidental.
    files: ['*.js', 'scripts/**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
