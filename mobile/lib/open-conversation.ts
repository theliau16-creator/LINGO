import { supabase } from "./supabase";

/**
 * Direct port of `openDirectConversation` (src/lib/chat.server.ts). That
 * function only ever calls `context.supabase` (the RLS-scoped client) — no
 * supabaseAdmin, no secret — and `create_direct_conversation` is
 * `GRANT EXECUTE ... TO authenticated` (supabase/migrations/20260807222310_*.sql,
 * confirmed not revoked in the later hardening migration). So this can run
 * as a plain client call instead of a new HTTP endpoint, per the instruction
 * to only expose `openConversation` over HTTP if it genuinely can't be done
 * with already-secured Supabase/RPC primitives — it can.
 */
export async function openOrCreateDirectConversation(userId: string, friendId: string): Promise<string> {
  const { data: blocked } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("user_id", userId)
    .eq("blocked_id", friendId)
    .maybeSingle();
  if (blocked) throw new Error("Vous avez bloqué cette personne.");

  const { data: mine } = await supabase.from("conversation_participants").select("conversation_id").eq("user_id", userId);
  const myConversationIds = (mine ?? []).map((row) => row.conversation_id);

  if (myConversationIds.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", friendId)
      .in("conversation_id", myConversationIds);
    const existing = shared?.[0]?.conversation_id;
    if (existing) return existing;
  }

  const { data: conversationId, error } = await supabase.rpc("create_direct_conversation", { _friend_id: friendId });
  if (error) throw new Error(error.message);
  if (!conversationId) throw new Error("Impossible de créer la conversation");
  return conversationId;
}
