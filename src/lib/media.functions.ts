import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  sendPhotoMessage,
  sendVoiceMessage,
  transcribeVoiceMessage,
  type Attachment,
} from "./media.server";

function validAttachments(list: unknown): Attachment[] {
  if (!Array.isArray(list) || list.length === 0) throw new Error("Aucun fichier.");
  if (list.length > 6) throw new Error("6 photos maximum par message.");
  return list.map((raw) => {
    const item = raw as Attachment;
    if (!item?.path || typeof item.path !== "string") throw new Error("Fichier invalide.");
    return item;
  });
}

/** Sends one or several photos, with an optional translated caption. */
export const sendPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      attachments: Attachment[];
      caption?: string;
      language: string;
    }) => {
      if (!input?.conversationId) throw new Error("conversationId requis");
      if (!input?.language) throw new Error("language requis");
      validAttachments(input.attachments);
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("media_upload", { kind: "user", id: context.userId });
    return sendPhotoMessage(context.supabase, context.userId, {
      conversationId: data.conversationId,
      attachments: data.attachments,
      language: data.language,
      ...(data.caption ? { caption: data.caption } : {}),
    });
  });

/** Sends a recorded voice message; transcription and translation follow. */
export const sendVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { conversationId: string; path: string; durationMs: number; language: string }) => {
      if (!input?.conversationId) throw new Error("conversationId requis");
      if (!input?.path) throw new Error("path requis");
      if (!input?.language) throw new Error("language requis");
      if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
        throw new Error("Durée invalide.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("transcription", { kind: "user", id: context.userId });
    return sendVoiceMessage(context.supabase, context.userId, data);
  });

/** Runs (or retries) the transcription of a voice message the caller can read. */
export const retryTranscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => {
    if (!input?.messageId) throw new Error("messageId requis");
    return input;
  })
  .handler(async ({ data, context }) => {
    // RLS check first: only a participant of the conversation may trigger this.
    const { data: visible } = await context.supabase
      .from("voice_messages")
      .select("id")
      .eq("message_id", data.messageId)
      .maybeSingle();
    if (!visible) throw new Error("Message vocal introuvable.");
    await (await import("./rate-limit.server")).enforceRateLimit("transcription", { kind: "user", id: context.userId });
    return transcribeVoiceMessage(data.messageId);
  });


/**
 * Resumes voice notes stuck in a non-terminal state in this conversation.
 * Participants only; safe to call repeatedly (already-finished rows are skipped).
 */
export const recoverStalledVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!allowed) throw new Error("Conversation introuvable.");
    const { recoverStalledVoiceMessages } = await import("./media.server");
    return recoverStalledVoiceMessages(data.conversationId);
  });

/** Admin only: removes uploads that never ended up attached to a message. */
export const cleanupOrphanMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dryRun?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { collectOrphanMedia } = await import("./media-gc.server");
    return collectOrphanMedia({ dryRun: data.dryRun ?? false });
  });
