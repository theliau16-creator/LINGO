import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  claimGuestSession,
  createInvite,
  guestConversation,
  guestSend,
  invitePreview,
  joinAsGuest,
  listInvites,
  revokeInvite,
} from "./invites.server";

/** Creates a QR / link invitation for a conversation. */
export const createConversationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; maxUses?: number; ttlHours?: number }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    return input;
  })
  .handler(async ({ data, context }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("invite_create", { kind: "user", id: context.userId });
    return createInvite(context.supabase, context.userId, {
      conversationId: data.conversationId,
      maxUses: data.maxUses ?? 20,
      ttlHours: data.ttlHours ?? 72,
    });
  });

export const listConversationInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => {
    if (!input?.conversationId) throw new Error("conversationId requis");
    return input;
  })
  .handler(async ({ data, context }) => listInvites(context.supabase, data.conversationId));

export const revokeConversationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inviteId: string }) => {
    if (!input?.inviteId) throw new Error("inviteId requis");
    return input;
  })
  .handler(async ({ data, context }) => revokeInvite(context.supabase, data.inviteId));

/** Public: what an invitation link shows before joining. */
export const getInvitePreview = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => {
    if (!input?.code) throw new Error("code requis");
    return input;
  })
  .handler(async ({ data }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("invite_join", await (await import("./rate-limit.server")).callerIpSubject(), { limit: 60 });
    return invitePreview(data.code);
  });

/** Public: join the conversation as a guest, no account required. */
export const joinConversationAsGuest = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; displayName: string; language: string }) => {
    if (!input?.code) throw new Error("code requis");
    if (!input?.displayName?.trim()) throw new Error("Un prénom est requis.");
    if (input.displayName.trim().length > 40) throw new Error("Prénom trop long.");
    if (!input?.language) throw new Error("Une langue est requise.");
    return input;
  })
  .handler(async ({ data }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("invite_join", await (await import("./rate-limit.server")).callerIpSubject());
    return joinAsGuest(data);
  });

/** Public (guest token): messages translated into the guest's language. */
export const getGuestConversation = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!input?.token) throw new Error("token requis");
    return input;
  })
  .handler(async ({ data }) => guestConversation(data.token));

/** Public (guest token): send a message. */
export const sendGuestMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; text: string }) => {
    if (!input?.token) throw new Error("token requis");
    if (!input?.text?.trim()) throw new Error("Le message est vide.");
    return input;
  })
  .handler(async ({ data }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("message_send", await (await import("./rate-limit.server")).callerIpSubject());
    return guestSend(data.token, data.text);
  });

/** Turns a guest session into a real membership after sign-up. */
export const claimGuestConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    if (!input?.token) throw new Error("token requis");
    return input;
  })
  .handler(async ({ data, context }) =>
    claimGuestSession(context.supabase, context.userId, data.token),
  );
