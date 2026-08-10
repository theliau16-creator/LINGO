/**
 * Locale primitives shared by client and server code.
 * Kept free of React so tests and server helpers can import them.
 */

/** The 20 languages exposed in « Réglages > Ma langue ». */
export const SUPPORTED_LOCALES = [
  "fr",
  "en",
  "es",
  "pt",
  "it",
  "de",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "ar",
  "he",
  "hi",
  "zh",
  "ja",
  "ko",
  "vi",
  "th",
  "sv",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Right-to-left scripts: the whole UI mirrors for these. */
const RTL_LOCALES = new Set<string>(["ar", "he"]);

/**
 * Historical / regional aliases that must resolve to a stored code.
 * `iw` and `in` are legacy ISO codes still emitted by some browsers.
 */
const ALIASES: Record<string, Locale> = {
  iw: "he",
  in: "hi",
  ji: "he",
  nb: "sv",
  nn: "sv",
  cmn: "zh",
  fil: "en",
};

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES);

/**
 * Normalises any BCP-47 tag or stored value to one of the 20 supported codes.
 * `zh-CN`, `ZH_Hans`, `pt-BR` and `iw` all collapse to a code the database
 * already stores, so existing accounts keep working untouched.
 */
export function normalizeLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return null;
  if (SUPPORTED.has(raw)) return raw as Locale;
  if (ALIASES[raw]) return ALIASES[raw]!;
  const base = raw.split("-")[0]!;
  if (SUPPORTED.has(base)) return base as Locale;
  return ALIASES[base] ?? null;
}

/** Same as `normalizeLocale` but always returns a usable locale. */
export function resolveLocale(input: string | null | undefined, fallback: Locale = DEFAULT_LOCALE) {
  return normalizeLocale(input) ?? fallback;
}

export function isRtl(locale: string | null | undefined): boolean {
  const code = normalizeLocale(locale);
  return code ? RTL_LOCALES.has(code) : false;
}

export function localeDir(locale: string | null | undefined): "rtl" | "ltr" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/**
 * Best locale for a visitor with no account yet: first browser language that
 * is part of the supported set, otherwise the fallback.
 */
export function detectBrowserLocale(
  languages: readonly string[] | undefined,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  for (const candidate of languages ?? []) {
    const match = normalizeLocale(candidate);
    if (match) return match;
  }
  return fallback;
}

/**
 * Active locale for non-React call sites (error helpers, imperative toasts).
 * The provider keeps this in sync with the rendered locale.
 */
let activeLocale: Locale = DEFAULT_LOCALE;

export function setActiveLocale(locale: Locale) {
  activeLocale = locale;
}

export function getActiveLocale(): Locale {
  return activeLocale;
}
