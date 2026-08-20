import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useSignedMedia } from "@/lib/use-signed-media";
import { useVoiceState } from "@/lib/use-voice-state";
import { transcribeVoice } from "@/lib/use-media";
import type { MessageAttachment } from "@/lib/use-conversation-messages";

function formatDuration(ms?: number) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Photo({ path }: { path: string }) {
  const { data, isLoading } = useSignedMedia(path);
  if (isLoading || !data) {
    return <View className="h-40 w-52 animate-pulse rounded-2xl bg-secondary" />;
  }
  return <Image source={{ uri: data }} className="h-52 w-64 rounded-2xl" resizeMode="cover" />;
}

const TERMINAL = ["completed", "failed"];
const STALL_AFTER_MS = 60_000;

/** Direct port of VoiceNote (src/components/message-attachments.tsx). */
function VoiceNote({ path, durationMs, messageId, tint }: { path: string; durationMs?: number; messageId: string; tint: string }) {
  const { data, isLoading } = useSignedMedia(path);
  const voice = useVoiceState(messageId);
  const [retrying, setRetrying] = useState(false);
  const player = useAudioPlayer(data ?? null);
  const status = useAudioPlayerStatus(player);

  async function handleRetry() {
    setRetrying(true);
    try {
      await transcribeVoice(messageId);
    } catch {
      /* the row's own status (polled) reflects the failure */
    } finally {
      setRetrying(false);
    }
  }

  const transcriptionStatus = voice?.transcription_status ?? "uploaded";
  const updatedAt = voice?.updated_at ? Date.parse(voice.updated_at) : Date.now();
  const stalled = !TERMINAL.includes(transcriptionStatus) && Date.now() - updatedAt > STALL_AFTER_MS;
  const failed = transcriptionStatus === "failed" || stalled;
  const label = retrying
    ? "Transcription…"
    : failed
      ? ""
      : transcriptionStatus === "transcribed"
        ? "Traduction…"
        : transcriptionStatus !== "completed"
          ? "Transcription…"
          : "";

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <Text style={{ color: tint }}>🎙️</Text>
        {isLoading || !data ? (
          <View className="h-8 w-40 animate-pulse rounded-full bg-secondary" />
        ) : (
          <Pressable
            onPress={() => (status.playing ? player.pause() : player.play())}
            className="flex-row items-center gap-2 rounded-full bg-black/10 px-3 py-1.5"
          >
            <Text style={{ color: tint }}>{status.playing ? "⏸" : "▶️"}</Text>
            <Text style={{ color: tint }} className="text-[12px]">
              {formatDuration((status.currentTime ?? 0) * 1000 || durationMs)}
            </Text>
          </Pressable>
        )}
      </View>
      {label ? (
        <View className="flex-row items-center gap-1">
          <ActivityIndicator size="small" color={tint} />
          <Text style={{ color: tint }} className="text-[11px] opacity-70">
            {label}
          </Text>
        </View>
      ) : null}
      {failed && !retrying ? (
        <Pressable onPress={() => void handleRetry()}>
          <Text style={{ color: tint }} className="text-[11px] underline opacity-90">
            {voice?.transcription_error ?? (stalled ? "Traitement interrompu" : "Transcription indisponible")} — réessayer
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Direct port of MessageAttachments (src/components/message-attachments.tsx). */
export function MessageAttachments({
  attachments,
  messageId,
  mine,
}: {
  attachments: MessageAttachment[];
  messageId: string;
  mine: boolean;
}) {
  if (!attachments.length) return null;
  const tint = mine ? "#fbfcfe" : "#f7f8fb";
  return (
    <View className="mb-1 gap-2">
      {attachments.map((attachment) =>
        attachment.type === "audio" ? (
          <VoiceNote key={attachment.path} path={attachment.path} messageId={messageId} tint={tint} {...(attachment.duration_ms ? { durationMs: attachment.duration_ms } : {})} />
        ) : (
          <Photo key={attachment.path} path={attachment.path} />
        ),
      )}
    </View>
  );
}
