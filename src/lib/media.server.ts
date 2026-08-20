import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

import {
  assertAudioPlayable,
  assertImageObject,
  audioFileName,
  isPathInConversation,
  MAX_PHOTOS_PER_MESSAGE,
  sniffAudioContainer,
} from "./media-validation";

export const MEDIA_BUCKET = "chat-media";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type Attachment = {
  path: string;
  type: "image" | "audio";
  name?: string;
  size?: number;
  duration_ms?: number;
  width?: number;
  height?: number;
};

/** Inserts a message carrying photos (with an optional caption). */
export async function sendPhotoMessage(
  supabase: Client,
  userId: string,
  input: { conversationId: string; attachments: Attachment[]; caption?: string; language: string },
) {
  if (!input.attachments.length) throw new Error("Aucune photo à envoyer.");
  if (input.attachments.length > MAX_PHOTOS_PER_MESSAGE) {
    throw new Error(`${MAX_PHOTOS_PER_MESSAGE} photos maximum par message.`);
  }
  const caption = (input.caption ?? "").trim().slice(0, 1000);

  // Server-side gate: the client cannot claim a size/type the storage object
  // does not actually have, nor attach a file uploaded into a different
  // conversation's folder (see isPathInConversation in media-validation.ts).
  const supabaseAdmin = await admin();
  for (const attachment of input.attachments) {
    if (!isPathInConversation(attachment.path, input.conversationId)) {
      throw new Error("Fichier non autorisé.");
    }
    const folder = attachment.path.split("/").slice(0, -1).join("/");
    const name = attachment.path.split("/").pop() ?? "";
    const { data: listed } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .list(folder, { search: name, limit: 1 });
    const object = listed?.find((entry) => entry.name === name);
    if (!object) throw new Error("Fichier introuvable ou vide.");
    assertImageObject({
      size: (object.metadata as { size?: number } | null)?.size ?? 0,
      mimetype: (object.metadata as { mimetype?: string } | null)?.mimetype ?? "",
    });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: userId,
      original_text: caption,
      source_language: input.language,
      message_type: "image",
      attachments: input.attachments as unknown as Json,
      status: "sent",
      translation_status: caption ? "pending" : "done",
    })
    .select("id")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Envoi impossible.");

  if (caption) {
    const { translateMessageForParticipants } = await import("./chat.server");
    try {
      await translateMessageForParticipants(supabase, data.id, userId);
    } catch {
      /* the photo is delivered even if the caption translation fails */
    }
  }

  return { id: data.id };
}

