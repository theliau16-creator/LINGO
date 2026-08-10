export { FR, EN, type TranslationKey, type Dict } from "./catalog";
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  getActiveLocale,
  setActiveLocale,
  isRtl,
  localeDir,
  normalizeLocale,
  resolveLocale,
  type Locale,
} from "./core";
export { LOCALES } from "./locales";
export {
  LocaleProvider,
  readStoredLocale,
  storeLocale,
  translateWith,
  useLocale,
  useT,
  type TFunction,
} from "./provider";
