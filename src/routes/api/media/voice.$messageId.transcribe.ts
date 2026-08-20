import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError, isUuid } from "@/lib/api-http.server";

/**
 * POST /api/media/voice/:messageId/transcribe — runs (or retries) the
 * transcription of a voice message. Reuses `transcribeVoiceMessage`
 * (src/lib/media.server.ts) unchanged — the whole pipeline (download from
 * Storage, call the transcription model with the server-only API key,
 * translate, update rows) stays server-side, nothing duplicated here.
 *
 * Same participant check as `retryTranscription` (src/lib/media.functions.ts)
 * before the rate-limited call: a SELECT through the caller's RLS-scoped
 * client, which `voice_select_participants` only allows for participants.
 */
export const Route = createFileRoute("/api/media/voice/$messageId/transcribe")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        const messageId = params.messageId;
        if (!isUuid(messageId)) return apiError(400, "INVALID_INPUT", "messageId must be a valid UUID.");

        try {
          const { data: visible } = await auth.context.supabase
            .from("voice_messages")
            .select("id")
            .eq("message_id", messageId)
            .maybeSingle();
          if (!visible) return apiError(404, "NOT_FOUND", "Message vocal introuvable.");

          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("transcription", { kind: "user", id: auth.context.userId });

          const { transcribeVoiceMessage } = await import("@/lib/media.server");
          const result = await transcribeVoiceMessage(messageId);
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error, { notFound: ["Message vocal introuvable."] });
        }
      },
    },
  },
});
