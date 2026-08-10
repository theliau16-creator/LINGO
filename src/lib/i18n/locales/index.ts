import { EN, FR, LEGACY_LOCALES, type Dict } from "../catalog";
import type { Locale } from "../core";

import { dict as es } from "./generated/es";
import { dict as pt } from "./generated/pt";
import { dict as it } from "./generated/it";
import { dict as de } from "./generated/de";
import { dict as nl } from "./generated/nl";
import { dict as pl } from "./generated/pl";
import { dict as ru } from "./generated/ru";
import { dict as uk } from "./generated/uk";
import { dict as tr } from "./generated/tr";
import { dict as ar } from "./generated/ar";
import { dict as he } from "./generated/he";
import { dict as hi } from "./generated/hi";
import { dict as zh } from "./generated/zh";
import { dict as ja } from "./generated/ja";
import { dict as ko } from "./generated/ko";
import { dict as vi } from "./generated/vi";
import { dict as th } from "./generated/th";
import { dict as sv } from "./generated/sv";

/** Merges the hand-written legacy wording over the generated dictionary. */
function withLegacy(code: string, generated: Dict): Dict {
  return { ...generated, ...(LEGACY_LOCALES[code] ?? {}) };
}

/** Static dictionaries: no AI call, no network, no flash of untranslated text. */
export const LOCALES: Record<Locale, Dict> = {
  fr: FR,
  en: EN,
  es: withLegacy("es", es),
  pt: withLegacy("pt", pt),
  it: withLegacy("it", it),
  de: withLegacy("de", de),
  nl: withLegacy("nl", nl),
  pl,
  ru,
  uk,
  tr,
  ar,
  he,
  hi,
  zh,
  ja,
  ko,
  vi,
  th,
  sv,
};
