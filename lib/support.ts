export const SUPPORT_AMOUNTS = [10, 50, 100, 500, 1000] as const;
/** Parse decimal rupees exactly into integer paise. */
export function supportAmountPaise(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 1000000
    ? amount
    : null;
}
