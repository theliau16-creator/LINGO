import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type Person = { id: string; username: string; avatar_url: string | null; primary_language: string };
export type FriendRequestRow = { id: string; sender_id: string; profile: Person | null };

/**
 * Direct port of the three RLS queries in src/routes/_authenticated/friends.tsx
 * (received requests, friends list, search via `search_profiles`), plus a
 * "sent requests" read using the exact same already-secured primitive as
 * "received" (just sender_id/receiver_id swapped) — the concept already
 * exists in `friend_requests`, web just never lists it as its own section.
 * Realtime: same as web, any change on friend_requests/friendships refetches.
 */
export function useFriends() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [friends, setFriends] = useState<Person[]>([]);
  const [received, setReceived] = useState<FriendRequestRow[]>([]);
  const [sent, setSent] = useState<FriendRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      const [receivedRes, sentRes, friendsRes] = await Promise.all([
        supabase.from("friend_requests").select("id, sender_id, status").eq("receiver_id", userId).eq("status", "pending"),
        supabase.from("friend_requests").select("id, receiver_id, status").eq("sender_id", userId).eq("status", "pending"),
        supabase.from("friendships").select("friend_id").eq("user_id", userId),
      ]);

      const receivedIds = (receivedRes.data ?? []).map((r) => r.sender_id);
      const sentIds = (sentRes.data ?? []).map((r) => r.receiver_id);
      const friendIds = (friendsRes.data ?? []).map((r) => r.friend_id);
      const allIds = [...new Set([...receivedIds, ...sentIds, ...friendIds])];

      const { data: profiles } = allIds.length
        ? await supabase.from("profiles").select("id, username, avatar_url, primary_language").in("id", allIds)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

      setReceived((receivedRes.data ?? []).map((r) => ({ id: r.id, sender_id: r.sender_id, profile: byId.get(r.sender_id) ?? null })));
      setSent((sentRes.data ?? []).map((r) => ({ id: r.id, sender_id: r.receiver_id, profile: byId.get(r.receiver_id) ?? null })));
      setFriends(friendIds.map((id) => byId.get(id)).filter((p): p is Person => Boolean(p)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Impossible de charger vos amis."));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`social-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => void refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void refetch())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("search_profiles", { _query: term.trim() });
      if (!cancelled) {
        setResults((data ?? []).slice(0, 10));
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  return { friends, received, sent, isLoading, error, refetch, term, setTerm, results, searchLoading };
}
