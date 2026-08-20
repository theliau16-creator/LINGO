import { useCallback, useState } from "react";
import { router } from "expo-router";
import { supabase } from "./supabase";
import { openOrCreateDirectConversation } from "./open-conversation";

export type ContactState = "self" | "none" | "sent" | "received" | "friends" | "blocked";

/** Direct port of useContactState (src/components/contact-actions.tsx) — same three RLS reads. */
export function useContactState(userId: string | null, otherId: string | null) {
  const [state, setState] = useState<ContactState>("none");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId || !otherId) return;
    setIsLoading(true);
    if (otherId === userId) {
      setState("self");
      setRequestId(null);
      setIsLoading(false);
      return;
    }

    const { data: blocked } = await supabase
      .from("blocked_users")
      .select("id")
      .eq("user_id", userId)
      .eq("blocked_id", otherId)
      .maybeSingle();
    if (blocked) {
      setState("blocked");
      setRequestId(null);
      setIsLoading(false);
      return;
    }

    const { data: friendship } = await supabase
      .from("friendships")
      .select("id")
      .eq("user_id", userId)
      .eq("friend_id", otherId)
      .maybeSingle();
    if (friendship) {
      setState("friends");
      setRequestId(null);
      setIsLoading(false);
      return;
    }

    const { data: requests } = await supabase
      .from("friend_requests")
      .select("id, sender_id, status")
      .eq("status", "pending")
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`);
    const pending = (requests ?? [])[0];
    if (pending) {
      setState(pending.sender_id === userId ? "sent" : "received");
      setRequestId(pending.id);
      setIsLoading(false);
      return;
    }

    setState("none");
    setRequestId(null);
    setIsLoading(false);
  }, [userId, otherId]);

  return { state, requestId, isLoading, refetch };
}

/**
 * Add / accept / decline / block / remove / open-chat — direct port of the
 * mutations in ContactActions (src/components/contact-actions.tsx). Mute is
 * not part of the Phase 5 checklist and is left for a later phase.
 */
export function useContactActions(userId: string | null, profileId: string, onChanged: () => void) {
  const [busy, setBusy] = useState(false);

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    try {
      const result = await fn();
      onChanged();
      return result;
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      if (!userId) throw new Error("Non connecté.");
      // A previous declined/cancelled row would trip the (sender, receiver)
      // unique constraint, so clear it first — same as web.
      await supabase.from("friend_requests").delete().eq("sender_id", userId).eq("receiver_id", profileId).neq("status", "pending");
      const { error } = await supabase.from("friend_requests").insert({ sender_id: userId, receiver_id: profileId, status: "pending" });
      if (error && (error as { code?: string }).code !== "23505") throw error;
    });

  const answer = (requestId: string | null, accept: boolean) =>
    run(async () => {
      if (!requestId) throw new Error("Demande introuvable.");
      if (accept) {
        const { error } = await supabase.rpc("accept_friend_request", { _request_id: requestId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("friend_requests").update({ status: "declined" }).eq("id", requestId);
      if (error) throw error;
    });

  const block = (next: boolean) =>
    run(async () => {
      if (!userId) throw new Error("Non connecté.");
      if (next) {
        const { error } = await supabase.from("blocked_users").insert({ user_id: userId, blocked_id: profileId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("blocked_users").delete().eq("user_id", userId).eq("blocked_id", profileId);
      if (error) throw error;
    });

  const remove = () =>
    run(async () => {
      if (!userId) throw new Error("Non connecté.");
      await supabase
        .from("friendships")
        .delete()
        .or(`and(user_id.eq.${userId},friend_id.eq.${profileId}),and(user_id.eq.${profileId},friend_id.eq.${userId})`);
      await supabase
        .from("friend_requests")
        .delete()
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${profileId}),and(sender_id.eq.${profileId},receiver_id.eq.${userId})`);
    });

  const openChat = (username?: string | null) =>
    run(async () => {
      if (!userId) throw new Error("Non connecté.");
      const conversationId = await openOrCreateDirectConversation(userId, profileId);
      router.push({ pathname: "/chat/[conversationId]", params: { conversationId, title: username ?? "Lingo" } });
    });

  return { busy, add, answer, block, remove, openChat };
}
