/**
 * The language the interface is in right now.
 *
 * A plain module variable rather than context, so code that is not a React
 * component — the data layer, the invoice template — can ask what language it
 * is working in without being handed it.
 */

let current = "en";

export function setCurrentLocale(code: string): void {
  current = code || "en";
}

export function currentLocale(): string {
  return current;
}
