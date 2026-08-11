import { log } from "./log/logger";
import { appConfig } from "../config/app.config";

export interface ReadItem {
  name: string;
  qty: number;
  rate: number | null;
}

export interface ReadResult {
  items: ReadItem[];
  /** "full" = every row has a qty and a rate; "partial" = something needs typing in. */
  confidence: "full" | "partial" | "low";
  /** Shown to Dad. Empty on a good read. */
  notes?: string;
  /** Technical reason for a failed read. Not rendered — for the network tab. */
  detail?: string;
}

// Configured in config/app.config.ts. VITE_IMAGE_PROXY_URL still overrides it
// at build time, which is what deploy.yml uses for production.
const PROXY_URL =
  (import.meta.env.VITE_IMAGE_PROXY_URL as string | undefined) ||
  appConfig.worker.url;

/**
 * Longest edge, in pixels, of the image actually uploaded.
 *
 * A 12MP phone photo is ~4000px wide and becomes an ~8MB base64 POST, which on
 * field mobile data is the difference between a read that works and one that
 * times out. Gemini reads the image in tiles and gains nothing from the extra
 * pixels, so this costs no accuracy.
 */
export const MAX_EDGE = appConfig.image.maxEdge;

const JPEG_QUALITY = appConfig.image.jpegQuality;

const OFFLINE_MESSAGE =
  "No internet connection — reading a photo needs one. Everything else in the app works offline.";

export async function readImageItems(file: File): Promise<ReadResult> {
  const startedAt = Date.now();
  // I/O layer (spec §2.4): log everything, then let the existing errors through
  // unchanged. ImageReader renders these messages verbatim, and PI-3 verified
  // the exact wording — swallowing them here would replace an honest
  // explanation with a silent empty list.
  try {
    // Checked before the configuration error below: if Dad is in a basement with
    // no signal, "not configured" would send him chasing the wrong problem.
    if (isOffline()) throw new Error(OFFLINE_MESSAGE);

    if (!PROXY_URL) {
      throw new Error(
        "Image reader not configured — set worker.url in config/app.config.ts"
      );
    }

    const { base64, mimeType } = await prepareImage(file);
    log.debug("image", "upload prepared", {
      originalBytes: file.size,
      uploadBytes: base64.length,
      mimeType,
    });

    let response: Response;
    try {
      response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
    } catch (e) {
      // fetch rejects with a bare TypeError on a dropped connection, which says
      // nothing useful. If the signal went while we were uploading, say that.
      if (isOffline()) throw new Error(OFFLINE_MESSAGE, { cause: e });
      throw new Error(
        `Could not reach the image reader — check your connection and try again. (${
          e instanceof Error ? e.message : String(e)
        })`,
        { cause: e }
      );
    }

    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      // Logged with the status because 403 and an empty item list are the two
      // distinct first-read failures CLAUDE.md tells you to tell apart: 403 is
      // the worker's origin allowlist, anything else is the Gemini side.
      log.warn("image", "reader returned an error status", {
        status: response.status,
        body: String(msg).slice(0, 300),
      });
      throw new Error(`Image reading failed: ${msg}`);
    }

    const result = await response.json();
    if (result.error) throw new Error(result.error);

    const read = result as ReadResult;
    log.info("image", "image read", {
      itemCount: read.items?.length ?? 0,
      confidence: read.confidence,
      ms: Date.now() - startedAt,
    });
    return read;
  } catch (e) {
    log.error("image", "image read failed", e, {
      ms: Date.now() - startedAt,
      fileBytes: file?.size,
    });
    throw e;
  }
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * The base64 payload out of a `data:` URL.
 *
 * `dataUrl.split(",")[1]` was two silent `undefined`s waiting to happen: a
 * canvas that exports nothing, or a FileReader handed something that is not an
 * image, both produce a string with no comma in it. `undefined` then travelled
 * all the way to `JSON.stringify` and left the worker to explain a request with
 * no image in it — a confusing failure a long way from its cause.
 */
export function base64FromDataUrl(dataUrl: unknown): string {
  if (typeof dataUrl !== "string" || dataUrl === "") {
    throw new Error("Could not read the photo — the image data was empty.");
  }
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    throw new Error(
      "Could not read the photo — the image data was not in the expected format."
    );
  }
  const base64 = dataUrl.slice(comma + 1);
  if (!base64) {
    throw new Error("Could not read the photo — the image data was empty.");
  }
  return base64;
}

/**
 * The size the upload should be, given the size the photo is.
 *
 * Scales by the longest edge and never enlarges — a photo already under the
 * limit is left exactly as it is.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Downscale and re-encode before upload. Falls back to sending the original on
 * any failure — a slow read beats no read.
 */
export async function prepareImage(file: File): Promise<{ base64: string; mimeType: string }> {
  try {
    // "from-image" applies the EXIF orientation tag. Without it a portrait
    // phone photo uploads on its side and the handwriting gets much harder to
    // read — downscaling would then cost accuracy instead of saving bandwidth.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { base64: base64FromDataUrl(dataUrl), mimeType: "image/jpeg" };
  } catch (e) {
    // A downscale failure is recoverable — send the original. Worth a warn
    // though: it silently turns a 646 KB upload back into a 6 MB one, which
    // looks like "the reader got slow" from the outside.
    log.warn("image", "downscale failed, sending the original", {
      reason: e instanceof Error ? e.message : String(e),
      bytes: file.size,
    });
    return { base64: await fileToBase64(file), mimeType: file.type || "image/jpeg" };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(base64FromDataUrl(reader.result));
      } catch (e) {
        // This is the last fallback in the chain, so a throw here is the whole
        // read failing. Reject with the explanation rather than resolving with
        // `undefined` and failing at the worker instead.
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
