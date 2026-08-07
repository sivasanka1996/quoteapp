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

// Point VITE_IMAGE_PROXY_URL at your deployed Cloudflare Worker.
// Add to .env.local: VITE_IMAGE_PROXY_URL=https://your-worker.workers.dev
const PROXY_URL = import.meta.env.VITE_IMAGE_PROXY_URL as string | undefined;

/**
 * Longest edge, in pixels, of the image actually uploaded.
 *
 * A 12MP phone photo is ~4000px wide and becomes an ~8MB base64 POST, which on
 * field mobile data is the difference between a read that works and one that
 * times out. Gemini reads the image in tiles and gains nothing from the extra
 * pixels, so this costs no accuracy.
 */
export const MAX_EDGE = 1600;

const JPEG_QUALITY = 0.85;

const OFFLINE_MESSAGE =
  "No internet connection — reading a photo needs one. Everything else in the app works offline.";

export async function readImageItems(file: File): Promise<ReadResult> {
  // Checked before the configuration error below: if Dad is in a basement with
  // no signal, "not configured" would send him chasing the wrong problem.
  if (isOffline()) throw new Error(OFFLINE_MESSAGE);

  if (!PROXY_URL) {
    throw new Error(
      "Image reader not configured — add VITE_IMAGE_PROXY_URL=https://... to .env.local"
    );
  }

  const { base64, mimeType } = await prepareImage(file);

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
    throw new Error(`Image reading failed: ${msg}`);
  }

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result as ReadResult;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
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
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("empty canvas export");
    return { base64, mimeType: "image/jpeg" };
  } catch {
    return { base64: await fileToBase64(file), mimeType: file.type || "image/jpeg" };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
