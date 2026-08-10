import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MESSAGE_PAGE = 40;
const GUEST_BACKFILL = 20;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function randomCode(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Tokens are never stored in clear: only their SHA-256 digest is persisted. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type InviteError =
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_EXHAUSTED";

/** Creates a shareable invitation for a conversation (QR + link). */
export async function createInvite(
  supabase: Client,
  userId: string,
  input: { conversationId: string; maxUses?: number | null; ttlHours?: number | null },
) {
  const ttlHours = input.ttlHours ?? 72;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const { data, error } = await supabase
      .from("conversation_invites")
      .insert({
        code,
        conversation_id: input.conversationId,
        inviter_id: userId,
        expires_at: expiresAt,
        max_uses: input.maxUses ?? 20,
      })
      .select("id, code, expires_at, max_uses, uses")
      .maybeSingle();

    if (!error && data) return data;
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  }
  throw new Error("Impossible de générer une invitation.");
}

/** Active invitations created by the user for one conversation. */
export async function listInvites(supabase: Client, conversationId: string) {
  const { data, error } = await supabase
    .from("conversation_invites")
    .select("id, code, expires_at, revoked_at, uses, max_uses, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function revokeInvite(supabase: Client, inviteId: string) {
  const { error } = await supabase
    .from("conversation_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error) throw new Error(error.message);
  return { revoked: true };
}

type InviteRow = Database["public"]["Tables"]["conversation_invites"]["Row"];

/** Loads an invite by code and validates it. Throws a typed reason otherwise. */
async function loadValidInvite(code: string): Promise<InviteRow> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("conversation_invites")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (!data) throw new Error("INVITE_NOT_FOUND" satisfies InviteError);
  if (data.revoked_at) throw new Error("INVITE_REVOKED" satisfies InviteError);
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("INVITE_EXPIRED" satisfies InviteError);
  }
  if (data.max_uses !== null && data.uses >= data.max_uses) {
    throw new Error("INVITE_EXHAUSTED" satisfies InviteError);
  }
  if (!data.conversation_id) throw new Error("INVITE_NOT_FOUND" satisfies InviteError);
  return data;
}

/** Public preview shown before someone joins — no message content is exposed. */
export async function invitePreview(code: string) {
  const invite = await loadValidInvite(code);
  const supabaseAdmin = await admin();

  const [{ data: conversation }, { data: inviter }, { count }] = await Promise.all([
    supabaseAdmin
      .from("conversations")
      .select("id, type, name")
      .eq("id", invite.conversation_id!)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("username, avatar_url, primary_language")
      .eq("id", invite.inviter_id)
      .maybeSingle(),
    supabaseAdmin
      .from("conversation_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("conversation_id", invite.conversation_id!),
  ]);

  return {
    code: invite.code,
    conversation: {
      id: invite.conversation_id!,
      type: conversation?.type ?? "direct",
      name: conversation?.name ?? null,
    },
    inviter: {
      username: inviter?.username ?? "Un utilisateur",
      avatar_url: inviter?.avatar_url ?? null,
      language: inviter?.primary_language ?? null,
    },
    members: count ?? 0,
  };
}

/**
 * Joins a conversation as a web guest — no account, no install.
 * Returns a bearer-like guest token kept in the browser's local storage.
 */
export async function joinAsGuest(input: { code: string; displayName: string; language: string }) {
  const invite = await loadValidInvite(input.code);
  const supabaseAdmin = await admin();

  // Reserve the seat BEFORE creating the guest: the SQL function increments
  // `uses` only while the invite is still valid and under `max_uses`, so two
  // simultaneous joins can never push the invitation past its limit.
  const { data: seat } = await supabaseAdmin.rpc("claim_invite_use", { _invite_id: invite.id });
  if (seat !== true) throw new Error("INVITE_EXHAUSTED" satisfies InviteError);

  const token = randomToken();
  const { data, error } = await supabaseAdmin
    .from("guest_users")
    .insert({
      invite_id: invite.id,
      conversation_id: invite.conversation_id!,
      display_name: input.displayName.trim().slice(0, 40),
      language: input.language,
      token_hash: await hashToken(token),
      last_seen_at: new Date().toISOString(),
    })
    .select("id, display_name, language, conversation_id")
    .maybeSingle();

  if (error || !data) {
    // Give the seat back: nobody actually joined.
    await supabaseAdmin
      .from("conversation_invites")
      .update({ uses: Math.max(0, invite.uses) })
      .eq("id", invite.id);
    throw new Error(error?.message ?? "Impossible de rejoindre la conversation.");
  }


  return { token, guest: data };
}

export type GuestSession = Database["public"]["Tables"]["guest_users"]["Row"];

/** Resolves a guest token. Throws when the token is unknown. */
export async function requireGuest(token: string): Promise<GuestSession> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("guest_users")
    .select("*")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!data) throw new Error("GUEST_SESSION_INVALID");
  return data;
}

const GUEST_SELECT =
  "id, sender_id, guest_id, original_text, source_language, created_at, message_type, attachments, deleted_at, message_translations(language, translated_text, confidence_score, alternative_translation, corrected_by_user)";

