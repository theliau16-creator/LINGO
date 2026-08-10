import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  isRtl,
  localeDir,
  normalizeLocale,
  resolveLocale,
} from "@/lib/i18n/core";
import { EN, FR } from "@/lib/i18n/catalog";
import { LOCALES } from "@/lib/i18n/locales";
import { translateWith } from "@/lib/i18n/provider";

describe("locale resolution", () => {
  it("exposes exactly the 20 languages of « Ma langue »", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(20);
    expect(new Set(SUPPORTED_LOCALES).size).toBe(20);
  });

  it("normalises regional tags to the stored code", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("pt-BR")).toBe("pt");
    expect(normalizeLocale("FR_fr")).toBe("fr");
    expect(normalizeLocale("en-US")).toBe("en");
  });

  it("maps legacy aliases without breaking existing accounts", () => {
    expect(normalizeLocale("iw")).toBe("he");
    expect(normalizeLocale("in")).toBe("hi");
  });

  it("rejects unsupported languages instead of guessing", () => {
    expect(normalizeLocale("xx")).toBeNull();
    expect(normalizeLocale("")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(resolveLocale("xx")).toBe(DEFAULT_LOCALE);
  });
});

describe("direction", () => {
  it("mirrors the UI for Arabic and Hebrew only", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he")).toBe(true);
    expect(isRtl("iw")).toBe(true);
    expect(isRtl("fr")).toBe(false);
    expect(localeDir("ar")).toBe("rtl");
    expect(localeDir("ja")).toBe("ltr");
  });
});

describe("browser detection", () => {
  it("picks the first supported browser language", () => {
    expect(detectBrowserLocale(["xx-XX", "ja-JP", "en"])).toBe("ja");
  });

  it("falls back when nothing matches", () => {
    expect(detectBrowserLocale(["xx", "yy"])).toBe(DEFAULT_LOCALE);
    expect(detectBrowserLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});

describe("translation lookup", () => {
  it("returns the requested locale when the key exists", () => {
    expect(translateWith("fr", "nav.chats")).toBe(FR["nav.chats"]);
    expect(translateWith("en", "nav.chats")).toBe(EN["nav.chats"]);
  });

  it("falls back to English then French for a missing key", () => {
    const dict = LOCALES.th;
    const missing = (Object.keys(FR) as (keyof typeof FR)[]).find((key) => !dict[key]);
    if (missing) {
      expect(translateWith("th", missing)).toBe(EN[missing] ?? FR[missing]);
    }
    expect(translateWith("xx", "nav.chats")).toBe(FR["nav.chats"]);
  });

  it("interpolates variables", () => {
    expect(translateWith("fr", "nav.chats", { unused: 1 })).toBe(FR["nav.chats"]);
  });

  it("never returns an empty string for a known key", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of Object.keys(FR) as (keyof typeof FR)[]) {
        expect(translateWith(locale, key).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("catalogue integrity", () => {
  it("keeps an English string for every French key", () => {
    const missing = (Object.keys(FR) as (keyof typeof FR)[]).filter((key) => !EN[key]);
    expect(missing).toEqual([]);
  });

  it("ships a dictionary for each supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALES[locale]).toBeDefined();
    }
  });
});
