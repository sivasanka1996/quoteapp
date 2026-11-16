// Tiny Firestore REST helpers for the ai-feedback CI bot — no firebase-admin
// dependency needed since `feedback` (like every collection today) has
// `allow read, write: if true`. See docs/feedbackbot.md.

const PROJECT_ID = "quoteapp-3f48e"; // matches src/firebase.ts
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function unwrap(value) {
  if (value == null) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  return undefined;
}

export function docToObject(doc) {
  const id = doc.name.split("/").pop();
  const out = { id };
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    out[key] = unwrap(value);
  }
  return out;
}

export async function listDocs(collection) {
  const res = await fetch(`${BASE}/${collection}?pageSize=300`);
  if (!res.ok) throw new Error(`Firestore list failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return (body.documents ?? []).map(docToObject);
}

function toFirestoreValue(v) {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return { integerValue: String(Math.trunc(v)) };
  if (typeof v === "boolean") return { booleanValue: v };
  throw new Error(`Unsupported value type for Firestore write: ${typeof v}`);
}

export async function patchDoc(collection, id, fields) {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const body = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, toFirestoreValue(v)])
    ),
  };
  const res = await fetch(`${BASE}/${collection}/${id}?${mask}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore patch failed: ${res.status} ${await res.text()}`);
  return res.json();
}
