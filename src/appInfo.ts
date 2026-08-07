/**
 * The web app — what the home footer shows, and what Dad is actually looking
 * at. Redeploys on every push to main.
 */
export const APP_VERSION = "v1.5";

/**
 * The newest GitHub Release that has an APK attached — what the download banner
 * links to. Legitimately behind APP_VERSION and not a mistake: the APK is only
 * a TWA wrapper around the hosted site, so it changes when the wrapper changes,
 * not when the app does. Dad running the v1.4 APK still sees the v1.5 web app.
 *
 * Ritual when an APK is released: publish the release, bump this to its tag,
 * then bump versionName/versionCode in build-apk.yml to the release after it.
 * Checked against the Releases page on 2026-08-07 — latest is v1.4, and
 * build-apk.yml is staged to build 1.5 next.
 */
export const APK_VERSION = "v1.4";

export const APK_URL =
  `https://github.com/sivasanka1996/quoteapp/releases/download/${APK_VERSION}/app-debug.apk`;

/**
 * True when running as an installed PWA or inside the Android APK (TWA).
 * Used to hide the "download the app" banner from people already in the app.
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches;
  // iOS Safari exposes navigator.standalone instead of display-mode
  const iosStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  // The TWA wrapper sets a referrer of android-app://
  const twa = document.referrer.startsWith("android-app://");
  return Boolean(standalone || iosStandalone || twa);
}
