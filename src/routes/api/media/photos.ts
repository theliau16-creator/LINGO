import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";
import type { Attachment } from "@/lib/media.server";

function parseAttachments(list: unknown): Attachment[] | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > 6) return null;
  const out: Attachment[] = [];
  for (const raw of list) {
    const item = raw as Attachment;
    if (!item?.path || typeof item.path !== "string") return null;
    out.push(item);
  }
  return out;
}

/**
 * POST /api/media/photos — sends one or several photos already uploaded to
 * Supabase Storage (see mobile/lib/upload-media.ts), with an optional
 * translated caption. Reuses `sendPhotoMessage` (src/lib/media.server.ts)
 * unchanged, same `media_upload` rate limit as the web (src/lib/media.functions.ts).
 */
export const Route = createFileRoute("/api/media/photos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        let body: { conversationId?: unknown; attachments?: unknown; caption?: unknown; language?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
        }

        if (typeof body.conversationId !== "string" || !body.conversationId) {
          return apiError(400, "INVALID_INPUT", "conversationId is required.");
        }
        if (typeof body.language !== "string" || !body.language) {
          return apiError(400, "INVALID_INPUT", "language is required.");
        }
        const attachments = parseAttachments(body.attachments);
        if (!attachments) {
          return apiError(400, "INVALID_INPUT", "attachments must be a non-empty array of at most 6 items.");
        }
        if (body.caption !== undefined && typeof body.caption !== "string") {
          return apiError(400, "INVALID_INPUT", "caption must be a string.");
        }

        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("media_upload", { kind: "user", id: auth.context.userId });

          const { sendPhotoMessage } = await import("@/lib/media.server");
          const result = await sendPhotoMessage(auth.context.supabase, auth.context.userId, {
            conversationId: body.conversationId,
            attachments,
            language: body.language,
            ...(body.caption ? { caption: body.caption } : {}),
          });
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
