import { describe, expect, it } from "vitest";
import {
  assertAudioPlayable,
  assertImageObject,
  audioFileName,
  isOwnedStoragePath,
  MAX_AUDIO_BYTES,
  sniffAudioContainer,
} from "../media-validation";
import { isGcCandidate, ORPHAN_GRACE_MS, referencedPaths } from "../media-gc.server";

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

describe("isOwnedStoragePath", () => {
  it("only accepts paths inside the caller's own folder", () => {
    expect(isOwnedStoragePath("user-1/a.jpg", "user-1")).toBe(true);
    expect(isOwnedStoragePath("user-2/a.jpg", "user-1")).toBe(false);
    expect(isOwnedStoragePath("../user-2/a.jpg", "user-1")).toBe(false);
    expect(isOwnedStoragePath("/user-1/a.jpg", "user-1")).toBe(false);
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
