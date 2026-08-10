import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  CornerUpLeft,
  Languages,
  Loader2,
  LogOut,

  BrainCircuit,
  Palette,
  PencilLine,
  UserPlus,
  RefreshCw,
  SendHorizonal,
  Smile,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/app-shell";
import { ConversationMemorySheet } from "@/components/conversation-memory-sheet";
import { InviteSheet } from "@/components/invite-sheet";
import { LinkPreviewCard } from "@/components/link-preview-card";
import { MediaComposer } from "@/components/media-composer";
import { MessageAttachments, type MessageAttachment } from "@/components/message-attachments";
import { ChatCustomizer } from "@/components/chat-customizer";
import { CorrectTranslationSheet } from "@/components/correct-translation-sheet";
import { MessageReactions, ReactionPicker, useReactions } from "@/components/message-reactions";
import { useCurrentUser, useProfile } from "@/hooks/useAuth";
import { useBackgroundPhotoUrl, useChatPreferences } from "@/hooks/useChatPreferences";
import { usePresence } from "@/hooks/usePresence";
import { useUserSettings } from "@/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/backend-errors";
import { backgroundStyle, haptic, readableTextColor } from "@/lib/chat-theme";
import {
  backfillConversation,
  recoverStalledTranslation,
  translateMessage,
} from "@/lib/chat.functions";
import { languageFlag, languageLabel } from "@/lib/languages";
import { useT } from "@/lib/i18n";
import { recoverStalledVoice } from "@/lib/media.functions";
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
  notFoundComponent: () => {
    const { t } = useT();
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">{t("chat.notFound")}</div>
    );
  },
  component: ChatPage,
});

const PAGE_SIZE = 40;

/** A translation still pending after this delay is considered abandoned. */
const STALE_TRANSLATION_MS = 60_000;

type Receipt = { user_id: string; delivered_at: string | null; read_at: string | null };

type Translation = {
  language: string;
  translated_text: string;
  confidence_score: number | null;
  alternative_translation?: string | null;
  corrected_by_user: boolean | null;
};

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
  message_type: string;
  attachments: MessageAttachment[] | null;
  message_translations: Translation[];
  message_receipts: Receipt[];
};

/** Below this score the translation is flagged as possibly imprecise. */
const LOW_CONFIDENCE = 0.6;

const SELECT =
  "id, sender_id, original_text, source_language, created_at, status, translation_status, reply_to_message_id, deleted_at, deleted_for, message_type, attachments, message_translations(language, translated_text, confidence_score, alternative_translation, corrected_by_user), message_receipts(user_id, delivered_at, read_at)";


