/**
 * TranslationService — provider-agnostic contract.
 *
 * Any engine (Lovable AI, DeepL, Google Translate, Microsoft Translator,
 * Gemini, ...) only has to implement `TranslationProvider`. The rest of the
 * application never talks to a vendor SDK directly, so swapping engines is a
 * one-line change in the registry.
 */

export type TranslationEngineId =
  | "lovable-ai"
  | "deepl"
  | "google"
  | "microsoft"
  | "openai"
  | "gemini";

/** Routing intent — lets the router pick an engine without the caller knowing which. */
export type TranslationMode = "economy" | "quality" | "premium";

/** A very small, bounded slice of the conversation used as context. */
export type TranslationContextMessage = {
  role: "peer" | "me";
  text: string;
};

export type TranslationRequest = {
  /** Raw text written by the sender. */
  text: string;
  /** ISO-639-1 code of the text, or "auto". */
  sourceLanguage: string;
  /** ISO-639-1 code to translate into. */
  targetLanguage: string;
  /** Optional stylistic hint (professional, friendly, ...). */
  tone?: string;
  /**
   * Optional, strictly bounded conversational context (max 3 short messages).
   * Never send a whole history: cost grows linearly with it.
   */
  context?: TranslationContextMessage[];
};

export type TranslationResult = {
  text: string;
  engine: TranslationEngineId;
};

export interface TranslationProvider {
  readonly id: TranslationEngineId;
  readonly label: string;
  /** False when the required credentials are missing — the engine is then skipped. */
  readonly isConfigured: boolean;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}

export const MAX_CONTEXT_MESSAGES = 3;
export const MAX_CONTEXT_CHARS = 200;

/** Trims context so a translation never sends an unbounded history to the engine. */
export function boundContext(
  context: TranslationContextMessage[] | undefined,
): TranslationContextMessage[] {
  if (!context?.length) return [];
  return context.slice(-MAX_CONTEXT_MESSAGES).map((item) => ({
    role: item.role,
    text: item.text.slice(0, MAX_CONTEXT_CHARS),
  }));
}

export const AVAILABLE_ENGINES: { id: TranslationEngineId; label: string }[] = [
  { id: "lovable-ai", label: "Lingo AI (par défaut)" },
  { id: "deepl", label: "DeepL" },
  { id: "google", label: "Google Translate" },
];
