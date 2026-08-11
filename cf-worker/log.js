// Worker-side logging.
//
// A Worker has no filesystem and no ring buffer to export, so "logging" here
// means one structured line per event on stdout, which `npx wrangler tail`
// streams live and the Cloudflare dashboard keeps. JSON rather than prose so
// the fields stay greppable.
//
// Set LOG_LEVEL=silent in wrangler.toml (or a test env) to turn it off. Same
// rule as the client logger: this must never throw, because every call site is
// on the request path.

import { appConfig } from "../config/app.config";

export function wlog(env, level, msg, fields = {}) {
  try {
    // Env var beats config, so it can be silenced from the dashboard.
    if ((env?.LOG_LEVEL || appConfig.worker.logLevel) === "silent") return;
    console.log(
      JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })
    );
  } catch {
    /* a log line is never worth failing a read for */
  }
}

export function newRequestId() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}
