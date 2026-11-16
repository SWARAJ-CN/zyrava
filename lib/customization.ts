export const CUSTOM_ANIMATIONS = [
  {
    id: "couples-1",
    label: "Couples 1",
    src: "/animations/custom-couples-1-f3ee3b57.lottie",
  },
  {
    id: "couples-2",
    label: "Couples 2",
    src: "/animations/custom-couples-2-a74f1184.lottie",
  },
  {
    id: "couples-3",
    label: "Couples 3",
    src: "/animations/custom-couples-3-48699dc3.lottie",
  },
  {
    id: "couples-4",
    label: "Couples 4",
    src: "/animations/custom-couples-4-5e7e9938.lottie",
  },
  {
    id: "moments-1",
    label: "Moonlight",
    src: "/animations/custom-moments-1-006a3210.lottie",
  },
  {
    id: "moments-2",
    label: "Dancing dog",
    src: "/animations/custom-moments-2-77e997ed.lottie",
  },
  {
    id: "moments-3",
    label: "Sound waves",
    src: "/animations/custom-moments-3-4f4fea5e.lottie",
  },
  {
    id: "moments-4",
    label: "Dance moves",
    src: "/animations/custom-moments-4-6418843b.lottie",
  },
  {
    id: "moments-5",
    label: "DJ party",
    src: "/animations/custom-moments-5-359a8420.lottie",
  },
  {
    id: "moments-6",
    label: "Space walk",
    src: "/animations/custom-moments-6-61d11da8.lottie",
  },
  {
    id: "moments-7",
    label: "Happy birthday",
    src: "/animations/custom-moments-7-baa76dfa.lottie",
  },
] as const;
export type AnimationId = "none" | (typeof CUSTOM_ANIMATIONS)[number]["id"];
export type CustomizationTemplate = "partner" | "birthday";
export interface CustomizationConfig {
  template?: CustomizationTemplate;
  wishMessage?: string;
  title: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  loadingAnimation: AnimationId;
  headerAnimation: AnimationId;
  lyricsAnimation: AnimationId;
  loadingMessage: string;
  durationMinutes?: number | null;
}
export interface CustomizationPerson {
  id: string;
  name: string | null;
  /** Server-masked contact labels, never raw directory credentials. */
  email: string | null;
  phone?: string | null;
}
export interface AppliedCustomization {
  id: string;
  config: CustomizationConfig;
  creator: CustomizationPerson;
  appliedAt: string;
  expiresAt?: string | null;
}
export interface CustomizationDesign {
  id: string;
  config: CustomizationConfig;
  creator: CustomizationPerson;
  recipient: CustomizationPerson;
  status: "pending" | "accepted" | "declined";
  updatedAt: string;
}
export interface CustomizationState {
  active: AppliedCustomization | null;
  incoming: CustomizationDesign[];
  received: CustomizationDesign[];
  outgoing: CustomizationDesign[];
}
export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  template: "partner",
  wishMessage: "",
  title: "Made for you",
  accent: "#e76caa",
  background: "#20141c",
  surface: "#32212c",
  text: "#fff4fa",
  loadingAnimation: "couples-1",
  headerAnimation: "couples-2",
  lyricsAnimation: "couples-3",
  durationMinutes: null,
  loadingMessage: "Your favourite songs are getting ready.",
};
export const BIRTHDAY_CUSTOMIZATION: CustomizationConfig = {
  ...DEFAULT_CUSTOMIZATION,
  template: "birthday",
  title: "Happy birthday!",
  wishMessage:
    "Wishing you a day full of love, laughter, and your favourite songs. This little world is just for you.",
  accent: "#e7b86c",
  background: "#1d152b",
  surface: "#30213f",
  text: "#fff8ed",
  loadingAnimation: "moments-7",
  headerAnimation: "moments-7",
  lyricsAnimation: "moments-1",
  durationMinutes: 1440,
  loadingMessage:
    "A birthday surprise, made just for you. Your music is almost ready!",
};
export const CUSTOM_ANIMATION_SETS = [
  {
    id: "together",
    label: "Together",
    loadingAnimation: "couples-1",
    headerAnimation: "couples-2",
    lyricsAnimation: "couples-3",
  },
  {
    id: "birthday",
    label: "Birthday wishes",
    loadingAnimation: "moments-7",
    headerAnimation: "moments-7",
    lyricsAnimation: "moments-1",
  },
  {
    id: "party",
    label: "Dance party",
    loadingAnimation: "moments-2",
    headerAnimation: "moments-4",
    lyricsAnimation: "moments-5",
  },
  {
    id: "space",
    label: "Under the stars",
    loadingAnimation: "moments-6",
    headerAnimation: "moments-1",
    lyricsAnimation: "moments-3",
  },
] as const;
const HEX = /^#[0-9a-f]{6}$/i;
export function isCustomizationConfig(
  value: unknown,
): value is CustomizationConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    (c.template == null ||
      c.template === "partner" ||
      c.template === "birthday") &&
    (c.wishMessage == null ||
      (typeof c.wishMessage === "string" &&
        c.wishMessage.length <= 280 &&
        !/[\u0000-\u001f\u007f]/.test(c.wishMessage))) &&
    typeof c.title === "string" &&
    c.title.length > 0 &&
    c.title.length <= 60 &&
    typeof c.loadingMessage === "string" &&
    c.loadingMessage.length <= 140 &&
    (c.durationMinutes == null ||
      (typeof c.durationMinutes === "number" &&
        Number.isInteger(c.durationMinutes) &&
        c.durationMinutes >= 1 &&
        c.durationMinutes <= 525600)) &&
    [c.accent, c.background, c.surface, c.text].every(
      (v) => typeof v === "string" && HEX.test(v),
    ) &&
    [c.loadingAnimation, c.headerAnimation, c.lyricsAnimation].every(
      (v) => v === "none" || CUSTOM_ANIMATIONS.some((a) => a.id === v),
    )
  );
}
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
export function mixColor(a: string, b: string, weight: number): string {
  const one = rgb(a),
    two = rgb(b);
  return (
    "#" +
    one
      .map((v, i) =>
        Math.round(v + (two[i] - v) * weight)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((n) => {
    const v = n / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
const FAMILIES = [
  "Rose",
  "Coral",
  "Amber",
  "Gold",
  "Lime",
  "Leaf",
  "Green",
  "Mint",
  "Jade",
  "Sea",
  "Aqua",
  "Glacier",
  "Sky",
  "Azure",
  "Blue",
  "Indigo",
  "Violet",
  "Iris",
  "Purple",
  "Orchid",
  "Magenta",
  "Berry",
  "Pink",
  "Blush",
];
export const CUSTOM_PALETTES = FAMILIES.flatMap((name, index) =>
  [0.4, 0.46, 0.52, 0.58, 0.64, 0.7].map((light, shade) => {
    const accent = hsl(index * 15, 0.72, light);
    return {
      name: `${name} ${shade + 1}`,
      accent,
      background: mixColor("#111116", accent, 0.1),
      surface: mixColor("#202027", accent, 0.14),
      text: "#faf7fb",
    };
  }),
);
export function customizationVariables(
  c: CustomizationConfig,
): Record<string, string> {
  const muted = mixColor(c.text, c.surface, 0.3),
    border = mixColor(c.surface, c.text, 0.22),
    secondary = mixColor(c.surface, c.text, 0.06);
  const accentText =
    contrast(c.accent, "#ffffff") >= contrast(c.accent, "#111111")
      ? "#ffffff"
      : "#111111";
  const soft = mixColor(c.surface, c.accent, 0.2),
    lightAccent = mixColor(c.text, c.accent, 0.42);
  return {
    "--background": c.background,
    "--foreground": c.text,
    "--surface": c.surface,
    "--surface-foreground": c.text,
    "--surface-secondary": secondary,
    "--surface-secondary-foreground": c.text,
    "--surface-tertiary": mixColor(c.surface, c.text, 0.12),
    "--surface-tertiary-foreground": c.text,
    "--overlay": c.surface,
    "--overlay-foreground": c.text,
    "--muted": muted,
    "--accent": c.accent,
    "--accent-hover": mixColor(c.accent, c.text, 0.12),
    "--accent-foreground": accentText,
    "--accent-soft": soft,
    "--accent-soft-hover": mixColor(c.surface, c.accent, 0.28),
    "--accent-soft-foreground": lightAccent,
    "--color-brand": lightAccent,
    "--brand": lightAccent,
    "--default": secondary,
    "--default-hover": mixColor(c.surface, c.text, 0.13),
    "--default-foreground": c.text,
    "--field-background": c.surface,
    "--field-foreground": c.text,
    "--field-placeholder": muted,
    "--field-border": border,
    "--field-border-hover": lightAccent,
    "--field-border-focus": c.accent,
    "--border": border,
    "--border-secondary": border,
    "--border-tertiary": muted,
    "--separator": border,
    "--separator-secondary": border,
    "--segment": soft,
    "--segment-foreground": c.text,
    "--focus": lightAccent,
    "--link": lightAccent,
    "--selection": c.accent,
    "--selection-foreground": accentText,
    "--dock-bg": c.surface,
    "--dock-hover": secondary,
    "--dock-active": soft,
    "--dock-line": border,
    "--scrollbar-thumb": mixColor(c.surface, c.accent, 0.65),
    "--scrollbar-hover": c.accent,
    "--scrollbar-track": secondary,
  };
}

export function isCustomizationExpired(
  value: AppliedCustomization | null,
  now = Date.now(),
): boolean {
  return value?.expiresAt != null && !(Date.parse(value.expiresAt) > now);
}
export function durationLabel(minutes?: number | null): string {
  if (minutes == null) return "Until removed";
  const factor = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
  const unit = factor === 1440 ? "day" : factor === 60 ? "hour" : "minute";
  const count = minutes / factor;
  return `${count} ${unit}${count === 1 ? "" : "s"} after applying`;
}
