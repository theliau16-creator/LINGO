/**
 * Back-compatible entry point: the i18n implementation now lives in `src/lib/i18n/`.
 * `translate()` keeps its old signature for non-React call sites.
 */
export * from "./i18n/index";

import { translateWith } from "./i18n/provider";
import type { TranslationKey } from "./i18n/catalog";

export function translate(language: string | null | undefined, key: TranslationKey): string {
  return translateWith(language, key);
}
