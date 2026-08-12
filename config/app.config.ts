// ============================================================================
// THE CONFIG FILE. One place. Change things here.
// ============================================================================
//
// Everything tunable about this app lives in this file: which AI model reads a
// photo, where the Worker is, how big an upload gets, how long a save waits.
// It is imported by BOTH halves — the React app (bundled by Vite) and the
// Cloudflare Worker (bundled by wrangler) — so there is one answer, not two
// that can drift apart.
//
// ----------------------------------------------------------------------------
// API KEYS ARE NOT HERE, AND CANNOT BE
// ----------------------------------------------------------------------------
//
// This file is committed, and the repo is PUBLIC. A key written here is a key
// published. See `secrets` at the bottom for the name of each one and the exact
// command to set it — so this is still the single place you *look*, even though
// the values live where they have to.
//
// ----------------------------------------------------------------------------
// PRECEDENCE: environment variable  >  this file
// ----------------------------------------------------------------------------
//
// A value set in the Cloudflare dashboard beats the value here. That is
// deliberate and worth keeping: it means switching model or provider is a
// dashboard edit that takes effect on the next request, with no deploy and no
// build. This file is the default; the dashboard is the override.

export const appConfig = {
  // --------------------------------------------------------------------------
  // Which AI reads a photo of an order slip
  // --------------------------------------------------------------------------
  ai: {
    /**
     * "gemini" | "openrouter"
     *
     * Overridden by the AI_PROVIDER environment variable. An unknown value
     * falls back to gemini and logs a warning — a typo must never be why Dad
     * cannot read a slip standing in a shop.
     */
    provider: "openrouter" as "gemini" | "openrouter",

    gemini: {
      /**
       * Tried in order. Flash reads Dad's slips well and costs almost nothing;
       * Pro is the second attempt only, so the average read stays cheap and a
       * bad read still gets a proper try.
       */
      models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    },

    openrouter: {
      /**
       * Overridden by OPENROUTER_MODEL.
       *
       * MODEL IDS ARE NOT STABLE — verify before changing this:
       *   curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*"'
       *
       * The spec originally named `qwen/qwen3.7-flash`, which does not exist
       * with vision + structured output; it would have failed on the first real
       * read. Checked 2026-08-10: of 207 models having both, this is the
       * cheapest Qwen — $0.065/M in, $0.26/M out, 1M context, no per-image fee.
       * Qwen because multilingual strength is the point: this has to read Telugu.
       *
       * Next rung up if accuracy disappoints: "qwen/qwen3.6-flash" ($0.188/M in).
       * Still pennies a month at Dad's volume.
       */
      model: "qwen/qwen3.5-flash-02-23",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
    },

    /**
     * Ceiling on the reply. Thinking tokens count against it on the 2.5-series
     * models, so this is the FIRST SUSPECT when a long slip comes back empty.
     */
    maxOutputTokens: 8192,

    /** Low: reading a slip is transcription, not writing. */
    temperature: 0.1,
  },

  // --------------------------------------------------------------------------
  // The Cloudflare Worker — the only server-ish thing in the system
  // --------------------------------------------------------------------------
  worker: {
    /**
     * Where the app sends photos. Overridden by VITE_IMAGE_PROXY_URL at build
     * time; that is what `.github/workflows/deploy.yml` sets for production.
     */
    url: "https://quoteapp-image-reader.qouteappsub.workers.dev",

    /**
     * Who may spend the API key. The Worker sits on one public URL with the key
     * in its environment, so without this anyone reading the public repo had a
     * free relay. A request with NO Origin is refused too — a browser always
     * sends one, so nothing legitimate is lost, but curl is turned away.
     *
     * Both Firebase hostnames because Hosting answers on either; both local
     * ports because `npm run dev` and `npm run preview` differ.
     */
    allowedOrigins: [
      "https://quoteapp-3f48e.web.app",
      "https://quoteapp-3f48e.firebaseapp.com",
      "http://localhost:5173",
      "http://localhost:4173",
    ],

    /** "info" | "silent". Overridden by LOG_LEVEL. Watch with `wrangler tail`. */
    logLevel: "info" as "info" | "silent",
  },

  // --------------------------------------------------------------------------
  // Photo upload
  // --------------------------------------------------------------------------
  image: {
    /**
     * Longest edge, in pixels, of the image actually uploaded.
     *
     * A 12MP phone photo is ~4000px wide and becomes an ~8MB base64 POST, which
     * on field mobile data is the difference between a read that works and one
     * that times out. Measured: a 6155 KB photo uploads as 646 KB at 1600px.
     * The model reads in tiles and gains nothing from the extra pixels.
     */
    maxEdge: 1600,
    jpegQuality: 0.85,
  },

  // --------------------------------------------------------------------------
  // Diagnostics (PI-5)
  // --------------------------------------------------------------------------
  log: {
    /** Ring buffer caps — whichever bites first. */
    maxRecords: 2000,
    maxBytes: 1_000_000,
  },

  // --------------------------------------------------------------------------
  // Firestore
  // --------------------------------------------------------------------------
  firestore: {
    /**
     * Local Firebase Emulator Suite — a throwaway Firestore on this machine.
     *
     * Off by default, and switched on per-run rather than per-project because
     * it is a property of how you are working, not of the app:
     *
     *     npm run dev:local
     *
     * Why it matters: without it, `npm run dev` reads and writes Dad's REAL
     * database. Every browser check in this repo's history had to create
     * throwaway `ZZ-` customers in production and delete them afterwards. One
     * forgotten cleanup is one row of real data gone.
     *
     * Ports match the `emulators` block in firebase.json — change both together.
     */
    emulator: {
      firestorePort: 8080,
      authPort: 9099,
      uiPort: 4000,
    },

    /**
     * How long to wait for the server before calling a write
     * saved-but-not-synced.
     *
     * Firestore resolves a write only on SERVER ack, so offline the promise
     * never settles and awaiting it hangs the button forever. Long enough that
     * a healthy connection acks first; short enough that Dad is never stuck.
     */
    ackTimeoutMs: 2500,
  },

  // --------------------------------------------------------------------------
  // SECRETS — names and how to set them. Values NEVER live in this repo.
  // --------------------------------------------------------------------------
  //
  // Listed so this file is still the one place you look, even though the values
  // are stored at Cloudflare.
  //
  //   cd cf-worker
  //   npx wrangler secret put OPENROUTER_API_KEY   # needed when provider is "openrouter"
  //   npx wrangler secret put GEMINI_API_KEY       # needed when provider is "gemini"
  //
  // `wrangler secret put` prompts for the value, encrypts it at Cloudflare, and
  // writes nothing to disk. Do NOT put either key in .env, .env.local, or
  // wrangler.toml — the first two build the frontend and get compiled into the
  // public JS bundle; the third is committed.
  //
  // For local Worker development only, `cf-worker/.dev.vars` holds them. It is
  // gitignored — verify with: git check-ignore -v cf-worker/.dev.vars
  secrets: {
    openrouter: "OPENROUTER_API_KEY",
    gemini: "GEMINI_API_KEY",
  },
} as const;

export type AppConfig = typeof appConfig;
