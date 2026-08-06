// Indian number formatting (lakh/crore grouping): 10223096 -> "1,02,23,096"

export function formatINR(n: number, decimals = 0): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");

  // Indian grouping: last 3 digits, then groups of 2
  let result: string;
  if (intPart.length <= 3) {
    result = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    result = grouped + "," + last3;
  }

  return sign + result + (decPart ? "." + decPart : "");
}

export function formatPct(n: number): string {
  return n.toFixed(2) + "%";
}

// Compact form for stat tiles: 240000 -> "2.4L", 12500000 -> "1.3Cr".
// Below a lakh there is nothing to gain, so fall back to full grouping.
export function formatINRShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const oneDp = (x: number) => String(Math.round(x * 10) / 10);
  if (abs >= 1e7) return sign + oneDp(abs / 1e7) + "Cr";
  if (abs >= 1e5) return sign + oneDp(abs / 1e5) + "L";
  return sign + formatINR(abs);
}

// "31 Jul 2026" — day first, the order he reads everywhere else
export function formatDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * "Q-260806-1423" — the date and time the quote was created.
 *
 * Derived rather than sequential: a counter needs either a counter document
 * (a write that can fail with no signal) or a scan of every quote at save
 * time. This needs neither, cannot collide, and never changes for a given
 * quote because `createdAt` never changes — stable per device, though: it is
 * rendered from local device time, so the same `createdAt` would print a
 * different number on a device set to a different timezone.
 */
export function quoteNumber(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `Q-${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** "₹3,73,347" — formatINR with the symbol. Sign goes outside: -₹5, not ₹-5. */
export function formatMoney(n: number, decimals = 0): string {
  return (n < 0 ? "-" : "") + "₹" + formatINR(Math.abs(n), decimals);
}
