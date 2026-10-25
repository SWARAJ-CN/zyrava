export type ClassValue = string | number | false | null | undefined;

/** Join conditional class names without pulling in a dependency. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
