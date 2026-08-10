import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { GlossaryEntry } from "@/services/translation/types";

type Client = SupabaseClient<Database>;

const MAX_GLOSSARY_ENTRIES = 40;

/**
 * Conversation Translation Memory — strictly scoped to one relation.
 * Nothing here is ever shared with another conversation: the query is always
 * filtered on `conversation_id`, and RLS restricts it to its participants.
 */
export async function conversationGlossary(
  supabase: Client,
  conversationId: string,
  targetLanguage: string,
): Promise<GlossaryEntry[]> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("translation_memory_enabled")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversation && conversation.translation_memory_enabled === false) return [];

  const { data } = await supabase
    .from("conversation_translation_memory")
    .select("term, preferred_translation")
    .eq("conversation_id", conversationId)
    .eq("target_language", targetLanguage)
    .order("updated_at", { ascending: false })
    .limit(MAX_GLOSSARY_ENTRIES);

  return (data ?? []).map((row) => ({ term: row.term, translation: row.preferred_translation }));
}

/**
 * Records a user correction:
 * 1. keeps an immutable audit row in `translation_corrections`,
 * 2. replaces the stored translation of that message (the original text is
 *    never touched),
 * 3. feeds the relation memory so the same expression is reused next time.
 */
export async function saveTranslationCorrection(
  supabase: Client,
  userId: string,
  input: { messageId: string; language: string; correctedText: string },
) {
  const corrected = input.correctedText.trim();
  if (!corrected) throw new Error("La traduction corrigée est vide.");

  const { data: message, error } = await supabase
    .from("messages")
    .select("id, conversation_id, original_text, source_language")
    .eq("id", input.messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) throw new Error("Message introuvable.");

  const { data: current } = await supabase
    .from("message_translations")
    .select("translated_text")
    .eq("message_id", message.id)
    .eq("language", input.language)
    .maybeSingle();

  const { error: correctionError } = await supabase.from("translation_corrections").insert({
    message_id: message.id,
    conversation_id: message.conversation_id,
    user_id: userId,
    source_language: message.source_language,
    target_language: input.language,
    original_text: message.original_text,
    previous_translation: current?.translated_text ?? null,
    corrected_translation: corrected,
  });
  if (correctionError) throw new Error(correctionError.message);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: upsertError } = await supabaseAdmin.from("message_translations").upsert(
    {
      message_id: message.id,
      language: input.language,
      translated_text: corrected,
      engine: "user",
      translation_provider: "user",
      corrected_by_user: true,
      confidence_score: 1,
    },
    { onConflict: "message_id,language" },
  );
  if (upsertError) throw new Error(upsertError.message);

  // Only short expressions are worth memorising: a whole paragraph would never
  // reappear verbatim and would pollute the glossary.
  const term = message.original_text.trim();
  if (term.length <= 120) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("translation_memory_enabled")
      .eq("id", message.conversation_id)
      .maybeSingle();

    if (!conversation || conversation.translation_memory_enabled !== false) {
      await supabase.from("conversation_translation_memory").upsert(
        {
          conversation_id: message.conversation_id,
          term,
          preferred_translation: corrected,
          source_language: message.source_language,
          target_language: input.language,
          kind: "correction",
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,term,target_language" },
      );
    }
  }

  return { translated_text: corrected };
}

/** Wipes every remembered term of a conversation — really deletes the rows. */
export async function clearConversationMemory(supabase: Client, conversationId: string) {
  const { error } = await supabase
    .from("conversation_translation_memory")
    .delete()
    .eq("conversation_id", conversationId);
  if (error) throw new Error(error.message);
  return { cleared: true };
}

/** Enables or disables the relation memory for a conversation. */
export async function setConversationMemoryEnabled(
  supabase: Client,
  conversationId: string,
  enabled: boolean,
) {
  const { error } = await supabase
    .from("conversations")
    .update({ translation_memory_enabled: enabled })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
  return { enabled };
}

/** Terms remembered for this relation, for the conversation settings screen. */
export async function listConversationMemory(supabase: Client, conversationId: string) {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("translation_memory_enabled")
    .eq("id", conversationId)
    .maybeSingle();

  const { data } = await supabase
    .from("conversation_translation_memory")
    .select("id, term, preferred_translation, target_language, kind, updated_at")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(100);

  return {
    enabled: conversation?.translation_memory_enabled ?? true,
    entries: data ?? [],
  };
}
