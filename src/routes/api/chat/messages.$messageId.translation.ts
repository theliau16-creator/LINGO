import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError, isUuid } from "@/lib/api-http.server";

/**
 * POST /api/chat/messages/:messageId/translation — returns the translation of
 * one message in the requested language, creating it only when missing.
 * Reuses `ensureTranslation` (src/lib/chat.server.ts) unchanged: cache-first,
 * quota debited only on a real translation, same `translation` rate limit.
 */
export const Route = createFileRoute("/api/chat/messages/$messageId/translation")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        const messageId = params.messageId;
        if (!isUuid(messageId)) return apiError(400, "INVALID_INPUT", "messageId must be a valid UUID.");

        let body: { language?: unknown };
        try {
          body = (await request.json()) as { language?: unknown };
        } catch {
          return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
        }

        const language = body.language;
        if (typeof language !== "string" || !language.trim()) {
          return apiError(400, "INVALID_INPUT", "language is required.");
        }

        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("translation", { kind: "user", id: auth.context.userId });

          const { ensureTranslation } = await import("@/lib/chat.server");
          const result = await ensureTranslation(auth.context.supabase, messageId, language, {
            quotaUserId: auth.context.userId,
          });
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error, { notFound: ["Message introuvable."] });
        }
      },
    },
  },
});
