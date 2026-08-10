import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

/**
 * GET /api/quota — free-plan translation counter for the signed-in user.
 * Reuses `getQuotaState` from `src/lib/quota.server.ts` unchanged (same
 * function the web `getTranslationQuota` server function calls).
 */
export const Route = createFileRoute("/api/quota")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        try {
          const { getQuotaState } = await import("@/lib/quota.server");
          const quota = await getQuotaState(auth.context.userId);
          return apiOk(quota);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
