import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";

export type ConversationRow = {
  id: string;
  last_message_at: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  memberCount: number;
  peer: {
    id: string;
    username: string;
    avatar_url: string | null;
    primary_language: string;
  } | null;
  preview: string | null;
  needsBackfill: boolean;
};

/**
 * Direct port of the queryFn in src/routes/_authenticated/chats.tsx — same
 * four queries (my conversations -> conversation rows -> peers -> recent
 * messages), all plain Supabase/RLS, no server function or endpoint needed.
 */
async function fetchConversations(
  userId: string,
  myLanguage: string,
  limit: number,
): Promise<ConversationRow[]> {
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("archived_at", null);

  const myIds = (mine ?? []).map((row) => row.conversation_id);
  if (myIds.length === 0) return [];

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, last_message_at, type, name, avatar_url")
    .in("id", myIds)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  const ids = (conversations ?? []).map((row) => row.id);
  if (ids.length === 0) return [];

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", ids)
    .neq("user_id", userId);

  const peerIds = [...new Set((participants ?? []).map((p) => p.user_id))];
  const { data: profiles } = peerIds.length
    ? await supabase.from("profiles").select("id, username, avatar_url, primary_language").in("id", peerIds)
    : { data: [] };

  const { data: messages } = await supabase
    .from("messages")
    .select(
      "conversation_id, original_text, source_language, created_at, deleted_at, message_translations(language, translated_text)",
    )
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .limit(ids.length * 3);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const peerByConversation = new Map(
    (participants ?? []).map((p) => [p.conversation_id, profileById.get(p.user_id) ?? null]),
  );
  const memberCountByConversation = new Map<string, number>();
  for (const participant of participants ?? []) {
    memberCountByConversation.set(
      participant.conversation_id,
      (memberCountByConversation.get(participant.conversation_id) ?? 0) + 1,
    );
  }

  const previewByConversation = new Map<string, string>();
  const missingByConversation = new Set<string>();
  for (const message of messages ?? []) {
    const translation = (message.message_translations ?? []).find((item) => item.language === myLanguage);
    if (message.source_language !== myLanguage && !translation) {
      missingByConversation.add(message.conversation_id);
    }
    if (!previewByConversation.has(message.conversation_id)) {
      previewByConversation.set(
        message.conversation_id,
        message.deleted_at
          ? "Message supprimé"
          : message.source_language !== myLanguage && translation
            ? translation.translated_text
            : message.original_text,
      );
    }
  }

  return (conversations ?? []).map((conversation) => ({
    id: conversation.id,
    last_message_at: conversation.last_message_at,
    type: conversation.type,
    name: conversation.name,
    avatar_url: conversation.avatar_url,
    memberCount: (memberCountByConversation.get(conversation.id) ?? 0) + 1,
    peer: peerByConversation.get(conversation.id) ?? null,
    preview: previewByConversation.get(conversation.id) ?? null,
    needsBackfill: missingByConversation.has(conversation.id),
  }));
}

export function useConversations(myLanguage: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [limit, setLimit] = useState(20);

  const refetch = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) return;
      if (!opts?.silent) setIsLoading(true);
      try {
        const rows = await fetchConversations(userId, myLanguage, limit);
        setConversations(rows);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Impossible de charger les conversations."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [userId, myLanguage, limit],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime: a new message bumps the concerned row without a full refetch —
  // same behaviour as the web (src/routes/_authenticated/chats.tsx).
  useEffect(() => {
    if (!userId) return;
    // Unique per effect run — see the comment in use-friends.ts: a fixed
    // topic can collide with a same-named channel that's still mid-teardown
    // from a fast remount, and supabase-js then throws on `.on()`.
    const channel = supabase
      .channel(`chats-overview-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { conversation_id: string; original_text: string; created_at: string };
          setConversations((rows) => {
            if (!rows.some((item) => item.id === row.conversation_id)) {
              void refetch({ silent: true });
              return rows;
            }
            return rows
              .map((item) =>
                item.id === row.conversation_id
                  ? { ...item, last_message_at: row.created_at, preview: row.original_text, needsBackfill: true }
                  : item,
              )
              .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  // Backfill previews left untranslated by a language change — same trigger
  // as the web, but through the new HTTP endpoint (needs the translation
  // provider key + quota, both server-only).
  const backfilling = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = conversations.filter(
      (row) => row.needsBackfill && !backfilling.current.has(`${row.id}:${myLanguage}`),
    );
    if (pending.length === 0) return;
    pending.forEach((row) => backfilling.current.add(`${row.id}:${myLanguage}`));
    void Promise.all(
      pending.map((row) =>
        apiFetch(`/api/chat/conversations/${row.id}/backfill`, {
          method: "POST",
          body: { language: myLanguage },
        }).catch(() => null),
      ),
    ).then(() => refetch({ silent: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, myLanguage]);

  return {
    conversations,
    isLoading,
    isRefreshing,
    error,
    hasMore: conversations.length >= limit,
    loadMore: () => setLimit((value) => value + 20),
    refetch: () => {
      setIsRefreshing(true);
      return refetch();
    },
  };
}
