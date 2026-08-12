import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";

export type Translation = {
  language: string;
  translated_text: string;
  confidence_score: number | null;
  alternative_translation?: string | null;
  corrected_by_user: boolean | null;
};

export type MessageRow = {
  id: string;
  sender_id: string;
  original_text: string;
  source_language: string;
  created_at: string;
  translation_status: string;
  translation_error: string | null;
  message_translations: Translation[];
};

/** Set by quota.server.ts's assertQuota — the one non-transient translation failure. */
export const QUOTA_REACHED = "TRANSLATION_QUOTA_REACHED";

export type PendingMessage = {
  localId: string;
  text: string;
  sourceLanguage: string;
  createdAt: string;
  failed: boolean;
};

export type ConversationMeta = {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  members: { id: string; username: string; avatar_url: string | null; primary_language: string }[];
};

const PAGE_SIZE = 40;

/**
 * Trimmed version of the SELECT in src/routes/_authenticated/chat.$conversationId.tsx —
 * only what Phase 3 renders (history, translation, pending state). Reactions,
 * reply-to, deletion, receipts and attachments are out of scope for this phase.
 */
const SELECT =
  "id, sender_id, original_text, source_language, created_at, translation_status, translation_error, message_translations(language, translated_text, confidence_score, alternative_translation, corrected_by_user)";

/** After this delay a translation still "pending" is abandoned work, not work in progress. */
const STALE_TRANSLATION_MS = 60_000;

export function isTranslationStale(message: MessageRow): boolean {
  return message.translation_status === "pending" && Date.now() - Date.parse(message.created_at) > STALE_TRANSLATION_MS;
}

export function useConversationMeta(conversationId: string) {
  const { session } = useAuth();
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    (async () => {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id, type, name, avatar_url")
        .eq("id", conversationId)
        .maybeSingle();

      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);

      const ids = (participants ?? []).map((row) => row.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, username, avatar_url, primary_language").in("id", ids)
        : { data: [] };

      if (cancelled) return;
      setMeta(
        conversation
          ? {
              id: conversation.id,
              type: conversation.type,
              name: conversation.name,
              avatar_url: conversation.avatar_url,
              members: profiles ?? [],
            }
          : null,
      );
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, session?.user.id]);

  return { meta, isLoading };
}

export function useConversationMessages(conversationId: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const refetch = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from("messages")
        .select(SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (queryError) throw queryError;
      setMessages(((data ?? []) as MessageRow[]).slice().reverse());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Impossible de charger les messages."));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, limit]);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
  }, [refetch]);

  const patch = useCallback((updater: (rows: MessageRow[]) => MessageRow[]) => {
    setMessages((rows) => updater(rows));
  }, []);

  const fetchOne = useCallback(async (id: string) => {
    const { data } = await supabase.from("messages").select(SELECT).eq("id", id).maybeSingle();
    return (data as MessageRow | null) ?? null;
  }, []);

  // Realtime: new messages, translation_status flips, and translations landing
  // as the server fans them out — same three subscriptions as the web
  // (message_receipts is skipped, out of scope for Phase 3).
  useEffect(() => {
    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const row = await fetchOne(id);
          if (!row) return;
          patch((rows) => (rows.some((m) => m.id === id) ? rows : [...rows, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const next = payload.new as Partial<MessageRow> & { id: string };
          patch((rows) => rows.map((row) => (row.id === next.id ? { ...row, ...next } : row)));
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_translations" }, (payload) => {
        const row = payload.new as Partial<Translation> & { message_id?: string };
        if (!row?.message_id || !row.language || !row.translated_text) return;
        const translation: Translation = {
          language: row.language,
          translated_text: row.translated_text,
          confidence_score: row.confidence_score ?? null,
          corrected_by_user: row.corrected_by_user ?? null,
        };
        patch((rows) =>
          rows.map((message) =>
            message.id === row.message_id
              ? {
                  ...message,
                  message_translations: [
                    ...message.message_translations.filter((t) => t.language !== row.language),
                    translation,
                  ],
                }
              : message,
          ),
        );
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, patch, fetchOne]);

  const inFlight = useRef(new Set<string>());

  /** Inserts the message (idempotent via client_id), then kicks translation off separately. */
  const deliver = useCallback(
    async (item: PendingMessage) => {
      if (!userId || inFlight.current.has(item.localId)) return;
      inFlight.current.add(item.localId);
      try {
        const { data, error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            sender_id: userId,
            client_id: item.localId,
            original_text: item.text,
            source_language: item.sourceLanguage,
            translation_status: "pending",
            status: "sent",
          })
          .select(SELECT)
          .single();

        if (insertError && (insertError as { code?: string }).code === "23505") {
          // Already delivered by an earlier attempt whose response never came back.
          const { data: existing } = await supabase
            .from("messages")
            .select(SELECT)
            .eq("conversation_id", conversationId)
            .eq("sender_id", userId)
            .eq("client_id", item.localId)
            .maybeSingle();
          if (existing) {
            setPending((queue) => queue.filter((entry) => entry.localId !== item.localId));
            patch((rows) => (rows.some((m) => m.id === existing.id) ? rows : [...rows, existing as MessageRow]));
            return;
          }
        }
        if (insertError) throw insertError;

        setPending((queue) => queue.filter((entry) => entry.localId !== item.localId));
        const row = data as MessageRow;
        patch((rows) => (rows.some((m) => m.id === row.id) ? rows : [...rows, row]));

        // Translation runs independently: a failure never unsends the message —
        // the bubble just stays on "failed" and the user can retry from there.
        apiFetch(`/api/chat/messages/${row.id}/translate`, { method: "POST" }).catch(() => undefined);
      } catch {
        setPending((queue) =>
          queue.map((entry) => (entry.localId === item.localId ? { ...entry, failed: true } : entry)),
        );
      } finally {
        inFlight.current.delete(item.localId);
      }
    },
    [conversationId, userId, patch],
  );

  const send = useCallback(
    (text: string, sourceLanguage: string) => {
      const item: PendingMessage = {
        localId: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        text,
        sourceLanguage,
        createdAt: new Date().toISOString(),
        failed: false,
      };
      setPending((queue) => [...queue, item]);
      void deliver(item);
    },
    [deliver],
  );

  const retrySend = useCallback(
    (localId: string) => {
      const item = pending.find((entry) => entry.localId === localId);
      if (!item) return;
      setPending((queue) => queue.map((entry) => (entry.localId === localId ? { ...entry, failed: false } : entry)));
      void deliver(item);
    },
    [pending, deliver],
  );

  const retryTranslation = useCallback((messageId: string) => {
    return apiFetch(`/api/chat/messages/${messageId}/translate`, { method: "POST" });
  }, []);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  return {
    messages,
    pending,
    byId,
    isLoading,
    error,
    hasMore: messages.length >= limit,
    loadMore: () => setLimit((value) => value + PAGE_SIZE),
    refetch,
    send,
    retrySend,
    retryTranslation,
  };
}
