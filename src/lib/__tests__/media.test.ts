import { describe, expect, it, vi } from "vitest";
import {
  assertAudioPlayable,
  assertImageObject,
  audioFileName,
  isPathInConversation,
  MAX_AUDIO_BYTES,
  sniffAudioContainer,
} from "../media-validation";
import { isGcCandidate, ORPHAN_GRACE_MS, referencedPaths } from "../media-gc.server";
import { sendVoiceMessage } from "../media.server";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
const ascii = (text: string, offset = 0) => {
  const out = new Uint8Array(16);
  for (let i = 0; i < text.length; i += 1) out[offset + i] = text.charCodeAt(i);
  return out;
};

describe("sniffAudioContainer", () => {
  it("detects webm from the EBML header", () => {
    expect(sniffAudioContainer(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("webm");
  });

  it("detects the iOS/Safari mp4 container from the ftyp box", () => {
    expect(sniffAudioContainer(ascii("ftyp", 4))).toBe("mp4");
  });

  it("detects ogg, wav and mp3", () => {
    expect(sniffAudioContainer(ascii("OggS"))).toBe("ogg");
    const wav = ascii("RIFF");
    wav.set(ascii("WAVE").slice(0, 4), 8);
    expect(sniffAudioContainer(wav)).toBe("wav");
    expect(sniffAudioContainer(ascii("ID3"))).toBe("mp3");
    expect(sniffAudioContainer(bytes(0xff, 0xe0))).toBe("mp3");
  });

  it("returns null on unknown or truncated data", () => {
    expect(sniffAudioContainer(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sniffAudioContainer(new Uint8Array(16))).toBeNull();
  });
});

describe("audioFileName", () => {
  it("lets the sniffed container win over a lying path (Safari mp4 as .webm)", () => {
    expect(audioFileName("u/1.webm", "audio/webm", "mp4")).toBe("recording.mp4");
  });

  it("falls back to the MIME type, then the path, then mp4", () => {
    expect(audioFileName("u/1.bin", "audio/ogg", null)).toBe("recording.ogg");
    expect(audioFileName("u/1.wav", "", null)).toBe("recording.wav");
    expect(audioFileName("u/1.bin", "", null)).toBe("recording.mp4");
  });
});

describe("assertAudioPlayable", () => {
  it("accepts a normal recording", () => {
    expect(() => assertAudioPlayable(50_000, "mp4")).not.toThrow();
  });

  it("refuses empty, oversized and unknown recordings before any paid call", () => {
    expect(() => assertAudioPlayable(10, "mp4")).toThrow(/vide/);
    expect(() => assertAudioPlayable(MAX_AUDIO_BYTES + 1, "mp4")).toThrow(/trop long/);
    expect(() => assertAudioPlayable(50_000, null)).toThrow(/non pris en charge/);
  });
});

describe("assertImageObject", () => {
  it("accepts common photo formats", () => {
    expect(() => assertImageObject({ size: 1000, mimetype: "image/jpeg" })).not.toThrow();
    expect(() => assertImageObject({ size: 1000, mimetype: "image/heic" })).not.toThrow();
  });

  it("refuses empty files, oversized files and non-images", () => {
    expect(() => assertImageObject({ size: 0, mimetype: "image/png" })).toThrow();
    expect(() => assertImageObject({ size: 99_000_000, mimetype: "image/png" })).toThrow(/volumineuse/);
    expect(() => assertImageObject({ size: 100, mimetype: "application/pdf" })).toThrow(/Format/);
  });
});

describe("isPathInConversation", () => {
  // Canonical convention for the chat-media bucket: paths are keyed by
  // conversationId, matching the live storage RLS policies
  // (chat_media_insert/chat_media_select, both gated on
  // is_participant(conversationId, auth.uid())) and what every uploader,
  // web (media-composer.tsx) and mobile (upload-media.ts), actually writes.
  // Regression coverage for the Phase 7 bug: this function used to check a
  // `${userId}/...` prefix, which never matched, so every photo send failed
  // with "Fichier non autorisé." — these cases pin the correct contract.
  it("only accepts paths inside the message's own conversation folder", () => {
    expect(isPathInConversation("conv-1/a.jpg", "conv-1")).toBe(true);
    expect(isPathInConversation("conv-2/a.jpg", "conv-1")).toBe(false);
  });

  it("refuses a file uploaded to a different (even shared) conversation", () => {
    // Closes a real gap, not just a path-format check: a participant of both
    // conv-1 and conv-2 must not be able to attach, to a message in conv-1,
    // a file that actually lives in conv-2's folder.
    expect(isPathInConversation("conv-2/shared-with-both.jpg", "conv-1")).toBe(false);
  });

  it("refuses path traversal and absolute paths", () => {
    expect(isPathInConversation("../conv-2/a.jpg", "conv-1")).toBe(false);
    expect(isPathInConversation("/conv-1/a.jpg", "conv-1")).toBe(false);
  });

  it("never accepts a userId-prefixed path — the convention this bug regressed from", () => {
    expect(isPathInConversation("user-1/a.jpg", "conv-1")).toBe(false);
  });
});

/** Minimal chainable fake of the Supabase client shape sendVoiceMessage uses. */
function fakeSupabaseClient() {
  const insertMessage = vi.fn().mockReturnValue({
    select: () => ({ maybeSingle: async () => ({ data: { id: "msg-1" }, error: null }) }),
  });
  const insertVoiceRow = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table === "messages") return { insert: insertMessage };
    if (table === "voice_messages") return { insert: insertVoiceRow };
    throw new Error(`unexpected table: ${table}`);
  });
  return { from, insertMessage, insertVoiceRow } as unknown as Parameters<typeof sendVoiceMessage>[0] & {
    from: typeof from;
    insertMessage: typeof insertMessage;
    insertVoiceRow: typeof insertVoiceRow;
  };
}

