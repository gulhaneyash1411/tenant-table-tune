export function money(n: number, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `₹${Math.round(n)}`; }
}