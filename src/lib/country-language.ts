import { COUNTRIES } from "@/lib/countries";
import { LANGUAGES } from "@/lib/languages";

/** Langue par défaut associée à chaque pays proposé à l'inscription. */
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

/** Langue par défaut d'un pays, repli sur le français. */
export function languageForCountry(country: string | null | undefined): string {
  const code = COUNTRY_LANGUAGE[(country ?? "").toUpperCase()];
  return LANGUAGES.some((l) => l.code === code) ? code! : "fr";
}

/** Devine le pays de l'appareil à partir de la locale du navigateur. */
export function detectCountry(): string {
  if (typeof navigator === "undefined") return COUNTRIES[0]!.code;
  const locales = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const locale of locales) {
    const region = locale.split("-")[1]?.toUpperCase();
    if (region && COUNTRIES.some((c) => c.code === region)) return region;
  }
  // Repli : premier pays dont la langue correspond à la langue du navigateur.
  const lang = (locales[0] ?? "fr").split("-")[0]!.toLowerCase();
  const match = COUNTRIES.find((c) => languageForCountry(c.code) === lang);
  return match?.code ?? COUNTRIES[0]!.code;
}