describe("sendVoiceMessage — path validation", () => {
  // Regression coverage for the asymmetry found right after the photo fix:
  // sendPhotoMessage validated its attachment path with isPathInConversation,
  // sendVoiceMessage did not validate its path at all. Same bucket, same RLS
  // (chat_media_insert/chat_media_select are not type-specific), same upload
  // convention (web's objectPath() and mobile's uploadMediaFile() already
  // write voice recordings under conversationId/... exactly like photos) —
  // so this closes the gap with the same primitive, not a new one.
  it("rejects a path uploaded into a different conversation, before any DB write", async () => {
    const client = fakeSupabaseClient();
    await expect(
      sendVoiceMessage(client, "user-1", {
        conversationId: "conv-1",
        path: "conv-2/recording.m4a",
        durationMs: 2000,
        language: "fr",
      }),
    ).rejects.toThrow("Fichier non autorisé.");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects path traversal and absolute paths the same way", async () => {
    const client = fakeSupabaseClient();
    await expect(
      sendVoiceMessage(client, "user-1", {
        conversationId: "conv-1",
        path: "../conv-2/recording.m4a",
        durationMs: 2000,
        language: "fr",
      }),
    ).rejects.toThrow("Fichier non autorisé.");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("proceeds to insert the message when the path matches the conversation", async () => {
    const client = fakeSupabaseClient();
    const result = await sendVoiceMessage(client, "user-1", {
      conversationId: "conv-1",
      path: "conv-1/recording.m4a",
      durationMs: 2000,
      language: "fr",
    });
    expect(result.id).toBe("msg-1");
    expect(client.insertMessage).toHaveBeenCalledTimes(1);
    expect(client.insertVoiceRow).toHaveBeenCalledTimes(1);
  });
});

describe("orphan media GC", () => {
  it("never considers a recent upload (a send may still be in flight)", () => {
    const now = Date.now();
    expect(isGcCandidate(new Date(now - 1000).toISOString(), now)).toBe(false);
    expect(isGcCandidate(new Date(now - ORPHAN_GRACE_MS - 1000).toISOString(), now)).toBe(true);
    expect(isGcCandidate(null, now)).toBe(false);
  });

  it("collects every referenced path, attachments and voice rows alike", () => {
    const paths = referencedPaths(
      [{ attachments: [{ path: "u/1.jpg" }, { path: "u/2.jpg" }] }, { attachments: [] }],
      [{ audio_path: "u/3.webm" }],
    );
    expect([...paths].sort()).toEqual(["u/1.jpg", "u/2.jpg", "u/3.webm"]);
  });

  it("ignores malformed attachment payloads instead of crashing", () => {
    expect(referencedPaths([{ attachments: null }, { attachments: [{ nope: 1 }] }]).size).toBe(0);
  });
});
