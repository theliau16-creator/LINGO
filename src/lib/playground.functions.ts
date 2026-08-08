import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Translates one string and returns full developer-mode metadata. */
export const playgroundTranslate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; sourceLanguage: string; targetLanguage: string }) => {
    if (!input?.text?.trim()) throw new Error("Texte requis");
    if (!input.sourceLanguage || !input.targetLanguage) throw new Error("Langues requises");
    if (input.text.length > 2000) throw new Error("Texte trop long");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { translateWithDebug } = await import("./playground.server");
    return translateWithDebug({
      text: data.text,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage,
      userId: context.userId,
    });
  });
