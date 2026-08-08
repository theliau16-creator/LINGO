/** Supported interface languages for translation. */
export type Language = {
  code: string;
  label: string;
  native: string;
  flag: string;
};

export const LANGUAGES: Language[] = [
  { code: "fr", label: "Français", native: "Français", flag: "🇫🇷" },
  { code: "en", label: "Anglais", native: "English", flag: "🇬🇧" },
  { code: "es", label: "Espagnol", native: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Portugais", native: "Português", flag: "🇵🇹" },
  { code: "it", label: "Italien", native: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "Allemand", native: "Deutsch", flag: "🇩🇪" },
  { code: "nl", label: "Néerlandais", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "Polonais", native: "Polski", flag: "🇵🇱" },
  { code: "ru", label: "Russe", native: "Русский", flag: "🇷🇺" },
  { code: "uk", label: "Ukrainien", native: "Українська", flag: "🇺🇦" },
  { code: "tr", label: "Turc", native: "Türkçe", flag: "🇹🇷" },
  { code: "ar", label: "Arabe", native: "العربية", flag: "🇸🇦" },
  { code: "he", label: "Hébreu", native: "עברית", flag: "🇮🇱" },
  { code: "hi", label: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "zh", label: "Chinois", native: "中文", flag: "🇨🇳" },
  { code: "ja", label: "Japonais", native: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "Coréen", native: "한국어", flag: "🇰🇷" },
  { code: "vi", label: "Vietnamien", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "th", label: "Thaï", native: "ไทย", flag: "🇹🇭" },
  { code: "sv", label: "Suédois", native: "Svenska", flag: "🇸🇪" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string | null | undefined): Language {
  return BY_CODE.get(code ?? "") ?? LANGUAGES[0]!;
}

export function languageLabel(code: string | null | undefined): string {
  const lang = getLanguage(code);
  return `${lang.flag} ${lang.native}`;
}

export function languageFlag(code: string | null | undefined): string {
  return getLanguage(code).flag;
}

export function languageName(code: string | null | undefined): string {
  return getLanguage(code).native;
}
