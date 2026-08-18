import type { SupabaseClient } from "@supabase/supabase-js";
import { collectTargetLanguages, mapWithConcurrency } from "@/lib/translation-targets";
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
  options?: {
    mode?: TranslationMode;
    engine?: string | null;
    quotaUserId?: string | null;
    /** Pre-fetched context, shared across the fan-out of a single message. */
    context?: TranslationContextMessage[];
  },
) {
  const { data: existing } = await supabase
    .from("message_translations")
    .select("translated_text, engine, confidence_score, corrected_by_user, alternative_translation")
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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Cost guard: only one worker may pay for a given (message, language) pair.
  // A concurrent caller waits for the cache instead of buying the same
  // translation twice. Stale claims (>120 s) are automatically reclaimable.
  const { data: claimed } = await supabaseAdmin.rpc("claim_translation_slot", {
    _message_id: message.id,
    _language: language,
  });
  if (claimed !== true) {
    const { data: fresh } = await supabaseAdmin
      .from("message_translations")
      .select(
        "translated_text, engine, confidence_score, corrected_by_user, alternative_translation",
      )
      .eq("message_id", messageId)
      .eq("language", language)
      .maybeSingle();
    if (fresh) return { ...fresh, cached: true };
    throw new Error("Traduction déjà en cours. Réessayez dans un instant.");
  }

  try {
    // Group fan-out translates one message into N languages: the conversation
    // context is identical for every target, so it is fetched once upstream.
    const context =
      options?.context ??
      (options?.mode === "premium"
        ? await conversationContext(
            supabase,
            message.conversation_id,
            message.created_at,
            message.sender_id ?? "",
          )
        : undefined);

    // Relation-scoped memory: nicknames, private jokes and validated corrections
    // of THIS conversation only. Never mixed with other conversations.
    const { conversationGlossary } = await import("./translation-memory.server");
    const glossary = await conversationGlossary(supabase, message.conversation_id, language);

    const result = await translateWithRouter(
      {
        text: message.original_text,
        sourceLanguage: message.source_language,
        targetLanguage: language,
        ...(context ? { context } : {}),
        ...(glossary.length ? { glossary } : {}),
      },
      {
        ...(options?.engine !== undefined ? { engine: options.engine } : {}),
        ...(options?.mode ? { mode: options.mode } : {}),
      },
    );

    await consumeQuota(options?.quotaUserId);

    const { error: insertError } = await supabaseAdmin
      .from("message_translations")
      .upsert(
        {
          message_id: message.id,
          language,
          translated_text: result.text,
          engine: result.engine,
          translation_provider: result.engine,
          confidence_score: result.confidence ?? null,
          alternative_translation: result.alternative ?? null,
        },
        { onConflict: "message_id,language" },
      );
    if (insertError) throw new Error(insertError.message);

    return {
      translated_text: result.text,
      engine: result.engine,
      confidence_score: result.confidence ?? null,
      alternative_translation: result.alternative ?? null,
      cached: false,
    };
  } catch (error) {
    // Free the slot so a later retry is not blocked by a failed attempt.
    await supabaseAdmin.rpc("release_translation_slot", {
      _message_id: message.id,
      _language: language,
    });
    throw error;
  }

}


/** Languages spoken by the participants (and web guests) of a conversation. */
async function participantLanguages(supabase: Client, conversationId: string) {
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);

  const userIds = (participants ?? []).map((p) => p.user_id);
  const profiles = userIds.length
    ? ((
        await supabase
          .from("profiles")
          .select("id, primary_language, secondary_language")
          .in("id", userIds)
      ).data ?? [])
    : [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: guests } = await supabaseAdmin
    .from("guest_users")
    .select("language")
    .eq("conversation_id", conversationId);

  return collectTargetLanguages(
    profiles,
    (guests ?? []).map((guest) => guest.language),
  );
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

  // Fires at most once per message (see notifyNewMessage's claim column) —
  // safe to call unconditionally even though this function itself can be
  // re-entered by a translation retry or recoverStalledTranslations.
  const { notifyNewMessage } = await import("./push.server");
  await notifyNewMessage(messageId);

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

  // Fetched once for the whole fan-out instead of once per target language.
  const { data: full } = await supabase
    .from("messages")
    .select("sender_id, created_at")
    .eq("id", messageId)
    .maybeSingle();
  const sharedContext =
    targets.size > 1 && full
      ? await conversationContext(
          supabase,
          message.conversation_id,
          full.created_at,
          full.sender_id ?? "",
        )
      : undefined;

  // Bounded parallelism: a 5-language group no longer waits for 5 sequential
  // AI calls, while the provider is never flooded by a single message.
  await mapWithConcurrency([...targets], 3, async (language) => {
    try {
      const result = await ensureTranslation(supabase, messageId, language, {
        quotaUserId: quotaUserId ?? null,
        ...(sharedContext ? { context: sharedContext } : {}),
      });
      if (!result.cached) translated += 1;
    } catch (translationError) {
      failed += 1;
      lastError =
        translationError instanceof Error ? translationError.message : "Traduction indisponible.";
    }
  });


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

/** After this delay a message still in `pending` is abandoned work, not work in progress. */
const TRANSLATION_STALL_MS = 60_000;

/**
 * Replays the translation of messages left in `pending` by a killed request
 * (Safari tab suspended, worker recycled). Without this the bubble spins on
 * "Traduction…" forever, since nothing server-side ever picks the row back up.
 */
export async function recoverStalledTranslations(conversationId: string, limit = 5) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const threshold = new Date(Date.now() - TRANSLATION_STALL_MS).toISOString();

  const { data: stalled } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("translation_status", "pending")
    .lt("created_at", threshold)
    .order("created_at", { ascending: false })
    .limit(limit);

  let recovered = 0;
  let failed = 0;
  for (const row of stalled ?? []) {
    // Claim the row so two open tabs cannot translate (and bill) it twice.
    const { data: claimed } = await supabaseAdmin
      .from("messages")
      .update({ translation_status: "retrying" })
      .eq("id", row.id)
      .eq("translation_status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
      await translateMessageForParticipants(supabaseAdmin, row.id, null);
      recovered += 1;
    } catch (error) {
      failed += 1;
      await supabaseAdmin
        .from("messages")
        .update({
          translation_status: "failed",
          translation_error:
            error instanceof Error ? error.message : "Traduction indisponible.",
        })
        .eq("id", row.id);
    }
  }
  return { recovered, failed };
}
