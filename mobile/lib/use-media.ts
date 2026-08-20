import { apiFetch } from "./api";
import type { Attachment } from "./upload-media";

export type { Attachment };

/**
 * The three privileged media operations, each behind its own endpoint
 * (Phase 7 backend additions) — thin wrappers, all the actual logic
 * (storage verification, transcription, translation) stays server-side.
 */
export function sendPhotoMessage(input: {
  conversationId: string;
  attachments: Attachment[];
  caption?: string;
  language: string;
}) {
  return apiFetch<{ id: string }>("/api/media/photos", { method: "POST", body: input });
}

export function sendVoiceMessage(input: { conversationId: string; path: string; durationMs: number; language: string }) {
  return apiFetch<{ id: string; voiceRow: boolean }>("/api/media/voice", { method: "POST", body: input });
}

export function transcribeVoice(messageId: string) {
  return apiFetch<{ transcript: string; language: string }>(`/api/media/voice/${messageId}/transcribe`, {
    method: "POST",
  });
}
