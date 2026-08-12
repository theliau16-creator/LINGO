import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

export const MEDIA_BUCKET = "chat-media";

/** Same shape as the web's Attachment type (src/lib/media.server.ts). */
export type Attachment = {
  path: string;
  type: "image" | "audio";
  name?: string;
  size?: number;
  duration_ms?: number;
  width?: number;
  height?: number;
};

/**
 * Uploads a local file (from expo-image-picker or expo-audio) straight to
 * Supabase Storage — same direct-client upload the web already does
 * (src/components/media-composer.tsx), no endpoint needed: the storage RLS
 * policies (chat_media_insert, supabase/migrations/20260810173002_*.sql)
 * are the real gate, exactly as for the web.
 *
 * Path convention: `${conversationId}/${uuid}.${extension}`, matching both
 * the storage RLS policy (keyed on the conversation, via `is_participant`)
 * and media-composer.tsx's own `objectPath()` — kept identical on purpose.
 * NOTE (found during audit, not fixed here — no mobile-specific need to
 * touch server business logic): `sendPhotoMessage` (src/lib/media.server.ts)
 * separately validates the path with `isOwnedStoragePath`, which expects a
 * `${userId}/...` prefix instead. That check will reject a path uploaded
 * under this convention. This mismatch pre-exists on web too (media-composer.tsx
 * already uploads to `${conversationId}/...`) — it is not something this
 * phase introduces, and fixing it means editing shared server logic beyond
 * what mobile support requires. Flagged in the Phase 7 report.
 */
function randomId(): string {
  // Matches the id shape already used for optimistic message ids in
  // use-conversation-messages.ts — crypto.randomUUID() is not reliably
  // available on the Hermes runtime across RN versions.
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export async function uploadMediaFile(
  localUri: string,
  conversationId: string,
  extension: string,
  contentType: string,
): Promise<string> {
  const path = `${conversationId}/${randomId()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" });
  const arrayBuffer = decode(base64);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, arrayBuffer, { contentType });
  if (error) throw error;
  return path;
}
