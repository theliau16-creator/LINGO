import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

/**
 * POST /api/device-link/token — issues a short-lived (2 min) single-use token
 * the signed-in device renders as a QR, so another device can sign in by
 * scanning it. Reuses `createDeviceLinkToken` (src/lib/device-link.server.ts)
 * unchanged.
 */
export const Route = createFileRoute("/api/device-link/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        try {
          const { createDeviceLinkToken } = await import("@/lib/device-link.server");
          const result = await createDeviceLinkToken(auth.context.supabase, auth.context.userId);
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
