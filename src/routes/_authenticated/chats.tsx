import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNowStrict } from "date-fns";
import * as dateLocales from "date-fns/locale";
import { MessagesSquare, Search, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Avatar } from "@/components/app-shell";
import { useCurrentUser, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { backfillConversation } from "@/lib/chat.functions";
import { handleError } from "@/lib/backend-errors";
import { useT } from "@/lib/i18n";
import { languageLabel } from "@/lib/languages";

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({
    meta: [
      { title: "Discussions — Lingo" },
      { name: "description", content: "Vos conversations traduites automatiquement." },
      { property: "og:title", content: "Discussions — Lingo" },
      { property: "og:description", content: "Vos conversations traduites automatiquement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatsPage,
});

type ConversationRow = {
  id: string;
  last_message_at: string;
  peer: {
    id: string;
    username: string;
    avatar_url: string | null;
    primary_language: string;
  } | null;
  preview: string | null;
  needsBackfill: boolean;
};

function ChatsPage() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const navigate = useNavigate();
  const myLanguage = profile?.primary_language ?? "fr";
  const { t } = useT();
  const queryClient = useQueryClient();
  const runBackfill = useServerFn(backfillConversation);

  // Première ouverture de l'app : on demande pays + langue avant les discussions.
  useEffect(() => {
    if (!profile || profile.country) return;
    if (sessionStorage.getItem("lingo:onboarding-skipped")) return;
    navigate({ to: "/onboarding", replace: true });
  }, [profile, navigate]);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", user?.id, myLanguage, limit],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ConversationRow[]> => {
      // Only the archived-free conversations of the current page are loaded,
      // and only their most recent messages — never the whole history.
      const { data: mine } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user!.id)
        .is("archived_at", null);

      const myIds = (mine ?? []).map((row) => row.conversation_id);
      if (myIds.length === 0) return [];

      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, last_message_at")
        .in("id", myIds)
        .order("last_message_at", { ascending: false })
        .limit(limit);

      const ids = (conversations ?? []).map((row) => row.id);
      if (ids.length === 0) return [];

      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", ids)
        .neq("user_id", user!.id);

      const peerIds = [...new Set((participants ?? []).map((p) => p.user_id))];
      const { data: profiles } = peerIds.length
        ? await supabase
            .from("profiles")
            .select("id, username, avatar_url, primary_language")
            .in("id", peerIds)
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
      const previewByConversation = new Map<string, string>();
      const missingByConversation = new Set<string>();
      for (const message of messages ?? []) {
        const translation = (message.message_translations ?? []).find(
          (item) => item.language === myLanguage,
        );
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
        peer: peerByConversation.get(conversation.id) ?? null,
        preview: previewByConversation.get(conversation.id) ?? null,
        needsBackfill: missingByConversation.has(conversation.id),
      }));
    },
  });

  const hasMoreConversations = (conversationsQuery.data ?? []).length >= limit;

  // Realtime: a new message only bumps the concerned row in the cache.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("chats-overview")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as {
            conversation_id: string;
            original_text: string;
            created_at: string;
          };
          queryClient.setQueryData<ConversationRow[]>(
            ["conversations", user.id, myLanguage, limit],
            (rows) => {
              if (!rows) return rows;
              if (!rows.some((item) => item.id === row.conversation_id)) {
                void conversationsQuery.refetch();
                return rows;
              }
              return rows
                .map((item) =>
                  item.id === row.conversation_id
                    ? {
                        ...item,
                        last_message_at: row.created_at,
                        preview: row.original_text,
                        needsBackfill: true,
                      }
                    : item,
                )
                .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
            },
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, myLanguage, limit]);

  // Après un changement de langue, les aperçus non traduits sont retraduits
  // immédiatement, sans devoir ouvrir chaque conversation.
  const backfilling = useRef<Set<string>>(new Set());
  useEffect(() => {
    const rows = conversationsQuery.data ?? [];
    const pending = rows.filter(
      (row) => row.needsBackfill && !backfilling.current.has(`${row.id}:${myLanguage}`),
    );
    if (pending.length === 0) return;
    pending.forEach((row) => backfilling.current.add(`${row.id}:${myLanguage}`));
    void Promise.all(
      pending.map((row) =>
        runBackfill({ data: { conversationId: row.id, language: myLanguage } }).catch(() => null),
      ),
    ).then(() => {
      void conversationsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsQuery.data, myLanguage]);

  const filtered = useMemo(() => {
    const rows = conversationsQuery.data ?? [];
    if (!search.trim()) return rows;
    const needle = search.toLowerCase();
    return rows.filter(
      (row) =>
        row.peer?.username.toLowerCase().includes(needle) ||
        row.preview?.toLowerCase().includes(needle),
    );
  }, [conversationsQuery.data, search]);

  return (
    <AppShell
      title={t("chats.title")}
      subtitle={t("chats.subtitle")}
      action={
        <button
          type="button"
          onClick={() => navigate({ to: "/friends" })}
          className="bg-brand shadow-glow flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground transition-transform duration-300 active:scale-90"
          aria-label={t("chats.new")}
        >
          <UserPlus className="h-5 w-5" />
        </button>
      }
    >
      <div className="glass mb-5 flex items-center gap-3 rounded-3xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("chats.search")}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      {conversationsQuery.isLoading ? (
        <SkeletonList />
      ) : conversationsQuery.isError ? (
        <div role="alert" className="glass mt-6 rounded-3xl p-6 text-center text-sm">
          <p>{handleError("DATABASE_ERROR", conversationsQuery.error)}</p>
          <button
            type="button"
            onClick={() => void conversationsQuery.refetch()}
            className="bg-brand mt-4 rounded-2xl px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Réessayer
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <>
          <ul className="space-y-2">
            {filtered.map((conversation, index) => (
              <li
                key={conversation.id}
                className="animate-rise"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <Link
                  to="/chat/$conversationId"
                  params={{ conversationId: conversation.id }}
                  className="glass flex items-center gap-3 rounded-3xl p-3 transition-transform duration-300 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Avatar name={conversation.peer?.username} url={conversation.peer?.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">
                        {conversation.peer?.username ?? t("chats.fallbackName")}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(conversation.last_message_at), {
                          locale: dateLocale(myLanguage),
                          addSuffix: false,
                        })}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {conversation.preview ?? t("chats.sayHi")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      {t("chats.speaks")} {languageLabel(conversation.peer?.primary_language)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {hasMoreConversations ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((value) => value + 20)}
                className="glass rounded-2xl px-4 py-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              >
                Charger plus de discussions
              </button>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2].map((index) => (
        <li key={index} className="glass h-[76px] animate-pulse rounded-3xl" />
      ))}
    </ul>
  );
}

function dateLocale(language: string) {
  const map: Record<string, keyof typeof dateLocales> = {
    fr: "fr",
    en: "enGB",
    es: "es",
    de: "de",
    it: "it",
    pt: "pt",
    nl: "nl",
    pl: "pl",
    ru: "ru",
    uk: "uk",
    tr: "tr",
    ar: "ar",
    he: "he",
    hi: "hi",
    zh: "zhCN",
    ja: "ja",
    ko: "ko",
    vi: "vi",
    th: "th",
    sv: "sv",
  };
  const key = map[language] ?? "enGB";
  return (dateLocales as Record<string, unknown>)[key] as typeof dateLocales.enGB;
}

function EmptyState({
  t,
}: {
  t: (key: "chats.empty.title" | "chats.empty.body" | "chats.empty.cta") => string;
}) {
  return (
    <div className="glass animate-rise mt-6 flex flex-col items-center rounded-3xl px-6 py-12 text-center">
      <span className="bg-brand shadow-glow flex h-14 w-14 items-center justify-center rounded-3xl text-primary-foreground">
        <MessagesSquare className="h-6 w-6" />
      </span>
      <p className="mt-5 text-base font-semibold">{t("chats.empty.title")}</p>
      <p className="mt-1 max-w-[16rem] text-sm text-muted-foreground">{t("chats.empty.body")}</p>
      <Link
        to="/friends"
        className="bg-brand mt-6 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        {t("chats.empty.cta")}
      </Link>
    </div>
  );
}
