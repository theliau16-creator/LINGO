import type { TranslationProvider, TranslationRequest, TranslationResult } from "./types";

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

/**
 * Google Translate implementation. Unconfigured (and therefore skipped) when
 * GOOGLE_TRANSLATE_API_KEY is missing.
 */
export function createGoogleTranslationProvider(apiKey?: string): TranslationProvider {
  return {
    id: "google",
    label: "Google Translate",
    isConfigured: Boolean(apiKey),
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      if (!apiKey) throw new Error("Google Translate n'est pas configuré.");
      const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: request.text,
          target: request.targetLanguage,
          ...(request.sourceLanguage && request.sourceLanguage !== "auto"
            ? { source: request.sourceLanguage }
            : {}),
          format: "text",
        }),
      });
      if (!response.ok) throw new Error(`Google Translate a échoué (${response.status}).`);
      const payload = (await response.json()) as {
        data?: { translations?: { translatedText: string }[] };
      };
      const text = payload.data?.translations?.[0]?.translatedText;
      if (!text) throw new Error("Google Translate n'a renvoyé aucune traduction.");
      return { text, engine: "google" };
    },
  };
}
