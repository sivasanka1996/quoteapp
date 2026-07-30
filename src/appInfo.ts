export const APP_VERSION = "v1.5";

export const APK_URL =
  "https://github.com/sivasanka1996/quoteapp/releases/download/v1.4/app-debug.apk";

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
