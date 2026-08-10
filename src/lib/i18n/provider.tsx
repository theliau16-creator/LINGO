import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { EN, FR, type Dict, type TranslationKey } from "./catalog";
import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  isRtl,
  localeDir,
  setActiveLocale,
  normalizeLocale,
  resolveLocale,
  type Locale,
} from "./core";
import { LOCALES } from "./locales";

const STORAGE_KEY = "lingo.locale";

/**
 * Resolves a key: requested locale → English → French.
 * A missing key is a defect, but it must never render an empty label.
 */
export function translateWith(
  locale: string | null | undefined,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const code = resolveLocale(locale);
  const dict: Dict | undefined = LOCALES[code];
  const raw = dict?.[key] ?? EN[key] ?? FR[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

type LocaleContextValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  rtl: boolean;
  t: TFunction;
  /** Sets the locale for this session (used before the profile is saved). */
  setLocale: (next: string | null | undefined) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Locale persisted locally, so a reload never flashes the wrong language. */
export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeLocale(locale: string | null | undefined) {
  if (typeof window === "undefined") return;
  const code = normalizeLocale(locale);
  if (!code) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* private mode: the account preference still rules on the next load */
  }
}

/**
 * Wraps the app. `preferred` is the account preference (profiles.primary_language)
 * once known; before that we use the persisted locale, then the browser one.
 */
export function LocaleProvider({
  children,
  preferred,
}: {
  children: ReactNode;
  preferred?: string | null;
}) {
  const [sessionLocale, setSessionLocale] = useState<Locale>(() => DEFAULT_LOCALE);

  // Client-only: reading localStorage/navigator during render would mismatch SSR.
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) {
      setSessionLocale(stored);
      return;
    }
    setSessionLocale(detectBrowserLocale(navigator.languages ?? [navigator.language]));
  }, []);

  // The account preference always wins once it is loaded.
  useEffect(() => {
    const account = normalizeLocale(preferred);
    if (!account) return;
    setSessionLocale(account);
    storeLocale(account);
  }, [preferred]);

  const setLocale = useCallback((next: string | null | undefined) => {
    const code = normalizeLocale(next);
    if (!code) return;
    setSessionLocale(code);
    storeLocale(code);
  }, []);

  const locale = sessionLocale;

  // Screen readers, text selection and layout mirroring all key off <html>.
  // Non-React helpers (error mapping, imperative toasts) read this.
  setActiveLocale(locale);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: localeDir(locale),
      rtl: isRtl(locale),
      setLocale,
      t: (key, vars) => translateWith(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Full locale controls (language, direction, setter). */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  // Defensive fallback: a component rendered outside the provider still reads text.
  return {
    locale: DEFAULT_LOCALE,
    dir: "ltr",
    rtl: false,
    setLocale: () => {},
    t: (key, vars) => translateWith(DEFAULT_LOCALE, key, vars),
  };
}

/** Translation helper: `const { t } = useT()`. */
export function useT() {
  const { t, locale, rtl, dir } = useLocale();
  return { t, language: locale, locale, rtl, dir };
}
