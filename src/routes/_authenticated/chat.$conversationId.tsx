import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CornerUpLeft,
  Languages,
  Loader2,
  Palette,
  RefreshCw,
  SendHorizonal,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/app-shell";
import { ChatCustomizer } from "@/components/chat-customizer";
import { useCurrentUser, useProfile } from "@/hooks/useAuth";
import { useBackgroundPhotoUrl, useChatPreferences } from "@/hooks/useChatPreferences";
import { usePresence } from "@/hooks/usePresence";
import { useUserSettings } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/backend-errors";
import { backgroundStyle, haptic, readableTextColor } from "@/lib/chat-theme";
import { backfillConversation, translateMessage } from "@/lib/chat.functions";
import { languageFlag, languageLabel } from "@/lib/languages";
import { dequeueOutbox, enqueueOutbox, listOutbox, type PendingMessage } from "@/lib/outbox";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  head: () => ({
    meta: [
      { title: "Conversation — Lingo" },
      { name: "description", content: "Discussion traduite en temps réel avec vos amis." },
      { property: "og:title", content: "Conversation — Lingo" },
      { property: "og:description", content: "Discussion traduite en temps réel avec vos amis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-sm text-muted-foreground">
      {handleError("MESSAGE_ERROR", error)}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-center text-sm text-muted-foreground">Conversation introuvable.</div>
  ),
  component: ChatPage,
});

const PAGE_SIZE = 40;

type Receipt = { user_id: string; delivered_at: string | null; read_at: string | null };

type MessageRow = {
  id: string;
  sender_id: string;
  original_text: string;
  source_language: string;
  created_at: string;
  status: string;
  translation_status: string;
  reply_to_message_id: string | null;
  deleted_at: string | null;
  deleted_for: string[] | null;
  message_translations: { language: string; translated_text: string }[];
  message_receipts: Receipt[];
};

const SELECT =
  "id, sender_id, original_text, source_language, created_at, status, translation_status, reply_to_message_id, deleted_at, deleted_for, message_translations(language, translated_text), message_receipts(user_id, delivered_at, read_at)";

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const { data: settings } = useUserSettings();
  const queryClient = useQueryClient();
  const runTranslate = useServerFn(translateMessage);
  const runBackfill = useServerFn(backfillConversation);
  const [draft, setDraft] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [customizing, setCustomizing] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [online, setOnline] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { preferences } = useChatPreferences(conversationId);
  const backgroundPhoto = useBackgroundPhotoUrl(preferences);

  const myLanguage = profile?.primary_language ?? "fr";
  const messagesKey = useMemo(
    () => ["messages", conversationId, limit] as const,
    [conversationId, limit],
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const peerQuery = useQuery({
    queryKey: ["conversation-peer", conversationId, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user!.id);
      const peerId = participants?.[0]?.user_id;
      if (!peerId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, primary_language")
        .eq("id", peerId)
        .maybeSingle();
      return data;
    },
  });
  const peer = peerQuery.data;

  const messagesQuery = useQuery({
    queryKey: messagesKey,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select(SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as MessageRow[]).slice().reverse();
    },
  });

  const messages = useMemo(
    () =>
      (messagesQuery.data ?? []).filter(
        (message) =>
          !message.deleted_at || message.deleted_at === null
            ? !(message.deleted_for ?? []).includes(user?.id ?? "")
            : true,
      ),
    [messagesQuery.data, user?.id],
  );

  const hasMore = (messagesQuery.data ?? []).length >= limit;

  /** Surgical cache updates — no full refetch on realtime events. */
  const patchMessages = useCallback(
    (updater: (rows: MessageRow[]) => MessageRow[]) => {
      queryClient.setQueryData<MessageRow[]>(messagesKey, (rows) => updater(rows ?? []));
    },
    [queryClient, messagesKey],
  );

  const fetchOne = useCallback(async (id: string) => {
    const { data } = await supabase.from("messages").select(SELECT).eq("id", id).maybeSingle();
    return (data as MessageRow | null) ?? null;
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const row = await fetchOne(id);
          if (!row) return;
          patchMessages((rows) => (rows.some((m) => m.id === id) ? rows : [...rows, row]));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const next = payload.new as Partial<MessageRow> & { id: string };
          patchMessages((rows) =>
            rows.map((row) => (row.id === next.id ? { ...row, ...next } : row)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_translations" },
        (payload) => {
          const row = payload.new as {
            message_id?: string;
            language?: string;
            translated_text?: string;
          };
          if (!row?.message_id || !row.language || !row.translated_text) return;
          patchMessages((rows) =>
            rows.map((message) =>
              message.id === row.message_id
                ? {
                    ...message,
                    message_translations: [
                      ...message.message_translations.filter((t) => t.language !== row.language),
                      { language: row.language!, translated_text: row.translated_text! },
                    ],
                  }
                : message,
            ),
          );
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" }, (payload) => {
        const row = payload.new as Receipt & { message_id?: string };
        if (!row?.message_id) return;
        patchMessages((rows) =>
          rows.map((message) =>
            message.id === row.message_id
              ? {
                  ...message,
                  message_receipts: [
                    ...message.message_receipts.filter((r) => r.user_id !== row.user_id),
                    row,
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
  }, [conversationId, patchMessages, fetchOne]);

  // Presence + typing indicator (Realtime only, nothing written to the database).
  const { peerOnline, peerTyping, notifyTyping } = usePresence({
    conversationId,
    userId: user?.id ?? null,
    shareStatus: settings?.show_online_status ?? true,
  });

  // Read receipts: mark the peer's visible messages as read once, if enabled.
  useEffect(() => {
    if (!user?.id || settings?.read_receipts_enabled === false) return;
    const unread = messages.filter(
      (message) =>
        message.sender_id !== user.id &&
        !message.message_receipts.some((r) => r.user_id === user.id && r.read_at),
    );
    if (unread.length === 0) return;
    const now = new Date().toISOString();
    void supabase
      .from("message_receipts")
      .upsert(
        unread.map((message) => ({
          message_id: message.id,
          user_id: user.id,
          delivered_at: now,
          read_at: now,
        })),
        { onConflict: "message_id,user_id" },
      )
      .then(() => undefined);
  }, [messages, user?.id, settings?.read_receipts_enabled]);

  // When the user switches their language, older messages have no translation
  // in that language yet: translate the visible history on the fly.
  const requestedBackfill = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const missing = messages.some(
      (message) =>
        message.source_language !== myLanguage &&
        !message.message_translations.some((item) => item.language === myLanguage),
    );
    const key = `${conversationId}:${myLanguage}`;
    if (!missing || requestedBackfill.current === key) return;
    requestedBackfill.current = key;
    void runBackfill({ data: { conversationId, language: myLanguage } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }))
      .catch(() => {
        requestedBackfill.current = null;
      });
  }, [messages, myLanguage, conversationId, queryClient, runBackfill]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending.length]);

  /** Inserts the message, then kicks translation off separately. */
  const deliver = useCallback(
    async (item: PendingMessage) => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: item.conversationId,
          sender_id: user!.id,
          original_text: item.text,
          source_language: item.sourceLanguage,
          translation_status: "pending",
          status: "sent",
          reply_to_message_id: item.replyToMessageId ?? null,
        })
        .select(SELECT)
        .single();
      if (error) throw error;

      dequeueOutbox(item.localId);
      setPending((queue) => queue.filter((entry) => entry.localId !== item.localId));
      const row = data as MessageRow;
      patchMessages((rows) => (rows.some((m) => m.id === row.id) ? rows : [...rows, row]));

      // Translation runs independently: a failure must never unsend the message.
      void runTranslate({ data: { messageId: row.id } }).catch((translationError) => {
        handleError("TRANSLATION_ERROR", translationError);
      });
    },
    [user, patchMessages, runTranslate],
  );

  const flushOutbox = useCallback(async () => {
    if (!user?.id || !navigator.onLine) return;
    for (const item of listOutbox(conversationId)) {
      try {
        await deliver(item);
      } catch (error) {
        handleError("MESSAGE_ERROR", error);
        break;
      }
    }
  }, [conversationId, deliver, user?.id]);

  useEffect(() => {
    setPending(listOutbox(conversationId));
    void flushOutbox();
    const onUp = () => void flushOutbox();
    window.addEventListener("online", onUp);
    return () => window.removeEventListener("online", onUp);
  }, [conversationId, flushOutbox]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const item: PendingMessage = {
        localId: crypto.randomUUID(),
        conversationId,
        text,
        sourceLanguage: myLanguage,
        createdAt: new Date().toISOString(),
        ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
      };
      enqueueOutbox(item);
      setPending((queue) => [...queue, item]);
      setReplyTo(null);
      if (!navigator.onLine) return;
      await deliver(item);
    },
    onError: (error) => toast.error(handleError("MESSAGE_ERROR", error)),
  });

  const retryTranslation = useMutation({
    mutationFn: async (messageId: string) => runTranslate({ data: { messageId } }),
    onError: (error) => toast.error(handleError("TRANSLATION_ERROR", error)),
  });

  const deleteMessage = useMutation({
    mutationFn: async ({ message, forEveryone }: { message: MessageRow; forEveryone: boolean }) => {
      if (forEveryone) {
        const { error } = await supabase
          .from("messages")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", message.id);
        if (error) throw error;
      } else {
        const next = [...new Set([...(message.deleted_for ?? []), user!.id])];
        const { error } = await supabase
          .from("messages")
          .update({ deleted_for: next })
          .eq("id", message.id);
        if (error) throw error;
        patchMessages((rows) => rows.filter((row) => row.id !== message.id));
      }
    },
    onError: (error) => toast.error(handleError("MESSAGE_ERROR", error)),
  });

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    haptic();
    sendMutation.mutate(text);
  }

  const bubbleStyle = (mine: boolean): React.CSSProperties => {
    const color = mine ? preferences.outgoing_message_color : preferences.incoming_message_color;
    if (!color) return {};
    return { background: color, color: readableTextColor(color) };
  };

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col"
      style={backgroundStyle(preferences, backgroundPhoto)}
    >
      <header className="glass-strong safe-top sticky top-0 z-30 flex items-center gap-3 px-4 py-3">
        <Link
          to="/chats"
          aria-label="Retour aux discussions"
          className="flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={peer?.username} url={peer?.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{peer?.username ?? "Conversation"}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {peerTyping ? (
              <span className="text-primary">{peer?.username ?? "Votre ami"} écrit…</span>
            ) : peerOnline ? (
              <span className="text-emerald-400">En ligne</span>
            ) : (
              <>
                <Languages className="h-3 w-3" />
                {languageLabel(peer?.primary_language)} → {languageLabel(myLanguage)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            haptic();
            setCustomizing(true);
          }}
          aria-label="Personnaliser le chat"
          className="glass flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Palette className="h-4 w-4" />
        </button>
      </header>

      {!online ? (
        <p className="flex items-center justify-center gap-2 bg-amber-500/10 py-1.5 text-[11px] text-amber-400">
          <WifiOff className="h-3 w-3" /> Hors connexion — vos messages partiront au retour du réseau
        </p>
      ) : null}

      <div className="flex-1 space-y-2 px-4 py-5">
        {hasMore ? (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
              className="glass rounded-2xl px-4 py-1.5 text-[12px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              Charger les messages précédents
            </button>
          </div>
        ) : null}

        {messagesQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : messagesQuery.isError ? (
          <div role="alert" className="glass mt-8 rounded-3xl p-6 text-center text-sm">
            <p>{handleError("MESSAGE_ERROR", messagesQuery.error)}</p>
            <button
              type="button"
              onClick={() => void messagesQuery.refetch()}
              className="bg-brand mt-4 rounded-2xl px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Réessayer
            </button>
          </div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <div className="glass animate-rise mt-8 rounded-3xl p-6 text-center">
            <p className="font-semibold">Première conversation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Écrivez en {languageLabel(myLanguage)} — {peer?.username ?? "votre ami"} lira en{" "}
              {languageLabel(peer?.primary_language)}.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === user?.id;
            const removed = Boolean(message.deleted_at);
            const translation = message.message_translations.find(
              (item) => item.language === myLanguage,
            );
            const translated = !mine && translation && message.source_language !== myLanguage;
            const original = showOriginal[message.id] === true;
            const body = translated && !original ? translation.translated_text : message.original_text;
            const waiting =
              !mine && !translation && message.source_language !== myLanguage &&
              message.translation_status !== "failed";
            const failed = message.translation_status === "failed";
            const quoted = message.reply_to_message_id
              ? byId.get(message.reply_to_message_id)
              : null;
            const peerReceipt = message.message_receipts.find((r) => r.user_id !== user?.id);

            return (
              <div
                key={message.id}
                className={`animate-rise group flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                <div
                  style={removed ? {} : bubbleStyle(mine)}
                  className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${
                    removed
                      ? "glass italic text-muted-foreground"
                      : mine
                        ? "bg-brand shadow-glow rounded-br-lg text-primary-foreground"
                        : "glass rounded-bl-lg"
                  }`}
                >
                  {quoted && !removed ? (
                    <span className="mb-1 block border-l-2 border-current/40 pl-2 text-[12px] opacity-70">
                      {quoted.original_text.slice(0, 80)}
                    </span>
                  ) : null}
                  {removed ? (
                    "Message supprimé"
                  ) : waiting ? (
                    <span className="flex items-center gap-2 opacity-70">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Traduction…
                    </span>
                  ) : (
                    body
                  )}
                </div>

                {!removed ? (
                  <div className="mt-1 flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
                    {translated ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowOriginal((state) => ({ ...state, [message.id]: !state[message.id] }))
                        }
                        className="font-medium focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {original
                          ? "Voir la traduction"
                          : `Voir l'original ${languageFlag(message.source_language)}`}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      aria-label="Répondre à ce message"
                      onClick={() => setReplyTo(message)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <CornerUpLeft className="h-3 w-3" />
                    </button>

                    {mine ? (
                      <>
                        <button
                          type="button"
                          aria-label="Supprimer ce message"
                          onClick={() => deleteMessage.mutate({ message, forEveryone: true })}
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        {peerReceipt?.read_at ? (
                          <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="Lu" />
                        ) : peerReceipt?.delivered_at ? (
                          <CheckCheck className="h-3.5 w-3.5" aria-label="Reçu" />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-label="Envoyé" />
                        )}
                      </>
                    ) : null}

                    {failed && mine ? (
                      <button
                        type="button"
                        onClick={() => retryTranslation.mutate(message.id)}
                        className="flex items-center gap-1 text-amber-400"
                      >
                        <RefreshCw className="h-3 w-3" /> Traduction échouée — réessayer
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {pending.map((item) => (
          <div key={item.localId} className="animate-rise flex flex-col items-end">
            <div className="bg-brand max-w-[80%] rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] leading-snug text-primary-foreground opacity-60">
              {item.text}
            </div>
            <span className="mt-1 px-2 text-[11px] text-muted-foreground">En attente d'envoi…</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo ? (
        <div className="glass mx-3 mb-1 flex items-center gap-2 rounded-2xl px-3 py-2 text-[12px]">
          <CornerUpLeft className="h-3 w-3 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {replyTo.original_text}
          </span>
          <button type="button" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleSend}
        className="glass-strong safe-bottom sticky bottom-0 z-30 flex items-center gap-2 px-3 py-3"
      >
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            notifyTyping();
          }}
          aria-label="Votre message"
          placeholder={`Écrire en ${languageLabel(myLanguage)}…`}
          className="glass h-12 flex-1 rounded-3xl px-4 text-[15px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="bg-brand shadow-glow flex h-12 w-12 items-center justify-center rounded-3xl text-primary-foreground transition-transform duration-300 active:scale-90 disabled:opacity-40"
          aria-label="Envoyer"
        >
          <SendHorizonal className="h-5 w-5" />
        </button>
      </form>

      <ChatCustomizer
        open={customizing}
        onClose={() => setCustomizing(false)}
        conversationId={conversationId}
        previewUrl={backgroundPhoto}
      />
    </div>
  );
}
