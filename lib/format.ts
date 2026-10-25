const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  AED: "د.إ",
  SAR: "﷼",
};

/**
 * The locale numbers and dates are written in.
 *
 * It follows the language of the interface, so a reader in Tamil sees
 * "டிசம்பர்" rather than "December" — but the shop's own currency and
 * numbering stay the ones it uses.
 */
let intlLocale = "en-IN";

export function setFormatLocale(locale: string): void {
  intlLocale = locale || "en-IN";
}

export function currencySymbol(currency = "INR"): string {
  const code = (currency || "INR").toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

export function formatCurrency(value: number, currency = "INR"): string {
  const amount = Number.isFinite(value) ? value : 0;
  const code = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencySymbol(code)}${formatNumber(amount)}`;
  }
}

/** Short currency value for axes and tiles, e.g. ₹1.2L. */
export function formatCurrencyCompact(value: number, currency = "INR"): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${currencySymbol(currency)}${formatCompactNumber(amount)}`;
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(intlLocale, { maximumFractionDigits }).format(amount);
}

/** Compact number, e.g. 1250 -> 1.3K, 4200000 -> 4.2M. */
export function formatCompactNumber(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(intlLocale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatPercent(value: number, digits = 1): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${amount >= 0 ? "" : "-"}${Math.abs(amount).toFixed(digits)}%`;
}

export function formatDate(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale, options).format(date);
}

export function formatDateTime(iso: string | Date): string {
  return formatDate(iso, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(iso: string | Date): string {
  return formatDate(iso, { day: "2-digit", month: "short" });
}

export function formatMonthLabel(iso: string | Date): string {
  return formatDate(iso, { month: "short", year: "2-digit" });
}

export function relativeTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return "just now";
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInputValue(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a yyyy-mm-dd input value as a local date. */
export function parseDateInput(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A playlist's running time the way a music app states it: 1 hr 12 min. */
export function formatRuntime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  if (!total) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}
