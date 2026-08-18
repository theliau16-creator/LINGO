import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyNewMessage = vi.fn();
vi.mock("@/lib/push.server", () => ({ notifyNewMessage }));

const assertQuota = vi.fn();
const consumeQuota = vi.fn();
vi.mock("@/lib/quota.server", () => ({ assertQuota, consumeQuota }));

const { adminRef } = vi.hoisted(() => ({ adminRef: { current: null as unknown } }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminRef.current;
  },
}));

const { translateMessageForParticipants } = await import("@/lib/chat.server");

const MESSAGE_ID = "msg-1";
const CONVERSATION_ID = "conv-1";

const TOP_LEVEL_COLUMNS = "id, conversation_id, source_language";
const SHARED_CONTEXT_COLUMNS = "sender_id, created_at";
const ENSURE_TRANSLATION_COLUMNS = "id, conversation_id, sender_id, original_text, source_language, created_at";

/**
 * Just enough of the real chat/participant tables to drive
 * translateMessageForParticipants through a full attempt at translating one
 * target language — nothing about media/quota success itself, only the
 * ordering guarantee under test: notifyNewMessage fires before, and
 * independently of, whatever happens to the translation.
 */
function fakeSupabase() {
  const from = vi.fn((table: string) => {
    if (table === "messages") {
      return {
        select: (columns: string) => {
          if (columns === TOP_LEVEL_COLUMNS) {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, source_language: "fr" },
                  error: null,
                }),
              }),
            };
          }
          if (columns === SHARED_CONTEXT_COLUMNS) {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: { sender_id: "sender-1", created_at: "2026-01-01T00:00:00.000Z" },
                  error: null,
                }),
              }),
            };
          }
          if (columns === ENSURE_TRANSLATION_COLUMNS) {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: MESSAGE_ID,
                    conversation_id: CONVERSATION_ID,
                    sender_id: "sender-1",
                    original_text: "Salut",
                    source_language: "fr",
                    created_at: "2026-01-01T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            };
          }
          throw new Error(`unexpected messages select: ${columns}`);
        },
      };
    }
    if (table === "message_translations") {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      };
    }
    if (table === "conversation_participants") {
      return {
        select: () => ({
          eq: async () => ({ data: [{ user_id: "sender-1" }, { user_id: "recipient-1" }] }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          in: async () => ({
            data: [
              { id: "sender-1", primary_language: "fr", secondary_language: null },
              { id: "recipient-1", primary_language: "es", secondary_language: null },
            ],
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from };
}

function fakeSupabaseAdmin() {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const from = vi.fn((table: string) => {
    if (table === "guest_users") return { select: () => ({ eq: async () => ({ data: [] }) }) };
    if (table === "messages") return { update };
    throw new Error(`unexpected admin table: ${table}`);
  });
  return { from, update };
}

describe("translateMessageForParticipants — push independence", () => {
  beforeEach(() => {
    notifyNewMessage.mockReset();
    assertQuota.mockReset();
    consumeQuota.mockReset();
  });

  it("still fires notifyNewMessage when every translation attempt fails (quota reached)", async () => {
    adminRef.current = fakeSupabaseAdmin();
    assertQuota.mockRejectedValue(new Error("TRANSLATION_QUOTA_REACHED"));

    const result = await translateMessageForParticipants(fakeSupabase() as never, MESSAGE_ID, "sender-1");

    expect(notifyNewMessage).toHaveBeenCalledTimes(1);
    expect(notifyNewMessage).toHaveBeenCalledWith(MESSAGE_ID);
    expect(result.failed).toBe(1);
    expect(result.translated).toBe(0);
    // The message still stays sent — only translation_status records the failure.
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it("fires notifyNewMessage before any translation-related work begins, not merely by the end", async () => {
    adminRef.current = fakeSupabaseAdmin();
    assertQuota.mockImplementation(async () => {
      // By the time translation actually starts, the push has already gone out.
      expect(notifyNewMessage).toHaveBeenCalledTimes(1);
      throw new Error("provider indisponible");
    });

    await translateMessageForParticipants(fakeSupabase() as never, MESSAGE_ID, "sender-1");
    expect(notifyNewMessage).toHaveBeenCalledTimes(1);
  });
});
