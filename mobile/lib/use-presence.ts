import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const TYPING_TTL = 3000;

/**
 * Direct port of src/hooks/usePresence.ts — Realtime-only (presence sync +
 * typing broadcast), nothing written to the database, so it stays cheap and
 * doesn't block the rest of the screen if it fails to connect.
 */
export function usePresence(options: { conversationId: string; userId: string | null; shareStatus: boolean }) {
  const { conversationId, userId, shareStatus } = options;
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`presence-${conversationId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setPeerOnline(Object.keys(state).some((key) => key !== userId));
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload["payload"] as { userId?: string } | undefined)?.userId;
        if (!from || from === userId) return;
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), TYPING_TTL);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && shareStatus) {
          void channel.track({ userId, at: Date.now() });
        }
      });

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, userId, shareStatus]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!channelRef.current || !userId || now - lastSent.current < 1000) return;
    lastSent.current = now;
    void channelRef.current.send({ type: "broadcast", event: "typing", payload: { userId } });
  }, [userId]);

  return { peerOnline, peerTyping, notifyTyping };
}
