/**
 * Every user-visible string of the app, in the source language (French) and in
 * English. Locale files under `../locales` are keyed on this catalogue.
 *
 * Adding a screen means adding its strings to one of the `strings/` modules —
 * never hardcoding text inside a component.
 */
import { legacyFr, legacy_en, legacy_es, legacy_de, legacy_it, legacy_pt, legacy_nl } from "./strings/legacy";
import { auth } from "./strings/auth";
import { chat } from "./strings/chat";
import { media } from "./strings/media";
import { invites } from "./strings/invites";
import { billing } from "./strings/billing";
import { social } from "./strings/social";
import { errors } from "./strings/errors";

export const FR = {
  ...legacyFr,
  ...auth.fr,
  ...chat.fr,
  ...media.fr,
  ...invites.fr,
  ...billing.fr,
  ...social.fr,
  ...errors.fr,
} as const;

export type TranslationKey = keyof typeof FR;

/** A locale dictionary may be partial: missing keys fall back to EN then FR. */
export type Dict = Partial<Record<TranslationKey, string>>;

export const EN: Dict = {
  ...errors.en,
  ...legacy_en,
  ...auth.en,
  ...chat.en,
  ...media.en,
  ...invites.en,
  ...billing.en,
  ...social.en,
};

/** Legacy partial dictionaries, merged into the generated locale files. */
export const LEGACY_LOCALES: Record<string, Dict> = {
  es: legacy_es,
  de: legacy_de,
  it: legacy_it,
  pt: legacy_pt,
  nl: legacy_nl,
};
