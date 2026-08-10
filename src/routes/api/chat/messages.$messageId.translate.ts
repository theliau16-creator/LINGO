import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

/**
 * POST /api/chat/messages/:messageId/translate — translates a freshly sent
 * message into every participant's language. Reuses
 * `translateMessageForParticipants` (src/lib/chat.server.ts) unchanged, with
 * the same `translation` rate limit the web server function applies.
 */
export const Route = createFileRoute("/api/chat/messages/$messageId/translate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        const messageId = params.messageId;
        if (!messageId) return apiError(400, "INVALID_INPUT", "messageId is required.");

        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("translation", { kind: "user", id: auth.context.userId });

          const { translateMessageForParticipants } = await import("@/lib/chat.server");
          const result = await translateMessageForParticipants(
            auth.context.supabase,
            messageId,
            auth.context.userId,
          );
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error, { notFound: ["Message introuvable."] });
        }
      },
    },
  },
});
