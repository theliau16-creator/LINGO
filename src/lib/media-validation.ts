/**
 * Pure media validation helpers.
 *
 * Kept free of Supabase/network imports so they can be unit-tested and reused
 * from both the client (fast feedback) and the server (the real gate).
 */

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MIN_AUDIO_BYTES = 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_MESSAGE = 6;

export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_AUDIO_MIME = [
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
] as const;

/** Container extension per MIME subtype, used to name the upload. */
export const AUDIO_EXTENSIONS: Record<string, string> = {
  webm: "webm",
  mp4: "mp4",
  m4a: "m4a",
  "x-m4a": "m4a",
  mp3: "mp3",
  mpeg: "mp3",
  wav: "wav",
  "x-wav": "wav",
  ogg: "ogg",
  oga: "ogg",
};

/**
 * Reads the real container from the first bytes of the file.
 * Safari/iOS records `audio/mp4` but older clients uploaded those bytes under a
 * `.webm` path: trusting the path made the speech-to-text endpoint answer 400.
 * The bytes never lie, so they win over the MIME type and over the path.
 */
export function sniffAudioContainer(head: Uint8Array): string | null {
  if (head.length < 12) return null;
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (ascii(4, 8) === "ftyp") return "mp4";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 3) === "ID3") return "mp3";
  if (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0) return "mp3";
  return null;
}

/** Filename sent to the speech-to-text endpoint. Sniffed bytes win. */
export function audioFileName(path: string, mimeType: string, sniffed: string | null): string {
  const fromPath = path.split(".").pop()?.toLowerCase() ?? "";
  const fromMime = mimeType.split(";")[0]?.split("/")[1]?.toLowerCase() ?? "";
  const extension = sniffed ?? AUDIO_EXTENSIONS[fromMime] ?? AUDIO_EXTENSIONS[fromPath] ?? "mp4";
  return `recording.${extension}`;
}

/** Guard run before the (paid) transcription call. Throws a French message. */
export function assertAudioPlayable(size: number, sniffed: string | null): void {
  if (size > MAX_AUDIO_BYTES) throw new Error("Message vocal trop long.");
  if (size < MIN_AUDIO_BYTES) throw new Error("Enregistrement vide. Réessayez.");
  if (!sniffed) throw new Error("Format audio non pris en charge.");
}

export type StoredObject = { size?: number | null; mimetype?: string | null };

/** Guard run on the stored object before any expensive processing. */
export function assertImageObject(object: StoredObject): void {
  const size = object.size ?? 0;
  if (size <= 0) throw new Error("Fichier introuvable ou vide.");
  if (size > MAX_IMAGE_BYTES) throw new Error("Photo trop volumineuse (10 Mo maximum).");
  const mime = (object.mimetype ?? "").split(";")[0]?.toLowerCase() ?? "";
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
    throw new Error("Format d'image non pris en charge.");
  }
}

/**
 * Storage paths must stay inside the folder of the conversation the message
 * is being sent to — the canonical convention for the `chat-media` bucket
 * (supabase/migrations/20260810173002_*.sql: `chat_media_insert`/`chat_media_select`
 * both gate on `is_participant(conversationId, auth.uid())`, not on a per-user
 * folder). Media is read by every participant of a conversation, not just its
 * uploader, so the bucket cannot be keyed by userId without a materially more
 * complex read policy — the RLS policies already in production settled this.
 *
 * Checking against the specific conversationId of the message being created
 * (not just "some conversation the caller is in") also closes a real gap: it
 * stops a participant from attaching, to a message in conversation A, a file
 * that was actually uploaded into a *different* shared conversation B they
 * also happen to be a member of.
 *
 * Previously named `isOwnedStoragePath` and checked a `${userId}/...` prefix
 * — that never matched the live RLS convention or what any uploader (web or
 * mobile) actually writes, so every photo send failed with "Fichier non
 * autorisé." Fixed here instead of drifting further; see media.server.ts.
 */
export function isPathInConversation(path: string, conversationId: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/")) return false;
  return path.startsWith(`${conversationId}/`);
}
