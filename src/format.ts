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
