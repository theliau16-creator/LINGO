import type { AudioClip, TranscriptionProvider, TranscriptionResult } from "./types";

/**
 * LocalDevelopmentProvider — always reports `isConfigured: false`.
 *
 * A real transcription provider (e.g. an external speech-to-text API) needs
 * network access and a server-side API key, so it cannot run in an offline
 * local dev environment. This stub exists only so the rest of the app can
 * depend on `TranscriptionProvider` without a null check, and so that a real
 * provider can be registered later (same pattern as
 * src/services/translation/registry.server.ts) without touching call sites.
 */
export function createLocalDevelopmentTranscriptionProvider(): TranscriptionProvider {
  return {
    id: "local-dev",
    isConfigured: false,
    async transcribe(_clip: AudioClip): Promise<TranscriptionResult> {
      throw new Error(
        "Aucun provider de transcription configuré. Fonctionnalité vocale non disponible en développement local.",
      );
    },
  };
}
