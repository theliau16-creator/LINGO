import { COUNTRIES } from "./countries";
import { LANGUAGES } from "./languages";

/**
 * Adapted from src/lib/country-language.ts (web). `detectCountry()` there
 * reads `navigator.language`, which doesn't exist in React Native — Phase 1
 * keeps onboarding minimal and just defaults to the first country (France),
 * same ultimate fallback the web version uses. A device-locale-based guess
 * (via expo-localization) can be added later without changing this contract.
 */
export const COUNTRY_LANGUAGE: Record<string, string> = {
  FR: "fr",
  BE: "fr",
  CH: "de",
  CA: "en",
  US: "en",
  GB: "en",
  ES: "es",
  PT: "pt",
  IT: "it",
  DE: "de",
  NL: "nl",
  MA: "ar",
  DZ: "ar",
  TN: "ar",
  SN: "fr",
  CI: "fr",
  BR: "pt",
  MX: "es",
  IN: "hi",
  JP: "ja",
};

export function languageForCountry(country: string | null | undefined): string {
  const code = COUNTRY_LANGUAGE[(country ?? "").toUpperCase()];
  return LANGUAGES.some((l) => l.code === code) ? code! : "fr";
}

export function detectCountry(): string {
  return COUNTRIES[0]!.code;
}
