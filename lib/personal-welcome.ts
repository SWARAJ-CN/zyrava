import type { AuthUser } from "./api";

// Cosmetic returning-device hint only. It never grants features or authenticates anyone.
const KEY = "zyrava:personal-welcome-email";
const EVENT = "zyrava:personal-welcome-change";
export function readPersonalWelcome(): string | null {
  try { return window.localStorage.getItem(KEY) || null; } catch { return null; }
}
export function subscribePersonalWelcome(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}
export function forgetPersonalWelcome(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}
export function rememberPersonalWelcome(user: AuthUser): void {
  if (user.experience !== "brown-burgundy" || !user.email) {
    forgetPersonalWelcome();
    return;
  }
  try { window.localStorage.setItem(KEY, user.email.trim().toLowerCase()); } catch { /* optional hint */ }
  window.dispatchEvent(new Event(EVENT));
}
export function matchesPersonalWelcome(email: string | null, identifier: string): boolean {
  return !!email && (!identifier.trim() || identifier.trim().toLowerCase() === email);
}
