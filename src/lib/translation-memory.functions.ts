import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  clearConversationMemory,
  listConversationMemory,
  saveTranslationCorrection,
  setConversationMemoryEnabled,
} from "./translation-memory.server";

/** Saves a user correction and feeds this relation's translation memory. */
export const correctTranslation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; language: string; correctedText: string }) => {
    if (!input?.messageId) throw new Error("messageId requis");
    if (!input?.language) throw new Error("language requis");
    if (!input?.correctedText?.trim()) throw new Error("La traduction corrigée est vide.");
    return input;
  })
  .handler(async ({ data, context }) =>
    saveTranslationCorrection(context.supabase, context.userId, data),
  );

/** Lists what this conversation remembers (never other conversations). */
export const getConversationMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    listConversationMemory(context.supabase, data.conversationId),
  );

/** Turns the relation memory on or off. */
export const toggleConversationMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; enabled: boolean }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    if (typeof input?.enabled !== "boolean") throw new Error("enabled requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    setConversationMemoryEnabled(context.supabase, data.conversationId, data.enabled),
  );

/** Permanently deletes the remembered terms of a conversation. */
export const eraseConversationMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    clearConversationMemory(context.supabase, data.conversationId),
  );
