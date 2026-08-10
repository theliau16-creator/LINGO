/**
 * Feature flags — a single place to switch experimental surfaces on or off.
 * Anything listed here is shipped but inert until the flag is flipped.
 */
export const FEATURE_FLAGS = {
  /** Live translated audio/video calls. Not implemented yet — kept off. */
  live_voice_translation_enabled: false,
  /** Voice messages: recording, transcription and translated transcript. */
  voice_messages_enabled: true,
  /** Photo attachments in conversations. */
  photo_messages_enabled: true,
  /** Public invitation links / QR opening a guest web chat. */
  guest_invites_enabled: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
