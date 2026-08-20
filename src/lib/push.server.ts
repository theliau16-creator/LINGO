import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo's own per-request limit — https://docs.expo.dev/push-notifications/sending-notifications/
const CHUNK_SIZE = 100;
const PREVIEW_MAX_LENGTH = 120;

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/**
 * Sends a batch of Expo push messages.
 *
 * Partial, ticket-level pruning only: Expo's send response ("ticket") can
 * report DeviceNotRegistered immediately for a token it already knows is
 * dead, and that case is pruned below. The common real-world case — APNs
 * telling Expo the app was uninstalled — is only ever reported through a
 * SEPARATE "receipt" (fetched via POST /v2/push/getReceipts using each
 * ticket's id, recommended ~15 min after sending, cleared after 24h). That
 * receipt fetch is NOT implemented here — remaining work, not a hidden
 * guarantee: a token can keep being sent to (and failing silently) until
 * receipts are wired up.
 *
 * No secret is required for basic sending; EXPO_ACCESS_TOKEN (server-only
 * env, never bundled into the Expo client) is attached when configured, per
 * Expo's guidance for higher request limits and enhanced security.
 */
async function sendExpoPush(messages: ExpoPushMessage[], tokenIds: string[], supabaseAdmin: Client) {
  const accessToken = process.env["EXPO_ACCESS_TOKEN"];
  const staleIds: string[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    const chunkIds = tokenIds.slice(i, i + CHUNK_SIZE);

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) continue;

    const payload = (await response.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null;
    (payload?.data ?? []).forEach((ticket, index) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        const id = chunkIds[index];
        if (id) staleIds.push(id);
      }
    });
  }

  if (staleIds.length > 0) {
    await supabaseAdmin.from("device_tokens").delete().in("id", staleIds);
  }
}

/**
 * Notifies every OTHER participant of a conversation that a new message
 * arrived — Expo Push (which relays to APNs), used only to wake/alert the
 * app when it isn't open to receive the same event over Realtime.
 *
 * messages.push_notified_at is an APPLICATION-LEVEL dedup claim, not a
 * delivery guarantee: it stops THIS function from re-entering its own send
 * path for the same messageId (e.g. a translation retry, or
 * recoverStalledTranslations picking the same message back up), so at most
 * one attempt is made — it does not confirm the push was actually
 * delivered, only that we did not try to send it twice. Called
 * unconditionally at the top of translateMessageForParticipants, before any
 * translation work, so it is independent of translation success/failure —
 * see chat.test.ts's "push independence" tests. Never throws: a push
 * failure must not affect message delivery or translation.
 */
export async function notifyNewMessage(messageId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: message } = await supabaseAdmin
      .from("messages")
      .update({ push_notified_at: new Date().toISOString() })
      .eq("id", messageId)
      .is("push_notified_at", null)
      .select("id, conversation_id, sender_id, original_text, message_type")
      .maybeSingle();
    if (!message) return; // already notified, or the message is gone

    const { data: participants } = await supabaseAdmin
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", message.conversation_id);

    const recipientIds = (participants ?? [])
      .map((row) => row.user_id)
      .filter((id) => id !== message.sender_id);
    if (recipientIds.length === 0) return;

    const { data: tokens } = await supabaseAdmin
      .from("device_tokens")
      .select("id, token")
      .in("user_id", recipientIds);
    if (!tokens || tokens.length === 0) return;

    const preview =
      message.message_type === "photo"
        ? "📷 Photo"
        : message.message_type === "voice"
          ? "🎤 Message vocal"
          : message.original_text.length > PREVIEW_MAX_LENGTH
            ? `${message.original_text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
            : message.original_text;

    const expoMessages: ExpoPushMessage[] = tokens.map((row) => ({
      to: row.token,
      title: "Nouveau message",
      body: preview,
      data: { conversationId: message.conversation_id },
      sound: "default",
    }));

    await sendExpoPush(
      expoMessages,
      tokens.map((row) => row.id),
      supabaseAdmin,
    );
  } catch {
    // Best-effort — see docstring.
  }
}
