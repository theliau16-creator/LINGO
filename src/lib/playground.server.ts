import { getTranslationProvider } from "@/services/translation/registry.server";

export type TranslationDebug = {
  originalText: string;
  detectedLanguage: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string | null;
  engine: string;
  durationMs: number;
  status: "success" | "error";
  error: string | null;
  estimatedCost: number;
};

/** Rough per-character cost estimate used by the developer mode panel. */
function estimateCost(text: string) {
  return Number(((text.length / 1000) * 0.0004).toFixed(6));
}

/**
 * Translates a single string and records a developer-mode log entry.
 * Used by the Translation Playground and any debug surface.
 */
export async function translateWithDebug(input: {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  userId: string | null;
}): Promise<TranslationDebug> {
  const started = Date.now();
  let debug: TranslationDebug = {
    originalText: input.text,
    detectedLanguage: input.sourceLanguage,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    translatedText: null,
    engine: "lovable-ai",
    durationMs: 0,
    status: "error",
    error: null,
    estimatedCost: estimateCost(input.text),
  };

  const { assertQuota, consumeQuota } = await import("./quota.server");

  try {
    // Le Playground est gratuit mais décompté du même quota centralisé.
    await assertQuota(input.userId);
    const provider = getTranslationProvider();
    const result = await provider.translate({
      text: input.text,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    });
    await consumeQuota(input.userId);
    debug = {
      ...debug,
      translatedText: result.text,
      engine: result.engine,
      durationMs: Date.now() - started,
      status: "success",
    };
  } catch (error) {
    debug = {
      ...debug,
      durationMs: Date.now() - started,
      status: "error",
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("translation_logs").insert({
      user_id: input.userId,
      original_text: debug.originalText,
      detected_language: debug.detectedLanguage,
      source_language: debug.sourceLanguage,
      target_language: debug.targetLanguage,
      translated_text: debug.translatedText,
      engine: debug.engine,
      duration_ms: debug.durationMs,
      status: debug.status,
      error: debug.error,
      estimated_cost: debug.estimatedCost,
    });
  } catch {
    // Logging must never break the translation flow.
  }

  if (debug.status === "error") throw new Error(debug.error ?? "Traduction impossible.");
  return debug;
}
