import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
    // Config files at the root run in Node, under `type: module`.
    files: ['*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
