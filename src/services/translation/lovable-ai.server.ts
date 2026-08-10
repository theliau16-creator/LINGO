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
      const glossary = (request.glossary ?? []).slice(0, 40);

      const instructions = [
        "Tu es un moteur de traduction. Traduis le texte de l'utilisateur",
        `depuis la langue "${sourceLanguage}" vers la langue "${targetLanguage}" (codes ISO-639-1).`,
        "Conserve les emojis, la ponctuation, le registre et le niveau de familiarité.",
        "Si le texte est déjà dans la langue cible, renvoie-le tel quel.",
        tone ? `Adapte le ton pour qu'il soit ${tone}.` : "",
        glossary.length
          ? `Mémoire de cette relation — utilise IMPÉRATIVEMENT ces équivalences (surnoms, private jokes, corrections déjà validées) : ${glossary
              .map((item) => `"${item.term}" => "${item.translation}"`)
              .join(" ; ")}`
          : "",
        context.length
          ? `Contexte récent de la conversation (à titre indicatif uniquement, ne le traduis pas) : ${context
              .map((item) => `${item.role === "me" ? "A" : "B"}: ${item.text}`)
              .join(" | ")}`
          : "",
        'Réponds UNIQUEMENT avec un objet JSON compact : {"t":"la traduction","c":0.0,"alt":null}.',
        '"c" est ta confiance entre 0 et 1 (baisse-la pour le slang, le sarcasme, les doubles sens, les fautes importantes, les mots inventés, les messages très courts ou ambigus).',
        '"alt" contient une seconde interprétation plausible uniquement si le texte est réellement ambigu, sinon null.',
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

      return { ...parseModelOutput(output, text), engine: "lovable-ai" };
    },
  };
}

/**
 * The model answers with a compact JSON envelope carrying the translation, a
 * confidence score and an optional second reading. Any deviation (plain text,
 * truncated stream) degrades gracefully to "the raw output is the translation".
 */
function parseModelOutput(
  output: string,
  fallback: string,
): { text: string; confidence?: number; alternative?: string | null } {
  const raw = output.trim();
  if (!raw) return { text: fallback };

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        t?: unknown;
        c?: unknown;
        alt?: unknown;
      };
      if (typeof parsed.t === "string" && parsed.t.trim()) {
        const confidence =
          typeof parsed.c === "number" && Number.isFinite(parsed.c)
            ? Math.min(1, Math.max(0, parsed.c))
            : undefined;
        const alternative =
          typeof parsed.alt === "string" && parsed.alt.trim() ? parsed.alt.trim() : null;
        return {
          text: parsed.t.trim(),
          ...(confidence !== undefined ? { confidence } : {}),
          alternative,
        };
      }
    } catch {
      // fall through to the raw-text path
    }
  }

  return { text: raw };
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
