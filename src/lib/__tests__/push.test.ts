import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminRef, fetchMock } = vi.hoisted(() => ({
  adminRef: { current: null as unknown },
  fetchMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminRef.current;
  },
}));

vi.stubGlobal("fetch", fetchMock);

const { notifyNewMessage } = await import("@/lib/push.server");

type ClaimedMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  original_text: string;
  message_type: string;
};

function fakeSupabaseAdmin(options: {
  claimedMessage: ClaimedMessage | null;
  participants?: { user_id: string }[];
  tokens?: { id: string; token: string }[];
}) {
  const participants = options.participants ?? [];
  const tokens = options.tokens ?? [];
  const deleteIn = vi.fn().mockResolvedValue({ error: null });
  const deleteTokens = vi.fn().mockReturnValue({ in: deleteIn });

  const from = vi.fn((table: string) => {
    if (table === "messages") {
      return {
        update: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: options.claimedMessage, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "conversation_participants") {
      return { select: () => ({ eq: async () => ({ data: participants, error: null }) }) };
    }
    if (table === "device_tokens") {
      return {
        select: () => ({ in: async () => ({ data: tokens, error: null }) }),
        delete: deleteTokens,
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, deleteTokens, deleteIn };
}

function expoResponse(tickets: unknown[]) {
  return { ok: true, json: async () => ({ data: tickets }) };
}

const MESSAGE: ClaimedMessage = {
  id: "msg-1",
  conversation_id: "conv-1",
  sender_id: "sender-1",
  original_text: "Salut !",
  message_type: "text",
};

describe("notifyNewMessage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("does nothing when the message was already notified (claim returns no row — a translation retry)", async () => {
    adminRef.current = fakeSupabaseAdmin({ claimedMessage: null });
    await notifyNewMessage("msg-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never notifies the sender, even if they are also listed as a participant", async () => {
    const admin = fakeSupabaseAdmin({
      claimedMessage: MESSAGE,
      participants: [{ user_id: "sender-1" }, { user_id: "recipient-1" }],
      tokens: [{ id: "tok-1", token: "ExponentPushToken[recipient]" }],
    });
    adminRef.current = admin;
    fetchMock.mockResolvedValue(expoResponse([{ status: "ok", id: "receipt-1" }]));

    await notifyNewMessage("msg-1");

    expect(admin.from).toHaveBeenCalledWith("device_tokens");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toEqual([
      {
        to: "ExponentPushToken[recipient]",
        title: "Nouveau message",
        body: "Salut !",
        data: { conversationId: "conv-1" },
        sound: "default",
      },
    ]);
  });

  it("does nothing (no fetch) when there is no other participant", async () => {
    const admin = fakeSupabaseAdmin({
      claimedMessage: MESSAGE,
      participants: [{ user_id: "sender-1" }],
    });
    adminRef.current = admin;

    await notifyNewMessage("msg-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing (no fetch) when no recipient has a registered device token", async () => {
    const admin = fakeSupabaseAdmin({
      claimedMessage: MESSAGE,
      participants: [{ user_id: "sender-1" }, { user_id: "recipient-1" }],
      tokens: [],
    });
    adminRef.current = admin;

    await notifyNewMessage("msg-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a generic preview for photo and voice messages instead of leaking media metadata", async () => {
    const admin = fakeSupabaseAdmin({
      claimedMessage: { ...MESSAGE, message_type: "photo" },
      participants: [{ user_id: "sender-1" }, { user_id: "recipient-1" }],
      tokens: [{ id: "tok-1", token: "ExponentPushToken[recipient]" }],
    });
    adminRef.current = admin;
    fetchMock.mockResolvedValue(expoResponse([{ status: "ok", id: "receipt-1" }]));

    await notifyNewMessage("msg-1");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body[0].body).toBe("📷 Photo");
  });

  it("prunes a device token Expo's send response (ticket) already reports as DeviceNotRegistered", async () => {
    const admin = fakeSupabaseAdmin({
      claimedMessage: MESSAGE,
      participants: [{ user_id: "sender-1" }, { user_id: "recipient-1" }],
      tokens: [{ id: "tok-dead", token: "ExponentPushToken[dead]" }],
    });
    adminRef.current = admin;
    fetchMock.mockResolvedValue(
      expoResponse([{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }]),
    );

    await notifyNewMessage("msg-1");

    expect(admin.deleteTokens).toHaveBeenCalledTimes(1);
    expect(admin.deleteIn).toHaveBeenCalledWith("id", ["tok-dead"]);
  });

  it("never throws even if the database call itself fails", async () => {
    adminRef.current = { from: vi.fn(() => { throw new Error("db down"); }) };
    await expect(notifyNewMessage("msg-1")).resolves.toBeUndefined();
  });
});
