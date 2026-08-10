import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MEDIA_BUCKET } from "@/hooks/useSignedMedia";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/backend-errors";
import { haptic } from "@/lib/chat-theme";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { retryTranscription, sendPhotos, sendVoice } from "@/lib/media.functions";
import { useT } from "@/lib/i18n";


const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const MAX_RECORDING_MS = 120_000;

/** Candidate containers, best first. Safari/iOS only supports mp4/aac. */
const AUDIO_CANDIDATES: { mimeType: string; extension: string }[] = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "mp4" },
  { mimeType: "audio/mp4", extension: "mp4" },
  { mimeType: "audio/mpeg", extension: "mp3" },
];

/** Picks a container the current browser can actually record. */
function pickAudioFormat(): { mimeType?: string; extension: string } {
  const supported =
    typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function";
  if (!supported) return { extension: "mp4" };
  for (const candidate of AUDIO_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
  }
  return { extension: "mp4" };
}

function extensionForBlob(blob: Blob, fallback: string) {
  const subtype = blob.type.split(";")[0]?.split("/")[1]?.toLowerCase();
  if (!subtype) return fallback;
  if (subtype === "mpeg") return "mp3";
  if (subtype === "x-m4a" || subtype === "m4a") return "m4a";
  return subtype;
}

function objectPath(conversationId: string, extension: string) {
  return `${conversationId}/${crypto.randomUUID()}.${extension}`;
}


/** Photo picker + voice recorder for the chat composer. */
export function MediaComposer({
  conversationId,
  language,
  onSent,
}: {
  conversationId: string;
  language: string;
  onSent: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const formatRef = useRef<{ mimeType?: string; extension: string }>({ extension: "webm" });
  const runTranscription = useServerFn(retryTranscription);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useT();


  const photoMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const attachments = [];
      for (const file of files) {
        if (file.size > MAX_PHOTO_BYTES) throw new Error(t("media.photoTooLarge"));
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = objectPath(conversationId, extension);
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (error) throw error;
        attachments.push({ path, type: "image" as const, name: file.name, size: file.size });
      }
      return sendPhotos({ data: { conversationId, attachments, language } });
    },
    onSuccess: () => {
      haptic();
      onSent();
    },
    onError: (error) => toast.error(handleError("MESSAGE_ERROR", error)),
  });

  const voiceMutation = useMutation({
    mutationFn: async ({ blob, durationMs }: { blob: Blob; durationMs: number }) => {
      if (blob.size < 1024) throw new Error(t("media.emptyRecording"));
      const path = objectPath(conversationId, extensionForBlob(blob, formatRef.current.extension));
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, blob, { contentType: blob.type || "audio/webm" });
      if (error) throw error;
      const message = await sendVoice({ data: { conversationId, path, durationMs, language } });
      // The audio is already playable; transcription runs in its own request so
      // the worker cannot kill it mid-flight. A failure here keeps the audio.
      onSent();
      try {
        await runTranscription({ data: { messageId: message.id } });
      } catch {
        /* the bubble shows the failure state and a retry button */
      }
      return message;
    },
    onSuccess: () => {
      haptic();
      onSent();
    },
    // The audio upload + message insert are the only failing steps here:
    // transcription errors are swallowed above and handled in the bubble.
    onError: (error) => {
      const detail = error instanceof Error ? error.message : "";
      toast.error(detail || handleError("MESSAGE_ERROR", error));
      handleError("MESSAGE_ERROR", error);
    },
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const format = pickAudioFormat();
      formatRef.current = format;
      const recorder = format.mimeType
        ? new MediaRecorder(stream, { mimeType: format.mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const durationMs = Date.now() - startedAtRef.current;
        setRecording(false);
        if (durationMs < 800) {
          toast.info(t("media.recordingTooShort"));
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || format.mimeType || "audio/webm",
        });
        setBusy(true);
        voiceMutation.mutate({ blob, durationMs }, { onSettled: () => setBusy(false) });
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      haptic();
      window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORDING_MS);
    } catch {
      toast.error(t("media.micUnavailable"));
    }
  }


  function stopRecording() {
    recorderRef.current?.stop();
  }

  const pending = busy || photoMutation.isPending || voiceMutation.isPending;

  return (
    <div className="flex items-center gap-1">
      {FEATURE_FLAGS.photo_messages_enabled ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).slice(0, 6);
              event.target.value = "";
              if (files.length) photoMutation.mutate(files);
            }}
          />
          <button
            type="button"
            aria-label={t("media.sendPhoto")}
            disabled={pending || recording}
            onClick={() => fileRef.current?.click()}
            className="glass flex h-11 w-11 items-center justify-center rounded-3xl text-muted-foreground active:scale-90 disabled:opacity-40"
          >
            {photoMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
          </button>
        </>
      ) : null}

      {FEATURE_FLAGS.voice_messages_enabled ? (
        <button
          type="button"
          aria-label={recording ? t("media.stopRecording") : t("media.recordVoice")}
          disabled={pending && !recording}
          onClick={() => (recording ? stopRecording() : void startRecording())}
          className={`flex h-11 w-11 items-center justify-center rounded-3xl active:scale-90 disabled:opacity-40 ${
            recording ? "bg-red-500 text-white" : "glass text-muted-foreground"
          }`}
        >
          {voiceMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : recording ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      ) : null}
    </div>
  );
}
