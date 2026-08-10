import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/backend-errors";
import { haptic } from "@/lib/chat-theme";
import { useT } from "@/lib/i18n";

export const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🙏"] as const;

type ReactionRow = { id: string; message_id: string; user_id: string; emoji: string };

/**
 * Every reaction of a conversation, kept in sync through Realtime.
 * One query for the whole thread instead of one per bubble.
 */
export function useReactions(conversationId: string) {
  const queryClient = useQueryClient();
  const key = ["reactions", conversationId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ReactionRow[]> => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, queryClient]);

  return query.data ?? [];
}

/** Reaction row displayed under a bubble, plus the emoji picker. */
export function MessageReactions({
  conversationId,
  messageId,
  reactions,
  mine,
}: {
  conversationId: string;
  messageId: string;
  reactions: ReactionRow[];
  mine: boolean;
}) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { t } = useT();
  const forMessage = reactions.filter((row) => row.message_id === messageId);

  const toggle = useMutation({
    mutationFn: async (emoji: string) => {
      if (!user?.id) return;
      const existing = forMessage.find((row) => row.user_id === user.id && row.emoji === emoji);
      if (existing) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        conversation_id: conversationId,
        user_id: user.id,
        emoji,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reactions", conversationId] }),
    onError: (error) => toast.error(handleError("MESSAGE_ERROR", error)),
  });

  const grouped = new Map<string, ReactionRow[]>();
  for (const row of forMessage) {
    grouped.set(row.emoji, [...(grouped.get(row.emoji) ?? []), row]);
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${mine ? "justify-end" : ""}`}>
      {[...grouped.entries()].map(([emoji, rows]) => {
        const reacted = rows.some((row) => row.user_id === user?.id);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              haptic();
              toggle.mutate(emoji);
            }}
            aria-label={t("chat.reaction", { emoji })}
            aria-pressed={reacted}
            className={`glass flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] transition-transform active:scale-90 ${
              reacted ? "ring-1 ring-primary" : ""
            }`}
          >
            <span>{emoji}</span>
            {rows.length > 1 ? (
              <span className="text-[10px] text-muted-foreground">{rows.length}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact emoji picker shown in the message action menu. */
export function ReactionPicker({
  conversationId,
  messageId,
  onDone,
}: {
  conversationId: string;
  messageId: string;
  onDone?: () => void;
}) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { t } = useT();

  const add = useMutation({
    mutationFn: async (emoji: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("message_reactions")
        .upsert(
          { message_id: messageId, conversation_id: conversationId, user_id: user.id, emoji },
          { onConflict: "message_id,user_id,emoji" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reactions", conversationId] });
      onDone?.();
    },
    onError: (error) => toast.error(handleError("MESSAGE_ERROR", error)),
  });

  return (
    <div className="glass flex items-center gap-1 rounded-full px-2 py-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={t("chat.reactWith", { emoji })}
          onClick={() => {
            haptic();
            add.mutate(emoji);
          }}
          className="text-lg transition-transform active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
