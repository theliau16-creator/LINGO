import { createDeeplTranslationProvider } from "./deepl.server";
import { createGoogleTranslationProvider } from "./google.server";
import { createLovableAiTranslationProvider } from "./lovable-ai.server";
import type {
  TranslationEngineId,
  TranslationMode,
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "./types";

/**
 * Registry — the single place where engines are bound to the app.
 * Credentials are read from the server environment only; a provider without
 * credentials reports `isConfigured: false` and is simply never selected.
 */
export function listTranslationProviders(): TranslationProvider[] {
  return [
    createLovableAiTranslationProvider(process.env["LOVABLE_API_KEY"]),
    createDeeplTranslationProvider(process.env["DEEPL_API_KEY"]),
    createGoogleTranslationProvider(process.env["GOOGLE_TRANSLATE_API_KEY"]),
  ];
}

export function getProviderById(engine?: string | null): TranslationProvider | null {
  const requested = (engine ?? "lovable-ai") as TranslationEngineId;
  return listTranslationProviders().find((provider) => provider.id === requested) ?? null;
}

/** Public status list for the settings screen — never exposes any key. */
export function translationEngineStatuses() {
  return listTranslationProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: provider.isConfigured,
  }));
}

/**
 * Engine router. `mode` expresses intent, not a vendor:
 * economy  → fastest/cheapest configured engine
 * quality  → AI model
 * premium  → AI model with conversational context
 * Lovable AI is always the final fallback.
 */
export function resolveProvider(options?: {
  engine?: string | null;
  mode?: TranslationMode;
}): TranslationProvider {
  const providers = listTranslationProviders().filter((provider) => provider.isConfigured);
  const fallback = providers.find((provider) => provider.id === "lovable-ai");

  if (options?.engine) {
    const explicit = providers.find((provider) => provider.id === options.engine);
    if (explicit) return explicit;
  }

  if (options?.mode === "economy") {
    const cheap =
      providers.find((provider) => provider.id === "deepl") ??
      providers.find((provider) => provider.id === "google");
    if (cheap) return cheap;
  }

  const chosen = fallback ?? providers[0];
  if (!chosen) throw new Error("Aucun moteur de traduction n'est configuré.");
  return chosen;
}

/** Translates with the routed engine, falling back to Lovable AI on failure. */
export async function translateWithRouter(
  request: TranslationRequest,
  options?: { engine?: string | null; mode?: TranslationMode },
): Promise<TranslationResult> {
  const provider = resolveProvider(options);
  try {
    return await provider.translate(request);
  } catch (error) {
    const fallback = listTranslationProviders().find(
      (item) => item.id === "lovable-ai" && item.isConfigured,
    );
    if (!fallback || fallback.id === provider.id) throw error;
    return fallback.translate(request);
  }
}

/** Backwards-compatible helper used by existing call sites. */
export function getTranslationProvider(engine?: string | null): TranslationProvider {
  return resolveProvider(engine === undefined ? {} : { engine });
}
