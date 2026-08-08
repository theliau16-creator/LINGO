import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "./types";
import { boundContext } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-5.6-sol";

/**
 * Lovable AI implementation of the TranslationService contract.
 * Streams the gateway response (required for reasoning-capable models) and
 * accumulates the deltas into a single translated string.
 */
export function createLovableAiTranslationProvider(apiKey?: string): TranslationProvider {
  return {
    id: "lovable-ai",
    label: "Lingo AI",
    isConfigured: Boolean(apiKey),
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      if (!apiKey) throw new Error("Le moteur de traduction n'est pas configuré.");
      const { text, sourceLanguage, targetLanguage, tone } = request;
      const context = boundContext(request.context);

      const instructions = [
        "Tu es un moteur de traduction. Traduis le texte de l'utilisateur",
        `depuis la langue "${sourceLanguage}" vers la langue "${targetLanguage}" (codes ISO-639-1).`,
        "Réponds UNIQUEMENT avec la traduction, sans guillemets, sans explication, sans préfixe.",
        "Conserve les emojis, la ponctuation, le registre et le niveau de familiarité.",
        "Si le texte est déjà dans la langue cible, renvoie-le tel quel.",
        tone ? `Adapte le ton pour qu'il soit ${tone}.` : "",
        context.length
          ? `Contexte récent de la conversation (à titre indicatif uniquement, ne le traduis pas) : ${context
              .map((item) => `${item.role === "me" ? "A" : "B"}: ${item.text}`)
              .join(" | ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: MODEL,
          instructions,
          input: text,
          stream: true,
          store: false,
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new TranslationError(response.status, detail);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as {
              type?: string;
              delta?: string;
              response?: { output_text?: string };
            };
            if (event.type === "response.output_text.delta" && event.delta) {
              output += event.delta;
            } else if (event.type === "response.completed" && !output) {
              output = event.response?.output_text ?? "";
            }
          } catch {
            // ignore malformed keep-alive chunks
          }
        }
      }

      return { text: output.trim() || text, engine: "lovable-ai" };
    },
  };
}

export class TranslationError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(
      status === 429
        ? "Trop de traductions d'un coup, réessayez dans un instant."
        : status === 402
          ? "Crédits IA épuisés — ajoutez des crédits pour continuer à traduire."
          : `La traduction a échoué (${status}).`,
    );
    this.name = "TranslationError";
  }
}
