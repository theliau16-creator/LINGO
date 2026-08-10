import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Languages, MessageCircle, QrCode, Search, Settings, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/app-shell";
import { ContactActions } from "@/components/contact-actions";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/chat-theme";
import { LANGUAGES, languageFlag, languageLabel } from "@/lib/languages";
import { useT } from "@/lib/i18n";

type Feature = { labelKey: "social.search.featureFriends" | "social.search.featureChats" | "social.search.featureSettings" | "social.search.featureQr"; hintKey: "social.search.featureFriendsHint" | "social.search.featureChatsHint" | "social.search.featureSettingsHint" | "social.search.featureQrHint"; to: string; icon: typeof Settings };

const FEATURES: Feature[] = [
  { labelKey: "social.search.featureFriends", hintKey: "social.search.featureFriendsHint", to: "/friends", icon: Users },
  { labelKey: "social.search.featureChats", hintKey: "social.search.featureChatsHint", to: "/chats", icon: MessageCircle },
  { labelKey: "social.search.featureSettings", hintKey: "social.search.featureSettingsHint", to: "/settings", icon: Settings },
  { labelKey: "social.search.featureQr", hintKey: "social.search.featureQrHint", to: "/profile", icon: QrCode },
];

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Global search over people, conversations, languages and app features. */
export function GlobalSearch({ onOpenQr }: { onOpenQr?: () => void }) {
  const { t } = useT();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term).trim();
  const active = debounced.length >= 1;
  const needle = debounced.replace(/^@/, "");

  const peopleQuery = useQuery({
    queryKey: ["search-people", needle, user?.id],
    enabled: active && needle.length >= 2 && Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase.rpc("search_profiles", { _query: needle });
      return (data ?? []).slice(0, 8);
    },

  });

  const conversationsQuery = useQuery({
    queryKey: ["search-conversations", user?.id],
    enabled: active && Boolean(user?.id),
    queryFn: async () => {
      const { data: mine } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user!.id);
      const ids = (mine ?? []).map((row) => row.conversation_id);
      if (ids.length === 0) return [];
      const { data: others } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", ids)
        .neq("user_id", user!.id);
      const peerIds = [...new Set((others ?? []).map((row) => row.user_id))];
      if (peerIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, primary_language")
        .in("id", peerIds);
      return (others ?? []).map((row) => ({
        conversationId: row.conversation_id,
        profile: (profiles ?? []).find((p) => p.id === row.user_id) ?? null,
      }));
    },
  });

  const conversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter((item) =>
        (item.profile?.username ?? "").toLowerCase().includes(needle.toLowerCase()),
      ),
    [conversationsQuery.data, needle],
  );

  const languages = useMemo(
    () =>
      active
        ? LANGUAGES.filter(
            (item) =>
              item.label.toLowerCase().includes(needle.toLowerCase()) ||
              item.native.toLowerCase().includes(needle.toLowerCase()) ||
              item.code === needle.toLowerCase(),
          ).slice(0, 4)
        : [],
    [active, needle],
  );

  const features = useMemo(
    () =>
      active
        ? FEATURES.filter((item) => t(item.labelKey).toLowerCase().includes(needle.toLowerCase()))
        : [],
    [active, needle, t],
  );

  const people = peopleQuery.data ?? [];
  const empty =
    active && people.length === 0 && conversations.length === 0 && languages.length === 0 && features.length === 0;

  return (
    <div>
      <div className="glass focus-within:ring-2 focus-within:ring-primary/60 flex items-center gap-3 rounded-3xl px-4 py-3.5 transition-all duration-300 focus-within:scale-[1.01]">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("social.search.placeholder")}
          aria-label={t("social.search.ariaSearch")}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
        />
        {term ? (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label={t("social.search.ariaClear")}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {onOpenQr ? (
          <button
            type="button"
            onClick={() => {
              haptic();
              onOpenQr();
            }}
            aria-label={t("social.search.ariaScanQr")}
            className="text-muted-foreground"
          >
            <QrCode className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {active ? (
        <div className="animate-rise mt-3 space-y-4">
          {people.length > 0 ? (
            <Group title={t("social.search.groupPeople")}>
              {people.map((person) => (
                <div key={person.id} className="glass flex items-center gap-3 rounded-3xl px-4 py-3">
                  <Avatar name={person.username} url={person.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">@{person.username}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {languageFlag(person.primary_language)} {languageLabel(person.primary_language)}
                    </p>
                  </div>
                  <ContactActions profileId={person.id} />
                </div>
              ))}
            </Group>
          ) : null}

          {conversations.length > 0 ? (
            <Group title={t("social.search.groupConversations")}>
              {conversations.map((item) => (
                <button
                  key={item.conversationId}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/chat/$conversationId",
                      params: { conversationId: item.conversationId },
                    })
                  }
                  className="glass flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left active:scale-[0.98]"
                >
                  <Avatar name={item.profile?.username} url={item.profile?.avatar_url} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.profile?.username}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t("social.search.openConversation")}
                    </span>
                  </span>
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </Group>
          ) : null}

          {languages.length > 0 ? (
            <Group title={t("social.search.groupLanguages")}>
              {languages.map((language) => (
                <div
                  key={language.code}
                  className="glass flex items-center gap-3 rounded-3xl px-4 py-3 text-sm"
                >
                  <span className="text-lg">{language.flag}</span>
                  <span className="flex-1 font-semibold">{language.label}</span>
                  <Languages className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </Group>
          ) : null}

          {features.length > 0 ? (
            <Group title={t("social.search.groupFeatures")}>
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.labelKey}
                    type="button"
                    onClick={() => navigate({ to: feature.to })}
                    className="glass flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left active:scale-[0.98]"
                  >
                    <span className="bg-secondary/60 flex h-9 w-9 items-center justify-center rounded-2xl">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">{t(feature.labelKey)}</span>
                      <span className="block text-[11px] text-muted-foreground">{t(feature.hintKey)}</span>
                    </span>
                  </button>
                );
              })}
            </Group>
          ) : null}

          {empty ? (
            <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
              <UserPlus className="h-4 w-4" /> {t("social.search.noResults", { term: debounced })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