/** Reads the first bytes of an upload to identify its real container. */
async function sniffAudioExtension(file: Blob): Promise<string | null> {
  try {
    return sniffAudioContainer(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * Transcribes an audio file with the Lingo AI speech-to-text endpoint.
 * Throws a readable French error when the service is unavailable — the voice
 * message itself is always kept and remains playable.
 */
async function transcribeAudio(file: Blob, path: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Transcription indisponible (service non configuré).");

  const sniffed = await sniffAudioExtension(file);
  // Size/format are checked again here: this is the last gate before a paid call.
  assertAudioPlayable(file.size, sniffed);

  const form = new FormData();
  form.append("model", "openai/gpt-4o-transcribe");
  form.append("file", file, audioFileName(path, file.type || "audio/mp4", sniffed));



  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    if (response.status === 402) throw new Error("Crédits de transcription épuisés.");
    if (response.status === 429) throw new Error("Trop de demandes. Réessayez dans un instant.");
    throw new Error(`Transcription indisponible (${response.status}).`);
  }

  const payload = (await response.json()) as { text?: string };
  const text = payload.text?.trim() ?? "";
  if (!text) throw new Error("Aucune parole détectée dans cet enregistrement.");
  return text;
}

/** Best-effort language detection; falls back to the sender's language. */
async function detectLanguage(text: string, fallback: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return fallback;
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        messages: [
          {
            role: "user",
            content: `Réponds uniquement par le code ISO-639-1 (2 lettres) de la langue de ce texte :\n${text.slice(0, 400)}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const code = payload.choices?.[0]?.message?.content?.trim().toLowerCase().match(/[a-z]{2}/)?.[0];
    return code ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Voice message pipeline: store → transcribe → translate.
 * Each step degrades gracefully; the audio is never lost.
 */
export async function sendVoiceMessage(
  supabase: Client,
  userId: string,
  input: { conversationId: string; path: string; durationMs: number; language: string },
) {
  // Same gate as sendPhotoMessage, same primitive: the recording must live in
  // THIS message's conversation folder, not one merely uploaded into a
  // different shared conversation. Storage/RLS for chat-media is identical
  // for audio and images (bucket-level policies, not type-specific), and
  // both uploaders (web's objectPath(), mobile's uploadMediaFile()) already
  // write voice recordings under the same conversationId/... convention as
  // photos — this was a missing check, not a different convention to adopt.
  if (!isPathInConversation(input.path, input.conversationId)) {
    throw new Error("Fichier non autorisé.");
  }

  const attachment: Attachment = {
    path: input.path,
    type: "audio",
    duration_ms: input.durationMs,
  };

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: userId,
      original_text: "",
      source_language: input.language,
      message_type: "voice",
      attachments: [attachment] as unknown as Json,
      status: "sent",
      translation_status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !message) throw new Error(error?.message ?? "Envoi impossible.");

  // The audio is already uploaded and the message row exists: the voice row is
  // only metadata. A failure here must NEVER make the send fail.
  const { error: voiceError } = await supabase.from("voice_messages").insert({
    message_id: message.id,
    conversation_id: input.conversationId,
    audio_path: input.path,
    duration_ms: input.durationMs,
    transcription_status: "uploaded",
  });

  // Transcription runs in its own request (see transcribeVoice): a Worker kills
  // any work still running after the response is returned.
  return { id: message.id, voiceRow: !voiceError };
}

/** Non-terminal states: a row left there is stalled work, never a final result. */
const STALLED_STATES = ["pending", "uploaded", "transcribing", "transcribed"];
/** After this delay a non-terminal row is considered abandoned and retryable. */
const STALL_AFTER_MS = 60_000;

/**
 * Translates the transcript of a voice message and closes its lifecycle.
 * Always terminal: the voice row ends in `completed` even when the translation
 * failed — the failure lives on `messages.translation_status`, so the bubble can
 * offer a translation retry instead of spinning on "Traduction…" forever.
 */
async function finishVoiceMessage(
  supabaseAdmin: Client,
  messageId: string,
  voiceRowId: string,
  quotaUserId: string | null,
) {
  try {
    const { translateMessageForParticipants } = await import("./chat.server");
    await translateMessageForParticipants(supabaseAdmin, messageId, quotaUserId);
  } catch (translationError) {
    const reason =
      translationError instanceof Error ? translationError.message : "Traduction indisponible.";
    await supabaseAdmin
      .from("messages")
      .update({ translation_status: "failed", translation_error: reason })
      .eq("id", messageId);
  } finally {
    await supabaseAdmin
      .from("voice_messages")
      .update({ transcription_status: "completed", processing_started_at: null })
      .eq("id", voiceRowId);
  }
}

/**
 * Transcribes (or retries) one voice message, then translates its transcript.
 * Idempotent and resumable: when a transcript already exists the audio is not
 * sent to the model again, only the missing translation step is replayed.
 * A DB-level lock (`claim_voice_job`) guarantees a single worker at a time, so
 * the paid speech-to-text model is never called twice for the same recording.
 */
export async function transcribeVoiceMessage(messageId: string) {
  const supabaseAdmin = await admin();
  const { data: voice } = await supabaseAdmin
    .from("voice_messages")
    .select("id, message_id, audio_path, transcript, transcript_language")
    .eq("message_id", messageId)
    .maybeSingle();
  if (!voice) throw new Error("Message vocal introuvable.");

  const { data: message } = await supabaseAdmin
    .from("messages")
    .select("source_language, sender_id")
    .eq("id", messageId)
    .maybeSingle();
  // Voice translations are debited exactly like text ones: to the author.
  const quotaUserId = message?.sender_id ?? null;

  // Resume path: the expensive step already succeeded, only finish the rest.
  if (voice.transcript && voice.transcript.trim().length > 0) {
    await finishVoiceMessage(supabaseAdmin, messageId, voice.id, quotaUserId);
    return { transcript: voice.transcript, language: voice.transcript_language ?? "fr" };
  }

  const { data: locked } = await supabaseAdmin.rpc("claim_voice_job", { _message_id: messageId });
  if (locked !== true) throw new Error("Transcription déjà en cours. Patientez un instant.");

  await supabaseAdmin
    .from("voice_messages")
    .update({ transcription_error: null })
    .eq("id", voice.id);


  try {
    const { data: file, error } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .download(voice.audio_path);
    if (error || !file) throw new Error(error?.message ?? "Audio introuvable.");

    const text = await transcribeAudio(file, voice.audio_path);
    const language = await detectLanguage(text, message?.source_language ?? "fr");

    await supabaseAdmin
      .from("voice_messages")
      .update({
        transcript: text,
        transcript_language: language,
        transcription_status: "transcribed",
        transcription_error: null,
      })
      .eq("id", voice.id);

    await supabaseAdmin
      .from("messages")
      .update({ original_text: text, source_language: language, translation_status: "pending" })
      .eq("id", messageId);

    // The transcript is safe from here on: a translation failure must not
    // erase it nor mark the voice note as failed.
    await finishVoiceMessage(supabaseAdmin, messageId, voice.id, quotaUserId);

    return { transcript: text, language };
  } catch (transcriptionError) {
    const reason =
      transcriptionError instanceof Error
        ? transcriptionError.message
        : "Transcription indisponible.";
    await supabaseAdmin
      .from("voice_messages")
      .update({
        transcription_status: "failed",
        transcription_error: reason,
        processing_started_at: null,
      })
      .eq("id", voice.id);
    await supabaseAdmin
      .from("messages")
      .update({ translation_status: "failed", translation_error: reason })
      .eq("id", messageId);
    throw new Error(reason);
  }
}

/**
 * Recovers voice notes whose processing request died mid-flight (Safari tab
 * suspended, worker killed, network drop). Called when a chat is opened so a
 * bubble can never stay on "Transcription…"/"Traduction…" indefinitely.
 * Concurrency is arbitrated by `claim_voice_job`, so a job still genuinely in
 * flight is skipped instead of being sent to the paid model a second time.
 */
export async function recoverStalledVoiceMessages(conversationId: string, limit = 5) {
  const supabaseAdmin = await admin();
  const threshold = new Date(Date.now() - STALL_AFTER_MS).toISOString();
  const { data: stalled } = await supabaseAdmin
    .from("voice_messages")
    .select("id, message_id")
    .eq("conversation_id", conversationId)
    .in("transcription_status", STALLED_STATES)
    .lt("updated_at", threshold)
    .order("updated_at", { ascending: true })
    .limit(limit);

  let recovered = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of stalled ?? []) {
    try {
      await transcribeVoiceMessage(row.message_id);
      recovered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("déjà en cours")) skipped += 1;
      else failed += 1;
    }
  }

  return { recovered, failed, skipped };
}


