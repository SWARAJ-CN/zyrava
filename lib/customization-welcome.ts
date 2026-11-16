import {
  isCustomizationConfig,
  isCustomizationExpired,
  type AppliedCustomization,
} from "./customization";
const KEY = "zyrava:customization-welcome-v2";
const EVENT = "zyrava:customization-welcome-change";
export interface CustomizationWelcome {
  userId: string;
  email: string | null;
  active: AppliedCustomization;
}
export function readCustomizationWelcome(): string | null {
  try {
    // Discard old hints that predate server-side contact masking.
    window.localStorage.removeItem("zyrava:customization-welcome-v1");
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function parseCustomizationWelcome(
  raw: string | null,
): CustomizationWelcome | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return typeof value?.userId === "string" &&
      (value.email === null || typeof value.email === "string") &&
      isCustomizationConfig(value?.active?.config) &&
      !isCustomizationExpired(value.active) &&
      typeof value.active.id === "string" &&
      typeof value.active.creator?.id === "string" &&
      (value.active.creator.name === null ||
        typeof value.active.creator.name === "string") &&
      (value.active.creator.email === null ||
        typeof value.active.creator.email === "string")
      ? value
      : null;
  } catch {
    return null;
  }
}
export function subscribeCustomizationWelcome(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}
export function rememberCustomizationWelcome(
  value: CustomizationWelcome | null,
) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* Cosmetic hint only. */
  }
  window.dispatchEvent(new Event(EVENT));
}
