export interface ReadItem {
  name: string;
  qty: number;
  rate: number | null;
}

export interface ReadResult {
  items: ReadItem[];
  confidence: "full" | "partial" | "low";
  notes?: string;
}

// Point VITE_IMAGE_PROXY_URL at your deployed Cloudflare Worker.
// Add to .env.local: VITE_IMAGE_PROXY_URL=https://your-worker.workers.dev
const PROXY_URL = import.meta.env.VITE_IMAGE_PROXY_URL as string | undefined;

export async function readImageItems(file: File): Promise<ReadResult> {
  if (!PROXY_URL) {
    throw new Error(
      "Image reader not configured — add VITE_IMAGE_PROXY_URL=https://... to .env.local"
    );
  }

  const imageBase64 = await fileToBase64(file);

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType: file.type || "image/jpeg" }),
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`Image reading failed: ${msg}`);
  }

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result as ReadResult;
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
