import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { languageLabel } from "@/lib/languages";
import { openConversation } from "@/lib/chat.functions";
import { ContactActions } from "@/components/contact-actions";
import { friendRequestMessage, logBackendError } from "@/lib/backend-errors";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({
    meta: [
      { title: "Amis — Lingo" },
      { name: "description", content: "Trouvez des amis et démarrez une conversation traduite." },
      { property: "og:title", content: "Amis — Lingo" },
      { property: "og:description", content: "Trouvez des amis et démarrez une conversation traduite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const startConversation = useServerFn(openConversation);
  const [term, setTerm] = useState("");
  const { t } = useT();

  const requestsQuery = useQuery({
    queryKey: ["friend-requests", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: requests } = await supabase
        .from("friend_requests")
        .select("id, sender_id, status")
        .eq("receiver_id", user!.id)
        .eq("status", "pending");
      const senderIds = (requests ?? []).map((r) => r.sender_id);
      if (senderIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, primary_language")
        .in("id", senderIds);
      return (requests ?? []).map((request) => ({
        ...request,
        profile: (profiles ?? []).find((p) => p.id === request.sender_id) ?? null,
      }));
    },
  });

  const friendsQuery = useQuery({
    queryKey: ["friends", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", user!.id);
      const ids = (links ?? []).map((l) => l.friend_id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, primary_language")
        .in("id", ids);
      return data ?? [];
    },
  });

  const searchQuery = useQuery({
    queryKey: ["user-search", term, user?.id],
    enabled: term.trim().length >= 2 && Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase.rpc("search_profiles", { _query: term.trim() });
      return (data ?? []).slice(0, 10);
    },

  });

  const answerRequest = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (accept) {
        const { error } = await supabase.rpc("accept_friend_request", { _request_id: id });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "declined" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey: ["contact-state"] });
    },
    onError: (error) => {
      logBackendError("FRIEND_REQUEST_UPDATE_ERROR", error);
      toast.error(t("friends.actionFailed"), { description: friendRequestMessage(error) });
    },
  });

  const openChat = useMutation({
    mutationFn: async (friendId: string) => startConversation({ data: { friendId } }),
    onSuccess: (result) =>
      navigate({ to: "/chat/$conversationId", params: { conversationId: result.conversationId } }),
    onError: (error) =>
      toast.error(t("friends.conversationFailed"), {
        description: error instanceof Error ? error.message : t("common.retry"),
      }),
  });

  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey: ["contact-state"] });
    };
    const channel = supabase
      .channel(`social-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, invalidate)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const requests = requestsQuery.data ?? [];

  return (
    <AppShell title={t("friends.title")} subtitle={t("friends.subtitle")}>
      <div className="glass mb-5 flex items-center gap-3 rounded-3xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("friends.search")}
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      {term.trim().length >= 2 ? (
        <Section title={t("friends.results")}>
          {(searchQuery.data ?? []).length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t("friends.noResults")}</p>
          ) : (
            (searchQuery.data ?? []).map((person) => (
              <Row key={person.id} person={person} fallback={t("friends.user")}>
                <ContactActions profileId={person.id} />
              </Row>
            ))
          )}
        </Section>
      ) : null}

      {requests.length > 0 ? (
        <Section title={t("friends.requests")}>
          {requests.map((request) => (
            <Row key={request.id} person={request.profile} fallback={t("friends.user")}>
              <button
                type="button"
                onClick={() => answerRequest.mutate({ id: request.id, accept: true })}
                className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground active:scale-90"
                aria-label={t("friends.accept")}
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => answerRequest.mutate({ id: request.id, accept: false })}
                className="glass flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground active:scale-90"
                aria-label={t("friends.decline")}
              >
                <X className="h-4 w-4" />
              </button>
            </Row>
          ))}
        </Section>
      ) : null}

      <Section title={t("friends.mine")}>
        {friendsQuery.isLoading ? (
          <div className="glass h-[72px] animate-pulse rounded-3xl" />
        ) : (friendsQuery.data ?? []).length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            {t("friends.none")}
          </p>
        ) : (
          (friendsQuery.data ?? []).map((friend) => (
            <Row key={friend.id} person={friend} fallback={t("friends.user")}>
              <button
                type="button"
                onClick={() => openChat.mutate(friend.id)}
                disabled={openChat.isPending}
                className="bg-brand rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50"
              >
                {openChat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("friends.chat")}
              </button>
            </Row>
          ))
        )}
      </Section>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  person,
  children,
  fallback,
}: {
  person: { username: string; avatar_url: string | null; primary_language: string } | null;
  children: React.ReactNode;
  fallback: string;
}) {
  return (
    <div className="glass animate-rise flex items-center gap-3 rounded-3xl p-3">
      <Avatar name={person?.username} url={person?.avatar_url} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{person?.username ?? fallback}</p>
        <p className="text-xs text-muted-foreground">
          {languageLabel(person?.primary_language)}
        </p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
