/** Copied from src/lib/countries.ts (web) — pure data, straight port. */

export type Country = { code: string; name: string; dial: string; flag: string };

export const COUNTRIES: Country[] = [
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "BE", name: "Belgique", dial: "+32", flag: "🇧🇪" },
  { code: "CH", name: "Suisse", dial: "+41", flag: "🇨🇭" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "US", name: "États-Unis", dial: "+1", flag: "🇺🇸" },
  { code: "GB", name: "Royaume-Uni", dial: "+44", flag: "🇬🇧" },
  { code: "ES", name: "Espagne", dial: "+34", flag: "🇪🇸" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { code: "IT", name: "Italie", dial: "+39", flag: "🇮🇹" },
  { code: "DE", name: "Allemagne", dial: "+49", flag: "🇩🇪" },
  { code: "NL", name: "Pays-Bas", dial: "+31", flag: "🇳🇱" },
  { code: "MA", name: "Maroc", dial: "+212", flag: "🇲🇦" },
  { code: "DZ", name: "Algérie", dial: "+213", flag: "🇩🇿" },
  { code: "TN", name: "Tunisie", dial: "+216", flag: "🇹🇳" },
  { code: "SN", name: "Sénégal", dial: "+221", flag: "🇸🇳" },
  { code: "CI", name: "Côte d'Ivoire", dial: "+225", flag: "🇨🇮" },
  { code: "BR", name: "Brésil", dial: "+55", flag: "🇧🇷" },
  { code: "MX", name: "Mexique", dial: "+52", flag: "🇲🇽" },
  { code: "IN", name: "Inde", dial: "+91", flag: "🇮🇳" },
  { code: "JP", name: "Japon", dial: "+81", flag: "🇯🇵" },
];

/** Builds an E.164 number from a dial code and a locally typed number. */
export function toE164(dial: string, local: string): string {
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  return `${dial}${digits}`;
}
