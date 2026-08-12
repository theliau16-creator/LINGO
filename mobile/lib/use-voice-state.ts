import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type VoiceState = {
  transcription_status: string;
  transcription_error: string | null;
  transcript: string | null;
  updated_at: string;
} | null;

const TERMINAL = ["completed", "failed"];

/**
 * Live transcription state of a voice message — direct port of useVoiceState
 * (src/components/message-attachments.tsx): polls every 3s while non-terminal,
 * stops once completed/failed. Realtime UPDATE on `messages` already covers
 * the translation status; this is specifically for `voice_messages` which
 * isn't part of the Phase 3 messages subscription.
 */
export function useVoiceState(messageId: string) {
  const [voice, setVoice] = useState<VoiceState>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const { data } = await supabase
        .from("voice_messages")
        .select("transcription_status, transcription_error, transcript, updated_at")
        .eq("message_id", messageId)
        .maybeSingle();
      if (cancelled) return;
      setVoice(data);
      const status = data?.transcription_status;
      if (status && !TERMINAL.includes(status)) {
        timer = setTimeout(poll, 3000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [messageId]);

  return voice;
}
