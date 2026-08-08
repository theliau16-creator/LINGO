import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { translateWithRouter } from "@/services/translation/registry.server";
import type { TranslationContextMessage, TranslationMode } from "@/services/translation/types";

type Client = SupabaseClient<Database>;

/** Fetches at most 3 previous messages as bounded translation context. */
async function conversationContext(
  supabase: Client,
  conversationId: string,
  beforeCreatedAt: string,
  senderId: string,
): Promise<TranslationContextMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("sender_id, original_text, created_at")
    .eq("conversation_id", conversationId)
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(3);

  return (data ?? [])
    .reverse()
    .map((row) => ({ role: row.sender_id === senderId ? "me" : "peer", text: row.original_text }));
}

/**
 * Durable translation cache keyed by (message_id, language).
 * Returns the existing translation when there is one, creates it otherwise.
 * `quotaUserId` is the account debited for a real (non-cached) translation.
 */
export async function ensureTranslation(
  supabase: Client,
  messageId: string,
  language: string,
  options?: { mode?: TranslationMode; engine?: string | null; quotaUserId?: string | null },
) {
  const { data: existing } = await supabase
    .from("message_translations")
    .select("translated_text, engine")
    .eq("message_id", messageId)
    .eq("language", language)
    .maybeSingle();
  if (existing) return { ...existing, cached: true };

  const { data: message, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, original_text, source_language, created_at")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) throw new Error("Message introuvable.");
  if (message.source_language === language) {
    return { translated_text: message.original_text, engine: "none", cached: true };
  }

  // Quota is checked right before the real translation call and only debited
  // when it succeeds — cache hits and same-language messages stay free.
  const { assertQuota, consumeQuota } = await import("./quota.server");
  await assertQuota(options?.quotaUserId);

  const context =
    options?.mode === "premium"
      ? await conversationContext(
          supabase,
          message.conversation_id,
          message.created_at,
          message.sender_id,
        )
      : undefined;

  const result = await translateWithRouter(
    {
      text: message.original_text,
      sourceLanguage: message.source_language,
      targetLanguage: language,
      ...(context ? { context } : {}),
    },
    { ...(options?.engine !== undefined ? { engine: options.engine } : {}),
      ...(options?.mode ? { mode: options.mode } : {}) },
  );

  await consumeQuota(options?.quotaUserId);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: insertError } = await supabaseAdmin
    .from("message_translations")
    .upsert(
      {
        message_id: message.id,
        language,
        translated_text: result.text,
        engine: result.engine,
      },
      { onConflict: "message_id,language" },
    );
  if (insertError) throw new Error(insertError.message);

  return { translated_text: result.text, engine: result.engine, cached: false };
}

/** Languages spoken by the participants of a conversation. */
async function participantLanguages(supabase: Client, conversationId: string) {
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);

  const userIds = (participants ?? []).map((p) => p.user_id);
  if (userIds.length === 0) return new Set<string>();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, primary_language, secondary_language")
    .in("id", userIds);

  const targets = new Set<string>();
  for (const profile of profiles ?? []) {
    if (profile.primary_language) targets.add(profile.primary_language);
    if (profile.secondary_language) targets.add(profile.secondary_language);
  }
  return targets;
}

/**
 * Translates a message into every language spoken by the participants.
 * Never throws to the sender: the message stays sent, only `translation_status`
 * records the failure so the UI can offer a retry.
 */
export async function translateMessageForParticipants(
  supabase: Client,
  messageId: string,
  quotaUserId?: string | null,
) {
  const { data: message, error } = await supabase
    .from("messages")
    .select("id, conversation_id, source_language")
    .eq("id", messageId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!message) throw new Error("Message introuvable.");

  const targets = await participantLanguages(supabase, message.conversation_id);
  targets.delete(message.source_language);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (targets.size === 0) {
    await supabaseAdmin
      .from("messages")
      .update({ translation_status: "done", translation_error: null })
      .eq("id", messageId);
    return { translated: 0, failed: 0 };
  }

  let failed = 0;
  let lastError: string | null = null;
  let translated = 0;

  for (const language of targets) {
    try {
      const result = await ensureTranslation(supabase, messageId, language, { quotaUserId: quotaUserId ?? null });
      if (!result.cached) translated += 1;
    } catch (translationError) {
      failed += 1;
      lastError =
        translationError instanceof Error ? translationError.message : "Traduction indisponible.";
    }
  }

  await supabaseAdmin
    .from("messages")
    .update({
      translation_status: failed > 0 ? "failed" : "done",
      translation_error: failed > 0 ? lastError : null,
    })
    .eq("id", messageId);

  return { translated, failed };
}

/**
 * Ensures every recent message of a conversation has a translation in `language`.
 * Used when a user changes their language so the whole history follows.
 */
export async function backfillConversationTranslations(
  supabase: Client,
  conversationId: string,
  language: string,
  quotaUserId?: string | null,
  limit = 50,
) {
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, source_language, message_translations(language)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const missing = (messages ?? []).filter(
    (message) =>
      message.source_language !== language &&
      !(message.message_translations ?? []).some((t) => t.language === language),
  );
  if (missing.length === 0) return { translated: 0, failed: 0 };

  let translated = 0;
  let failed = 0;
  for (const message of missing) {
    try {
      await ensureTranslation(supabase, message.id, language, { quotaUserId: quotaUserId ?? null });
      translated += 1;
    } catch {
      failed += 1;
    }
  }

  return { translated, failed };
}

/** Returns the existing 1:1 conversation with `friendId`, creating it if needed. */
export async function openDirectConversation(supabase: Client, userId: string, friendId: string) {
  const { data: blocked } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("user_id", userId)
    .eq("blocked_id", friendId)
    .maybeSingle();
  if (blocked) throw new Error("Vous avez bloqué cette personne.");

  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);

  const myConversationIds = (mine ?? []).map((row) => row.conversation_id);

  if (myConversationIds.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", friendId)
      .in("conversation_id", myConversationIds);

    const existing = shared?.[0]?.conversation_id;
    if (existing) return { conversationId: existing };
  }

  // Creating the conversation and both participant rows must happen atomically:
  // RLS on `conversations`/`conversation_participants` only allows reads once the
  // caller is already a participant. A security-definer RPC handles it safely.
  const { data: conversationId, error } = await supabase.rpc("create_direct_conversation", {
    _friend_id: friendId,
  });
  if (error) throw new Error(error.message);
  if (!conversationId) throw new Error("Impossible de créer la conversation");

  return { conversationId };
}