function ChatPage() {
  const { t } = useT();
  const { conversationId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const { data: settings } = useUserSettings();
  const queryClient = useQueryClient();
  const runTranslate = useServerFn(translateMessage);
  const runBackfill = useServerFn(backfillConversation);
  const runRecoverVoice = useServerFn(recoverStalledVoice);
  const runRecoverTranslation = useServerFn(recoverStalledTranslation);
  const [draft, setDraft] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [customizing, setCustomizing] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [online, setOnline] = useState(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<MessageRow | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { preferences } = useChatPreferences(conversationId);
  const backgroundPhoto = useBackgroundPhotoUrl(preferences);
  const reactions = useReactions(conversationId);


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

  /**
   * One query for the whole conversation: its metadata plus every participant
   * profile. Groups can mix as many languages as there are members.
   */
  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
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
        ? await supabase
            .from("profiles")
            .select("id, username, avatar_url, primary_language")
            .in("id", ids)
        : { data: [] };

      return { conversation, members: profiles ?? [] };
    },
  });

  const members = conversationQuery.data?.members ?? [];
  const others = useMemo(
    () => members.filter((member) => member.id !== user?.id),
    [members, user?.id],
  );
  const isGroup =
    conversationQuery.data?.conversation?.type === "group" || others.length > 1;
  const peer = others[0] ?? null;
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const title = isGroup
    ? (conversationQuery.data?.conversation?.name ?? t("chat.groupFallbackName"))
    : (peer?.username ?? t("chat.conversationFallbackName"));

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
          const row = payload.new as Partial<Translation> & { message_id?: string };
          if (!row?.message_id || !row.language || !row.translated_text) return;
          const next: Translation = {
            language: row.language,
            translated_text: row.translated_text,
            confidence_score: row.confidence_score ?? null,
            corrected_by_user: row.corrected_by_user ?? null,
          };
          patchMessages((rows) =>
            rows.map((message) =>
              message.id === row.message_id
                ? {
                    ...message,
                    message_translations: [
                      ...message.message_translations.filter((t) => t.language !== row.language),
                      next,
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

  /**
   * A transport failure (Safari suspending the tab, flaky mobile network) is not
   * a rejected message: it must be retried, not reported as "not sent".
   */
  function isTransportError(error: unknown) {
    const message = (error as { message?: string })?.message?.toLowerCase() ?? "";
    return (
      !navigator.onLine ||
      message.includes("failed to fetch") ||
      message.includes("load failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("aborted")
    );
  }

  /** True when the request was refused because the access token had expired. */
  function isAuthError(error: unknown) {
    const anyError = error as { message?: string; code?: string; status?: number };
    const message = anyError?.message?.toLowerCase() ?? "";
    return (
      anyError?.status === 401 ||
      message.includes("jwt") ||
      message.includes("token") ||
      // RLS refusal caused by auth.uid() being null after a silent expiry
      anyError?.code === "42501"
    );
  }

  const inFlight = useRef(new Set<string>());

  /** Inserts the message, then kicks translation off separately. */
  const deliver = useCallback(
    async (item: PendingMessage) => {
      if (inFlight.current.has(item.localId)) return;
      inFlight.current.add(item.localId);
      try {
        // iOS Safari freezes background tabs: the cached token can be expired by
        // the time the user comes back. Refresh before writing, retry once.
        const insert = () =>
          supabase
            .from("messages")
            .insert({
              conversation_id: item.conversationId,
              sender_id: user!.id,
              // Idempotency key: the unique (sender_id, client_id) index turns a
              // replayed outbox item into a conflict instead of a duplicate.
              client_id: item.localId,
              original_text: item.text,
              source_language: item.sourceLanguage,
              translation_status: "pending",
              status: "sent",
              reply_to_message_id: item.replyToMessageId ?? null,
            })
            .select(SELECT)
            .single();

        let { data, error } = await insert();
        if (error && isAuthError(error)) {
          await supabase.auth.refreshSession();
          ({ data, error } = await insert());
        }
        // Already delivered by an earlier attempt whose response never came back:
        // adopt the existing row instead of creating a second message.
        if (error && (error as { code?: string }).code === "23505") {
          const { data: existing } = await supabase
            .from("messages")
            .select(SELECT)
            .eq("conversation_id", item.conversationId)
            .eq("sender_id", user!.id)
            .eq("client_id", item.localId)
            .maybeSingle();
          if (existing) {
            data = existing as typeof data;
            error = null;
          }
        }
        if (error) throw error;

        dequeueOutbox(item.localId);
        setPending((queue) => queue.filter((entry) => entry.localId !== item.localId));
        const row = data as MessageRow;
        patchMessages((rows) => (rows.some((m) => m.id === row.id) ? rows : [...rows, row]));

        // Translation runs independently: a failure must never unsend the message.
        void runTranslate({ data: { messageId: row.id } }).catch((translationError) => {
          handleError("TRANSLATION_ERROR", translationError);
        });

      } finally {
        inFlight.current.delete(item.localId);
      }
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
    // Safari never fires "online" when a suspended PWA resumes — retry on focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushOutbox();
    };
    window.addEventListener("online", onUp);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void flushOutbox(), 15_000);
    return () => {
      window.removeEventListener("online", onUp);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [conversationId, flushOutbox]);

  // Voice notes whose processing request died mid-flight are resumed once here,
  // so no bubble can stay on "Transcription…"/"Traduction…" forever.
  const recoveredVoice = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || recoveredVoice.current === conversationId) return;
    recoveredVoice.current = conversationId;
    void Promise.allSettled([
      runRecoverVoice({ data: { conversationId } }),
      runRecoverTranslation({ data: { conversationId } }),
    ])
      .then((results) => {
        const recovered = results.some(
          (result) =>
            result.status === "fulfilled" &&
            Boolean((result.value as { recovered?: number } | undefined)?.recovered),
        );
        if (recovered) void messagesQuery.refetch();
      })
      .catch(() => {
        recoveredVoice.current = null;
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user?.id]);

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
    onError: (error) => {
      // The message is still queued in the outbox and will be retried: telling
      // the user it was not sent would be wrong.
      if (isTransportError(error)) {
        handleError("NETWORK_ERROR", error);
        toast.info(t("chat.networkUnstable"));
        return;
      }
      toast.error(handleError("MESSAGE_ERROR", error));
    },
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

  const [inviting, setInviting] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const navigate = useNavigate();

  /**
   * Leaving a group only removes MY participation (RLS allows deleting my own
   * row): the conversation and its history stay intact for the other members.
   */
  const leaveGroup = useCallback(async () => {
    if (!user?.id) return;
    if (!window.confirm(t("chat.leaveGroupConfirm"))) return;
    haptic();
    const { error } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
    if (error) {
      toast.error(handleError("DATABASE_ERROR", error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    void navigate({ to: "/chats" });
  }, [conversationId, navigate, queryClient, user?.id]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);


  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col"
      style={backgroundStyle(preferences, backgroundPhoto)}
    >
      <header className="glass-strong safe-top sticky top-0 z-30 flex items-center gap-3 px-4 py-3">
        <Link
          to="/chats"
          aria-label={t("chat.back")}
          className="flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar
          name={isGroup ? title : peer?.username}
          url={isGroup ? conversationQuery.data?.conversation?.avatar_url : peer?.avatar_url}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {peerTyping ? (
              <span className="text-primary">
                {t("chat.typing", { name: peer?.username ?? t("chat.typingFallbackName") })}
              </span>
            ) : isGroup ? (
              <>
                <Languages className="h-3 w-3" />
                {t("chat.members", {
                  count: others.length + 1,
                  languages: [...new Set(members.map((m) => languageLabel(m.primary_language)))].join(", "),
                })}
              </>
            ) : peerOnline ? (
              <span className="text-emerald-400">{t("chat.online")}</span>
            ) : (
              <>
                <Languages className="h-3 w-3" />
                {t("chat.languagePair", {
                  peerLanguage: languageLabel(peer?.primary_language),
                  myLanguage: languageLabel(myLanguage),
                })}
              </>
            )}
          </p>
        </div>
        {isGroup ? (
          <button
            type="button"
            onClick={() => void leaveGroup()}
            aria-label={t("chat.leaveGroup")}
            className="glass flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            haptic();
            setInviting(true);
          }}
          aria-label={t("chat.invite")}
          className="glass flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <UserPlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            haptic();
            setMemoryOpen(true);
          }}
          aria-label={t("chat.memory")}
          className="glass flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <BrainCircuit className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            haptic();
            setCustomizing(true);
          }}
          aria-label={t("chat.customize")}
          className="glass flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Palette className="h-4 w-4" />
        </button>
      </header>

      {!online ? (
        <p className="flex items-center justify-center gap-2 bg-amber-500/10 py-1.5 text-[11px] text-amber-400">
          <WifiOff className="h-3 w-3" /> {t("chat.offline")}
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
              {t("chat.loadPrevious")}
            </button>
          </div>
        ) : null}

        {messagesQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("chat.loading")}</p>
        ) : messagesQuery.isError ? (
          <div role="alert" className="glass mt-8 rounded-3xl p-6 text-center text-sm">
            <p>{handleError("MESSAGE_ERROR", messagesQuery.error)}</p>
            <button
              type="button"
              onClick={() => void messagesQuery.refetch()}
              className="bg-brand mt-4 rounded-2xl px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              {t("chat.retry")}
            </button>
          </div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <div className="glass animate-rise mt-8 rounded-3xl p-6 text-center">
            <p className="font-semibold">{t("chat.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isGroup
                ? t("chat.emptyBodyGroup", { language: languageLabel(myLanguage) })
                : t("chat.emptyBodyDirect", {
                    language: languageLabel(myLanguage),
                    name: peer?.username ?? t("chat.emptyBodyFallbackName"),
                    peerLanguage: languageLabel(peer?.primary_language),
                  })}
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
            // A translation still "pending" long after the message was stored
            // means the job died: show the original text plus a retry instead
            // of an endless "Traduction…" spinner.
            const stale =
              message.translation_status === "pending" &&
              Date.now() - Date.parse(message.created_at) > STALE_TRANSLATION_MS;
            const waiting =
              !mine && !translation && message.source_language !== myLanguage &&
              message.translation_status !== "failed" && !stale;
            const failed = message.translation_status === "failed" || stale;

            const quoted = message.reply_to_message_id
              ? byId.get(message.reply_to_message_id)
              : null;
            const otherReceipts = message.message_receipts.filter((r) => r.user_id !== user?.id);
            const peerReceipt = otherReceipts[0];
            const readCount = otherReceipts.filter((r) => r.read_at).length;
            const author = mine ? null : memberById.get(message.sender_id);
            // Only warn when the engine itself signalled doubt: a badge on
            // every bubble would be noise.
            const uncertain =
              Boolean(translated) &&
              !original &&
              translation?.corrected_by_user !== true &&
              typeof translation?.confidence_score === "number" &&
              translation.confidence_score < LOW_CONFIDENCE;


            return (
              <div
                key={message.id}
                className={`animate-rise group flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                {isGroup && author && !removed ? (
                  <span className="mb-0.5 px-2 text-[11px] font-medium text-muted-foreground">
                    {author.username}
                  </span>
                ) : null}
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
                  {!removed && message.attachments?.length ? (
                    <MessageAttachments
                      attachments={message.attachments}
                      messageId={message.id}
                      transcriptionFailed={
                        message.message_type === "voice" && message.translation_status === "failed"
                      }
                    />
                  ) : null}
                  {removed ? (
                    t("chat.deletedMessage")
                  ) : waiting ? (
                    <span className="flex items-center gap-2 opacity-70">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("chat.translating")}
                    </span>
                  ) : (
                    body
                  )}
                </div>

                {uncertain ? (
                  <p className="mt-1 flex items-center gap-1 px-2 text-[11px] text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> {t("chat.uncertainTranslation")}
                  </p>
                ) : null}

                {!removed && !original && translation?.alternative_translation ? (
                  <p className="mt-1 max-w-[80%] px-2 text-[11px] text-muted-foreground">
                    {t("chat.alternativeTranslation", { text: translation.alternative_translation })}
                  </p>
                ) : null}

                {!removed && !waiting ? <LinkPreviewCard text={message.original_text} /> : null}

                <MessageReactions
                  conversationId={conversationId}
                  messageId={message.id}
                  reactions={reactions}
                  mine={mine}
                />

                {pickerFor === message.id ? (
                  <div className="mt-1">
                    <ReactionPicker
                      conversationId={conversationId}
                      messageId={message.id}
                      onDone={() => setPickerFor(null)}
                    />
                  </div>
                ) : null}

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
                          ? t("chat.seeTranslation")
                          : t("chat.seeOriginal", { flag: languageFlag(message.source_language) })}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      aria-label={t("chat.reactToMessage")}
                      onClick={() => setPickerFor((id) => (id === message.id ? null : message.id))}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <Smile className="h-3 w-3" />
                    </button>

                    {translation ? (
                      <button
                        type="button"
                        aria-label={t("chat.correctTranslation")}
                        onClick={() => setCorrecting(message)}
                        className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      >
                        <PencilLine className="h-3 w-3" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      aria-label={t("chat.replyToMessage")}
                      onClick={() => setReplyTo(message)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <CornerUpLeft className="h-3 w-3" />
                    </button>


                    {mine ? (
                      <>
                        <button
                          type="button"
                          aria-label={t("chat.deleteMessage")}
                          onClick={() => deleteMessage.mutate({ message, forEveryone: true })}
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        {isGroup ? (
                          readCount > 0 ? (
                            <span className="text-primary">{t("chat.readByCount", { count: readCount })}</span>
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-label={t("chat.sent")} />
                          )
                        ) : peerReceipt?.read_at ? (
                          <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label={t("chat.read")} />
                        ) : peerReceipt?.delivered_at ? (
                          <CheckCheck className="h-3.5 w-3.5" aria-label={t("chat.delivered")} />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-label={t("chat.sent")} />
                        )}
                      </>
                    ) : null}

                    {failed ? (
                      <button
                        type="button"
                        onClick={() => retryTranslation.mutate(message.id)}
                        className="flex items-center gap-1 text-amber-400"
                      >
                        <RefreshCw className="h-3 w-3" /> {t("chat.translationFailedRetry")}
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
            <span className="mt-1 px-2 text-[11px] text-muted-foreground">{t("chat.pendingSend")}</span>
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
          <button type="button" aria-label={t("chat.cancelReply")} onClick={() => setReplyTo(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleSend}
        className="glass-strong safe-bottom sticky bottom-0 z-30 flex items-center gap-2 px-3 py-3"
      >
        <MediaComposer
          conversationId={conversationId}
          language={myLanguage}
          onSent={() => void messagesQuery.refetch()}
        />
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            notifyTyping();
          }}
          aria-label={t("chat.yourMessage")}
          placeholder={t("chat.composerHint", { language: languageLabel(myLanguage) })}
          className="glass h-12 flex-1 rounded-3xl px-4 text-[15px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="bg-brand shadow-glow flex h-12 w-12 items-center justify-center rounded-3xl text-primary-foreground transition-transform duration-300 active:scale-90 disabled:opacity-40"
          aria-label={t("chat.send")}
        >
          <SendHorizonal className="h-5 w-5" />
        </button>
      </form>

      <CorrectTranslationSheet
        open={correcting !== null}
        onClose={() => setCorrecting(null)}
        messageId={correcting?.id ?? null}
        language={myLanguage}
        sourceLanguage={correcting?.source_language ?? myLanguage}
        originalText={correcting?.original_text ?? ""}
        currentTranslation={
          correcting?.message_translations.find((item) => item.language === myLanguage)
            ?.translated_text ?? ""
        }
        onCorrected={(text) => {
          const id = correcting?.id;
          if (!id) return;
          patchMessages((rows) =>
            rows.map((message) =>
              message.id === id
                ? {
                    ...message,
                    message_translations: [
                      ...message.message_translations.filter((t) => t.language !== myLanguage),
                      {
                        language: myLanguage,
                        translated_text: text,
                        confidence_score: 1,
                        corrected_by_user: true,
                      },
                    ],
                  }
                : message,
            ),
          );
        }}
      />



      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        conversationId={conversationId}
      />

      <ConversationMemorySheet
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        conversationId={conversationId}
      />

      <ChatCustomizer
        open={customizing}
        onClose={() => setCustomizing(false)}
        conversationId={conversationId}
        previewUrl={backgroundPhoto}
      />
    </div>
  );
}
