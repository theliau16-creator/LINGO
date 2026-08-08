import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  backfillConversationTranslations,
  ensureTranslation,
  openDirectConversation,
  translateMessageForParticipants,
} from "./chat.server";

/**
 * Translates a freshly sent message for every participant's language.
 * Runs after the message is already persisted: a failure never unsends it.
 */
export const translateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => {
    if (!input?.messageId) throw new Error("messageId requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    translateMessageForParticipants(context.supabase, data.messageId, context.userId),
  );

/** Returns (creating it only when missing) the translation of one message. */
export const ensureMessageTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; language: string }) => {
    if (!input?.messageId) throw new Error("messageId requis");
    if (!input?.language) throw new Error("language requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    ensureTranslation(context.supabase, data.messageId, data.language, {
      quotaUserId: context.userId,
    }),
  );

/** Opens (or creates) the direct conversation with a friend. */
export const openConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { friendId: string }) => {
    if (!input?.friendId) throw new Error("friendId requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    openDirectConversation(context.supabase, context.userId, data.friendId),
  );

/** Translates the recent conversation history into the caller's language. */
export const backfillConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; language: string }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    if (!input?.language) throw new Error("language requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    backfillConversationTranslations(
      context.supabase,
      data.conversationId,
      data.language,
      context.userId,
    ),
  );
