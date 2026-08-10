import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Bell, BellOff, Check, Loader2, MessageCircle, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { openConversation } from "@/lib/chat.functions";
import {
  friendRequestMessage,
  isDuplicate,
  logBackendError,
  type BackendErrorCode,
} from "@/lib/backend-errors";
import { haptic } from "@/lib/chat-theme";
import { useT } from "@/lib/i18n";

export type ContactState = "self" | "none" | "sent" | "received" | "friends" | "blocked";

/** Resolves the relationship between the signed-in user and another profile. */
export function useContactState(otherId: string | null | undefined) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["contact-state", user?.id, otherId],
    enabled: Boolean(user?.id && otherId),
    queryFn: async (): Promise<{ state: ContactState; requestId: string | null }> => {
      if (otherId === user!.id) return { state: "self", requestId: null };

      const { data: blocked } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("user_id", user!.id)
        .eq("blocked_id", otherId!)
        .maybeSingle();
      if (blocked) return { state: "blocked", requestId: null };

      const { data: friendship } = await supabase
        .from("friendships")
        .select("id")
        .eq("user_id", user!.id)
        .eq("friend_id", otherId!)
        .maybeSingle();
      if (friendship) return { state: "friends", requestId: null };

      const { data: requests } = await supabase
        .from("friend_requests")
        .select("id, sender_id, status")
        .eq("status", "pending")
        .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user!.id})`);
      const pending = (requests ?? [])[0];
      if (pending) {
        return {
          state: pending.sender_id === user!.id ? "sent" : "received",
          requestId: pending.id,
        };
      }
      return { state: "none", requestId: null };
    },
  });
}


/** Finds the existing 1:1 conversation with a contact, if any. */
function useDirectConversation(otherId: string | null | undefined) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["direct-conversation", user?.id, otherId],
    enabled: Boolean(user?.id && otherId),
    queryFn: async () => {
      const { data: mine } = await supabase
        .from("conversation_participants")
        .select("conversation_id, muted_at")
        .eq("user_id", user!.id);
      const ids = (mine ?? []).map((row) => row.conversation_id);
      if (ids.length === 0) return null;
      const { data: theirs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", otherId!)
        .in("conversation_id", ids);
      const conversationId = theirs?.[0]?.conversation_id ?? null;
      if (!conversationId) return null;
      const row = (mine ?? []).find((item) => item.conversation_id === conversationId);
      return { conversationId, mutedAt: row?.muted_at ?? null };
    },
  });
}

/** Add / accept / decline / block / mute / delete actions for a contact. */
export function ContactActions({ profileId }: { profileId: string }) {
  const { t } = useT();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const startConversation = useServerFn(openConversation);
  const stateQuery = useContactState(profileId);
  const conversationQuery = useDirectConversation(profileId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["contact-state"] });
    void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["friends"] });
  }

  const fail = (code: BackendErrorCode) => (error: unknown) => {
    logBackendError(code, error);
    toast.error(t("social.contact.actionFailed"), { description: friendRequestMessage(error) });
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("USER_NOT_AUTHENTICATED");
      if (user.id === profileId) throw new Error(t("social.contact.selfAddError"));

      // A previous declined/cancelled row would trip the (sender, receiver)
      // unique constraint, so clear it first (delete policy allows both sides).
      await supabase
        .from("friend_requests")
        .delete()
        .eq("sender_id", user.id)
        .eq("receiver_id", profileId)
        .neq("status", "pending");

      const { error } = await supabase
        .from("friend_requests")
        .insert({ sender_id: user.id, receiver_id: profileId, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("social.contact.requestSent"));
      refresh();
    },
    onError: (error) => {
      if (isDuplicate(error)) {
        toast.info(t("social.contact.requestAlreadySent"));
        refresh();
        return;
      }
      fail("FRIEND_REQUEST_INSERT_ERROR")(error);
    },
  });


  const answer = useMutation({
    mutationFn: async (accept: boolean) => {
      const requestId = stateQuery.data?.requestId;
      if (!requestId) throw new Error(t("social.contact.requestNotFound"));
      if (accept) {
        const { error } = await supabase.rpc("accept_friend_request", { _request_id: requestId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "declined" })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: fail("FRIEND_REQUEST_UPDATE_ERROR"),
  });

  const block = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) {
        const { error } = await supabase
          .from("blocked_users")
          .insert({ user_id: user!.id, blocked_id: profileId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("blocked_users")
        .delete()
        .eq("user_id", user!.id)
        .eq("blocked_id", profileId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: fail("FRIEND_REQUEST_UPDATE_ERROR"),
  });

  const mute = useMutation({
    mutationFn: async (next: boolean) => {
      const conversationId = conversationQuery.data?.conversationId;
      if (!conversationId) throw new Error(t("social.contact.noConversationToMute"));
      const { error } = await supabase
        .from("conversation_participants")
        .update({ muted_at: next ? new Date().toISOString() : null })
        .eq("conversation_id", conversationId)
        .eq("user_id", user!.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next ? t("social.contact.muted") : t("social.contact.unmuted"));
      void queryClient.invalidateQueries({ queryKey: ["direct-conversation"] });
    },
    onError: fail("CONVERSATION_ERROR"),
  });

  const removeContact = useMutation({
    mutationFn: async () => {
      await supabase
        .from("friendships")
        .delete()
        .or(
          `and(user_id.eq.${user!.id},friend_id.eq.${profileId}),and(user_id.eq.${profileId},friend_id.eq.${user!.id})`,
        );
      await supabase
        .from("friend_requests")
        .delete()
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${profileId}),and(sender_id.eq.${profileId},receiver_id.eq.${user!.id})`,
        );
      const conversationId = conversationQuery.data?.conversationId;
      if (conversationId) {
        await supabase
          .from("conversation_participants")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", user!.id);
      }
    },
    onSuccess: () => {
      setConfirmDelete(false);
      toast.success(t("social.contact.removed"));
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["direct-conversation"] });
      refresh();
    },
    onError: fail("CONVERSATION_ERROR"),
  });

  const openChat = useMutation({
    mutationFn: async () => startConversation({ data: { friendId: profileId } }),
    onSuccess: (result) =>
      navigate({ to: "/chat/$conversationId", params: { conversationId: result.conversationId } }),
    onError: fail("CONVERSATION_ERROR"),
  });

  if (stateQuery.isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  const state = stateQuery.data?.state ?? "none";
  if (state === "self") return null;

  const busy =
    add.isPending ||
    answer.isPending ||
    block.isPending ||
    mute.isPending ||
    removeContact.isPending ||
    openChat.isPending;
  const muted = Boolean(conversationQuery.data?.mutedAt);
  const hasConversation = Boolean(conversationQuery.data?.conversationId);

  return (
    <div className="flex items-center gap-2">
      {state === "none" ? (
        <Action
          label={t("social.contact.add")}
          primary
          busy={busy}
          onClick={() => {
            haptic();
            add.mutate();
          }}
          icon={<UserPlus className="h-4 w-4" />}
        />
      ) : null}

      {state === "sent" ? (
        <span className="rounded-2xl bg-secondary/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
          {t("social.contact.sentBadge")}
        </span>
      ) : null}

      {state === "received" ? (
        <>
          <Action
            label={t("social.contact.accept")}
            primary
            busy={busy}
            onClick={() => answer.mutate(true)}
            icon={<Check className="h-4 w-4" />}
          />
          <Action
            label={t("social.contact.decline")}
            busy={busy}
            onClick={() => answer.mutate(false)}
            icon={<X className="h-4 w-4" />}
          />
        </>
      ) : null}

      {state === "friends" ? (
        <Action
          label={t("social.contact.chat")}
          primary
          busy={busy}
          onClick={() => openChat.mutate()}
          icon={<MessageCircle className="h-4 w-4" />}
        />
      ) : null}

      {hasConversation ? (
        <Action
          label={muted ? t("social.contact.reactivate") : t("social.contact.mute")}
          busy={busy}
          onClick={() => {
            haptic();
            mute.mutate(!muted);
          }}
          icon={muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        />
      ) : null}

      <Action
        label={state === "blocked" ? t("social.contact.unblock") : t("social.contact.block")}
        busy={busy}
        onClick={() => block.mutate(state !== "blocked")}
        icon={<Ban className="h-4 w-4" />}
      />

      {state === "friends" || hasConversation ? (
        <Action
          label={t("social.contact.remove")}
          busy={busy}
          onClick={() => {
            haptic();
            setConfirmDelete(true);
          }}
          icon={<Trash2 className="h-4 w-4" />}
        />
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="glass-strong animate-rise w-full max-w-sm rounded-3xl p-5">
            <p className="font-semibold">{t("social.contact.confirmRemoveTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("social.contact.confirmRemoveBody")}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="glass h-11 flex-1 rounded-3xl text-sm font-semibold active:scale-[0.98]"
              >
                {t("social.contact.cancel")}
              </button>
              <button
                type="button"
                disabled={removeContact.isPending}
                onClick={() => removeContact.mutate()}
                className="h-11 flex-1 rounded-3xl bg-destructive text-sm font-semibold text-destructive-foreground active:scale-[0.98] disabled:opacity-60"
              >
                {removeContact.isPending ? t("social.contact.removing") : t("social.contact.remove")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Action({
  label,
  icon,
  onClick,
  primary,
  busy,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50 ${
        primary ? "bg-brand shadow-glow text-primary-foreground" : "glass text-muted-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
