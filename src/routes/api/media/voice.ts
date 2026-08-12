import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

/**
 * POST /api/media/voice — sends a recorded voice message already uploaded to
 * Supabase Storage. Reuses `sendVoiceMessage` (src/lib/media.server.ts)
 * unchanged. Rate-limited under `transcription`, not `media_upload` — same
 * choice as the web (src/lib/media.functions.ts): every voice send is
 * immediately followed by a transcription call, so gating the send itself
 * under the transcription budget is the existing, intentional behaviour,
 * not something introduced here.
 */
export const Route = createFileRoute("/api/media/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        let body: { conversationId?: unknown; path?: unknown; durationMs?: unknown; language?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
        }

        if (typeof body.conversationId !== "string" || !body.conversationId) {
          return apiError(400, "INVALID_INPUT", "conversationId is required.");
        }
        if (typeof body.path !== "string" || !body.path) {
          return apiError(400, "INVALID_INPUT", "path is required.");
        }
        if (typeof body.language !== "string" || !body.language) {
          return apiError(400, "INVALID_INPUT", "language is required.");
        }
        if (typeof body.durationMs !== "number" || !Number.isFinite(body.durationMs) || body.durationMs <= 0) {
          return apiError(400, "INVALID_INPUT", "durationMs must be a positive number.");
        }

        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("transcription", { kind: "user", id: auth.context.userId });

          const { sendVoiceMessage } = await import("@/lib/media.server");
          const result = await sendVoiceMessage(auth.context.supabase, auth.context.userId, {
            conversationId: body.conversationId,
            path: body.path,
            durationMs: body.durationMs,
            language: body.language,
          });
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