async function signAttachments(
  attachments: unknown,
): Promise<{ path: string; type: string; url: string | null; duration_ms?: number }[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const supabaseAdmin = await admin();
  const out: { path: string; type: string; url: string | null; duration_ms?: number }[] = [];
  for (const raw of attachments) {
    const item = raw as { path?: string; type?: string; duration_ms?: number };
    if (!item?.path) continue;
    const { data } = await supabaseAdmin.storage
      .from("chat-media")
      .createSignedUrl(item.path, 3600);
    out.push({
      path: item.path,
      type: item.type ?? "image",
      url: data?.signedUrl ?? null,
      ...(item.duration_ms ? { duration_ms: item.duration_ms } : {}),
    });
  }
  return out;
}

/** Everything the guest web chat needs: peers, messages and translations. */
export async function guestConversation(token: string) {
  const guest = await requireGuest(token);
  const supabaseAdmin = await admin();

  const { data: rows } = await supabaseAdmin
    .from("messages")
    .select(GUEST_SELECT)
    .eq("conversation_id", guest.conversation_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE);

  const messages = (rows ?? []).slice().reverse();

  // Translate the visible tail into the guest's language (cache-first).
  const { ensureTranslation } = await import("./chat.server");
  for (const message of messages.slice(-GUEST_BACKFILL)) {
    const has = (message.message_translations ?? []).some((t) => t.language === guest.language);
    if (has || message.source_language === guest.language) continue;
    try {
      await ensureTranslation(supabaseAdmin, message.id, guest.language);
    } catch {
      /* the message stays readable in its original language */
    }
  }

  const { data: fresh } = await supabaseAdmin
    .from("messages")
    .select(GUEST_SELECT)
    .eq("conversation_id", guest.conversation_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE);

  const ordered = (fresh ?? []).slice().reverse();

  const senderIds = [...new Set(ordered.map((m) => m.sender_id).filter(Boolean))] as string[];
  const { data: profiles } = senderIds.length
    ? await supabaseAdmin.from("profiles").select("id, username, avatar_url").in("id", senderIds)
    : { data: [] };

  const { data: guests } = await supabaseAdmin
    .from("guest_users")
    .select("id, display_name")
    .eq("conversation_id", guest.conversation_id);

  const authors = new Map<string, string>();
  for (const profile of profiles ?? []) authors.set(profile.id, profile.username);
  for (const other of guests ?? []) authors.set(other.id, `${other.display_name} (invité)`);

  const payload = [];
  for (const message of ordered) {
    const translation =
      (message.message_translations ?? []).find((t) => t.language === guest.language) ?? null;
    payload.push({
      id: message.id,
      mine: message.guest_id === guest.id,
      author: authors.get(message.sender_id ?? message.guest_id ?? "") ?? "Membre",
      original_text: message.original_text,
      source_language: message.source_language,
      created_at: message.created_at,
      message_type: message.message_type,
      translated_text: translation?.translated_text ?? null,
      confidence_score: translation?.confidence_score ?? null,
      alternative_translation: translation?.alternative_translation ?? null,
      attachments: await signAttachments(message.attachments),
    });
  }

  await supabaseAdmin
    .from("guest_users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", guest.id);

  return {
    guest: { id: guest.id, display_name: guest.display_name, language: guest.language },
    conversationId: guest.conversation_id,
    messages: payload,
  };
}

/** A guest sends a message; it is translated for every member like any other. */
export async function guestSend(token: string, text: string) {
  const guest = await requireGuest(token);
  const clean = text.trim();
  if (!clean) throw new Error("Le message est vide.");
  if (clean.length > 2000) throw new Error("Message trop long (2000 caractères maximum).");

  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: guest.conversation_id,
      guest_id: guest.id,
      original_text: clean,
      source_language: guest.language,
      status: "sent",
      translation_status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Envoi impossible.");

  const { translateMessageForParticipants } = await import("./chat.server");
  try {
    await translateMessageForParticipants(supabaseAdmin, data.id, guest.claimed_by ?? null);
  } catch {
    /* the message is sent; translation failure is recorded on the row */
  }

  return { id: data.id };
}

/**
 * Converts a guest into a real member once they create an account:
 * their history is kept and re-attributed to the new account.
 */
export async function claimGuestSession(supabase: Client, userId: string, token: string) {
  const guest = await requireGuest(token);
  const supabaseAdmin = await admin();

  await supabaseAdmin
    .from("conversation_participants")
    .upsert(
      { conversation_id: guest.conversation_id, user_id: userId },
      { onConflict: "conversation_id,user_id" },
    );

  await supabaseAdmin
    .from("messages")
    .update({ sender_id: userId })
    .eq("guest_id", guest.id)
    .is("sender_id", null);

  await supabaseAdmin.from("guest_users").update({ claimed_by: userId }).eq("id", guest.id);

  const { backfillConversationTranslations } = await import("./chat.server");
  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_language")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.primary_language) {
    try {
      await backfillConversationTranslations(
        supabaseAdmin,
        guest.conversation_id,
        profile.primary_language,
        userId,
      );
    } catch {
      /* non blocking */
    }
  }

  return { conversationId: guest.conversation_id };
}
