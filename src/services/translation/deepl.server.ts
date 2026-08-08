import type { TranslationProvider, TranslationRequest, TranslationResult } from "./types";
import { boundContext } from "./types";

const ENDPOINT = "https://api-free.deepl.com/v2/translate";
const PRO_ENDPOINT = "https://api.deepl.com/v2/translate";

/**
 * DeepL implementation. Returns an unconfigured provider when DEEPL_API_KEY is
 * absent so the app degrades gracefully instead of throwing.
 */
export function createDeeplTranslationProvider(apiKey?: string): TranslationProvider {
  return {
    id: "deepl",
    label: "DeepL",
    isConfigured: Boolean(apiKey),
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      if (!apiKey) throw new Error("DeepL n'est pas configuré.");
      void boundContext(request.context); // DeepL has no context parameter
      const endpoint = apiKey.endsWith(":fx") ? ENDPOINT : PRO_ENDPOINT;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: [request.text],
          target_lang: request.targetLanguage.toUpperCase(),
          ...(request.sourceLanguage && request.sourceLanguage !== "auto"
            ? { source_lang: request.sourceLanguage.toUpperCase() }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(`DeepL a échoué (${response.status}).`);
      const payload = (await response.json()) as { translations?: { text: string }[] };
      const text = payload.translations?.[0]?.text;
      if (!text) throw new Error("DeepL n'a renvoyé aucune traduction.");
      return { text, engine: "deepl" };
    },
  };
}
