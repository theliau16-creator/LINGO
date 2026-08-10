import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import { supabase } from "@/integrations/supabase/client";
import { retryTranscription } from "@/lib/media.functions";
import { useT, type TFunction } from "@/lib/i18n";

export type MessageAttachment = {
  path: string;
  type?: string;
  duration_ms?: number;
};

function formatDuration(ms?: number) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Photo({ path }: { path: string }) {
  const { t } = useT();
  const { data, isLoading } = useSignedMedia(path);
  if (isLoading || !data) {
    return <div className="h-40 w-52 animate-pulse rounded-2xl bg-muted-foreground/20" />;
  }
  return (
    <a href={data} target="_blank" rel="noreferrer">
      <img
        src={data}
        alt={t("media.sharedPhotoAlt")}
        loading="lazy"
        className="max-h-64 w-full rounded-2xl object-cover"
      />
    </a>
  );
}

function voiceLabels(t: TFunction): Record<string, string> {
  return {
    uploaded: t("media.transcribing"),
    pending: t("media.transcribing"),
    transcribing: t("media.transcribing"),
    transcribed: t("media.translating"),
    completed: "",
    failed: "",
  };
}

const TERMINAL = ["completed", "failed"];
/** Beyond this delay a non-terminal state means the job died: offer a retry. */
const STALL_AFTER_MS = 60_000;

/** Live transcription state of a voice message (participants only). */
function useVoiceState(messageId: string) {
  return useQuery({
    queryKey: ["voice-message", messageId],
    refetchInterval: (query) => {
      const status = query.state.data?.transcription_status;
      return status && !TERMINAL.includes(status) ? 3000 : false;
    },
    queryFn: async () => {
      const { data } = await supabase
        .from("voice_messages")
        .select("transcription_status, transcription_error, transcript, updated_at")
        .eq("message_id", messageId)
        .maybeSingle();
      return data;
    },
  });
}

function VoiceNote({
  path,
  durationMs,
  messageId,
}: {
  path: string;
  durationMs?: number;
  messageId: string;
}) {
  const { t } = useT();
  const { data, isLoading } = useSignedMedia(path);
  const voice = useVoiceState(messageId);
  const queryClient = useQueryClient();
  const run = useServerFn(retryTranscription);
  const retry = useMutation({
    mutationFn: () => run({ data: { messageId } }),
    onSuccess: () => {
      toast.success(t("media.transcriptionDone"));
      void queryClient.invalidateQueries({ queryKey: ["voice-message", messageId] });
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: () => {
      toast.error(t("media.transcriptionStillUnavailable"));
      void queryClient.invalidateQueries({ queryKey: ["voice-message", messageId] });
    },
  });

  const status = voice.data?.transcription_status ?? "uploaded";
  const updatedAt = voice.data?.updated_at ? Date.parse(voice.data.updated_at) : Date.now();
  // A non-terminal state that stopped moving means the processing request died
  // (Safari suspended the tab, worker recycled). Never spin forever on it.
  const stalled = !TERMINAL.includes(status) && Date.now() - updatedAt > STALL_AFTER_MS;
  const failed = status === "failed" || stalled;
  const label = retry.isPending
    ? t("media.transcribing")
    : failed
      ? ""
      : (voiceLabels(t)[status] ?? "");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 shrink-0 opacity-70" />
        {isLoading || !data ? (
          <div className="h-8 w-44 animate-pulse rounded-full bg-current/20" />
        ) : (
          <audio controls src={data} className="h-9 w-52" />
        )}
        <span className="text-[11px] opacity-70">{formatDuration(durationMs)}</span>
      </div>
      {label ? (
        <span className="flex items-center gap-1 text-[11px] opacity-70">
          <Loader2 className="h-3 w-3 animate-spin" /> {label}
        </span>
      ) : null}
      {failed && !retry.isPending ? (
        <button
          type="button"
          onClick={() => retry.mutate()}
          className="flex items-center gap-1 text-left text-[11px] underline-offset-2 hover:underline"
        >
          <RefreshCw className="h-3 w-3 shrink-0" />
          {voice.data?.transcription_error ??
            (stalled ? t("media.processingInterrupted") : t("media.transcriptionUnavailable"))}{" "}
          — {t("media.retrySuffix")}
        </button>
      ) : null}
    </div>
  );
}


/** Renders the photos or the voice note carried by a message. */
export function MessageAttachments({
  attachments,
  messageId,
}: {
  attachments: MessageAttachment[];
  messageId: string;
  transcriptionFailed?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mb-1 space-y-2">
      {attachments.map((attachment) =>
        attachment.type === "audio" ? (
          <VoiceNote
            key={attachment.path}
            path={attachment.path}
            messageId={messageId}
            {...(attachment.duration_ms ? { durationMs: attachment.duration_ms } : {})}
          />
        ) : (
          <Photo key={attachment.path} path={attachment.path} />
        ),
      )}
    </div>
  );
}
