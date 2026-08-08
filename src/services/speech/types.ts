/**
 * SpeechService / TranscriptionService — provider-agnostic contracts for a
 * future voice-message feature.
 *
 * STATUS: architecture only. Nothing in this file is wired to any UI —
 * there is no voice-message recorder, no playback, no call to these types
 * from a route or component. It exists so that voice messages can be added
 * later without redesigning the translation pipeline (a transcribed voice
 * message would flow through the same TranslationProvider as text).
 */

export type AudioEncoding = "webm-opus" | "wav" | "mp3";

export type AudioClip = {
  /** Raw audio bytes captured client-side. */
  data: Blob;
  encoding: AudioEncoding;
  durationMs: number;
};

export type TranscriptionResult = {
  text: string;
  /** ISO-639-1 code the transcript is believed to be written in. */
  language: string;
  /** 0..1 confidence score, when the provider exposes one. */
  confidence?: number;
};

export interface TranscriptionProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  transcribe(clip: AudioClip): Promise<TranscriptionResult>;
}

export interface SpeechRecorder {
  readonly isSupported: boolean;
  start(): Promise<void>;
  stop(): Promise<AudioClip>;
  cancel(): void;
}
