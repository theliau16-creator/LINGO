import { describe, expect, it } from "vitest";
import { collectTargetLanguages, mapWithConcurrency } from "@/lib/translation-targets";

describe("collectTargetLanguages", () => {
  it("deduplicates members sharing the same language", () => {
    const targets = collectTargetLanguages([
      { primary_language: "fr" },
      { primary_language: "fr" },
      { primary_language: "en" },
    ]);
    expect([...targets].sort()).toEqual(["en", "fr"]);
  });

  it("keeps one target per distinct language in a multilingual group", () => {
    const targets = collectTargetLanguages([
      { primary_language: "fr" },
      { primary_language: "es" },
      { primary_language: "ja" },
      { primary_language: "es" },
    ]);
    expect(targets.size).toBe(3);
  });

  it("ignores secondary languages in groups to bound the fan-out cost", () => {
    const targets = collectTargetLanguages([
      { primary_language: "fr", secondary_language: "de" },
      { primary_language: "en", secondary_language: "it" },
      { primary_language: "es", secondary_language: "pt" },
    ]);
    expect([...targets].sort()).toEqual(["en", "es", "fr"]);
  });

  it("keeps the secondary language in a direct conversation", () => {
    const targets = collectTargetLanguages([
      { primary_language: "fr", secondary_language: "de" },
      { primary_language: "en" },
    ]);
    expect([...targets].sort()).toEqual(["de", "en", "fr"]);
  });

  it("includes web guests as readers", () => {
    const targets = collectTargetLanguages([{ primary_language: "fr" }], ["ar", null, "fr"]);
    expect([...targets].sort()).toEqual(["ar", "fr"]);
  });

  it("returns an empty set without participants", () => {
    expect(collectTargetLanguages([]).size).toBe(0);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });
});
