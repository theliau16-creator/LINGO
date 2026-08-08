/**
 * Call signaling — provider-agnostic contracts for a future audio/video call
 * feature (with live subtitles/translation).
 *
 * STATUS: architecture only. No WebRTC connection, no signaling transport,
 * no UI. Text messaging is and remains the primary MVP; this file only
 * reserves the shape of a signaling layer so a real implementation (e.g.
 * Supabase Realtime broadcast, or a dedicated SFU) can be dropped in later
 * without redesigning the conversation model.
 */

export type CallKind = "audio" | "video";

export type CallStatus = "ringing" | "active" | "ended" | "declined" | "missed";

export type CallParticipant = {
  userId: string;
  joinedAt: string | null;
  leftAt: string | null;
};

export type CallSession = {
  id: string;
  conversationId: string;
  kind: CallKind;
  status: CallStatus;
  startedBy: string;
  participants: CallParticipant[];
  createdAt: string;
};

/** A single signaling message exchanged while negotiating a connection. */
export type CallSignal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice-candidate"; candidate: string }
  | { type: "hangup" };

export interface CallSignalingChannel {
  join(sessionId: string): Promise<void>;
  send(signal: CallSignal): Promise<void>;
  onSignal(handler: (signal: CallSignal) => void): () => void;
  leave(): Promise<void>;
}

/**
 * Live subtitle pipeline for an active call: local speech -> transcription
 * -> translation into the peer's language -> displayed as a subtitle. Reuses
 * TranscriptionProvider (src/services/speech/types.ts) and TranslationProvider
 * (src/services/translation/types.ts) — no separate engine needed.
 */
export type CallSubtitle = {
  participantId: string;
  sourceText: string;
  translatedText: string;
  targetLanguage: string;
  at: string;
};
