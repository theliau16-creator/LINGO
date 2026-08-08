/** Chat personalisation: themes, palettes and contrast helpers. */

export type BackgroundType = "default" | "solid" | "gradient" | "image" | "photo";

export type ChatPreferences = {
  background_type: BackgroundType;
  background_value: string | null;
  outgoing_message_color: string | null;
  incoming_message_color: string | null;
  theme: string;
};

export const DEFAULT_PREFERENCES: ChatPreferences = {
  background_type: "default",
  background_value: null,
  outgoing_message_color: null,
  incoming_message_color: null,
  theme: "default",
};

export const BUBBLE_COLORS = [
  { name: "Bleu", value: "#2563eb" },
  { name: "Électrique", value: "#3b82f6" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Rose", value: "#ec4899" },
  { name: "Rouge", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Jaune", value: "#facc15" },
  { name: "Vert", value: "#22c55e" },
  { name: "Turquoise", value: "#14b8a6" },
  { name: "Ardoise", value: "#334155" },
  { name: "Blanc", value: "#f8fafc" },
] as const;

export const SOLID_BACKGROUNDS = [
  "#0b1020",
  "#111827",
  "#1e1b4b",
  "#0f172a",
  "#1c1917",
  "#f8fafc",
] as const;

export const GRADIENT_BACKGROUNDS = [
  "linear-gradient(160deg, #0f172a 0%, #1e3a8a 100%)",
  "linear-gradient(160deg, #1e1b4b 0%, #7c3aed 100%)",
  "linear-gradient(160deg, #0f172a 0%, #0f766e 100%)",
  "linear-gradient(160deg, #431407 0%, #f97316 100%)",
  "linear-gradient(160deg, #111827 0%, #be185d 100%)",
  "linear-gradient(160deg, #020617 0%, #334155 100%)",
] as const;

/** Built-in artwork backgrounds rendered purely with CSS (no asset download). */
export const IMAGE_BACKGROUNDS = [
  {
    id: "aurora",
    label: "Aurore",
    css: "radial-gradient(120% 90% at 10% 0%, #3b82f6 0%, transparent 55%), radial-gradient(120% 90% at 90% 10%, #a855f7 0%, transparent 55%), linear-gradient(180deg, #060b1a 0%, #0b1226 100%)",
  },
  {
    id: "bubbles",
    label: "Bulles",
    css: "radial-gradient(closest-side, rgba(59,130,246,0.35), transparent) 10% 20%/220px 220px no-repeat, radial-gradient(closest-side, rgba(236,72,153,0.28), transparent) 85% 35%/260px 260px no-repeat, radial-gradient(closest-side, rgba(20,184,166,0.25), transparent) 40% 85%/300px 300px no-repeat, #070b18",
  },
  {
    id: "mesh",
    label: "Maille",
    css: "conic-gradient(from 210deg at 30% 20%, #1d4ed8, #7c3aed, #0ea5e9, #1d4ed8)",
  },
  {
    id: "paper",
    label: "Papier",
    css: "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 12px), linear-gradient(180deg, #0d1220 0%, #131a2b 100%)",
  },
] as const;

export type ChatTheme = {
  id: string;
  label: string;
  background: { type: BackgroundType; value: string | null };
  outgoing: string;
  incoming: string;
};

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: "default",
    label: "Lingo",
    background: { type: "default", value: null },
    outgoing: "#3b82f6",
    incoming: "#1f2937",
  },
  {
    id: "ocean",
    label: "Ocean",
    background: { type: "gradient", value: "linear-gradient(160deg, #041027 0%, #0e7490 100%)" },
    outgoing: "#0ea5e9",
    incoming: "#0f2f3f",
  },
  {
    id: "sunset",
    label: "Sunset",
    background: { type: "gradient", value: "linear-gradient(160deg, #2a0f2e 0%, #f97316 100%)" },
    outgoing: "#fb7185",
    incoming: "#3b1f33",
  },
  {
    id: "midnight",
    label: "Midnight",
    background: { type: "gradient", value: "linear-gradient(160deg, #000000 0%, #1e1b4b 100%)" },
    outgoing: "#6366f1",
    incoming: "#161629",
  },
  {
    id: "forest",
    label: "Forest",
    background: { type: "gradient", value: "linear-gradient(160deg, #04140d 0%, #166534 100%)" },
    outgoing: "#22c55e",
    incoming: "#12291d",
  },
  {
    id: "minimal",
    label: "Minimal",
    background: { type: "solid", value: "#f8fafc" },
    outgoing: "#111827",
    incoming: "#e2e8f0",
  },
  {
    id: "neon",
    label: "Neon",
    background: { type: "gradient", value: "linear-gradient(160deg, #05010f 0%, #3b0764 100%)" },
    outgoing: "#d946ef",
    incoming: "#1b0b2e",
  },
];

/** Returns black or white depending on which one reads best on `hex`. */
export function readableTextColor(hex: string | null | undefined): string {
  if (!hex) return "#ffffff";
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#ffffff";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0b1020" : "#ffffff";
}

/** CSS style for the chat surface based on stored preferences. */
export function backgroundStyle(
  preferences: ChatPreferences,
  resolvedImageUrl?: string | null,
): React.CSSProperties {
  switch (preferences.background_type) {
    case "solid":
      return { background: preferences.background_value ?? "transparent" };
    case "gradient":
      return { backgroundImage: preferences.background_value ?? "none" };
    case "image": {
      const preset = IMAGE_BACKGROUNDS.find((item) => item.id === preferences.background_value);
      return preset ? { background: preset.css } : {};
    }
    case "photo":
      return resolvedImageUrl
        ? {
            backgroundImage: `url(${resolvedImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : {};
    default:
      return {};
  }
}

/** Haptic feedback when the device supports it. */
export function haptic(pattern: number | number[] = 8) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
