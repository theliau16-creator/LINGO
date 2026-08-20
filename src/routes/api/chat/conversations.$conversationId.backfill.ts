import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError, isUuid } from "@/lib/api-http.server";

/**
 * POST /api/chat/conversations/:conversationId/backfill — translates the
 * recent history of a conversation into the caller's language, for previews
 * that predate a language change. Reuses `backfillConversationTranslations`
 * (src/lib/chat.server.ts) unchanged — same as the web's `backfillConversation`
 * server function (src/lib/chat.functions.ts), which applies no rate limit of
 * its own either (quota is still enforced per translation inside
 * `ensureTranslation`).
 */
export const Route = createFileRoute("/api/chat/conversations/$conversationId/backfill")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        const conversationId = params.conversationId;
        if (!isUuid(conversationId)) {
          return apiError(400, "INVALID_INPUT", "conversationId must be a valid UUID.");
        }

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
          const { backfillConversationTranslations } = await import("@/lib/chat.server");
          const result = await backfillConversationTranslations(
            auth.context.supabase,
            conversationId,
            language,
            auth.context.userId,
          );
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
