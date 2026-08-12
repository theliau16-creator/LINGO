import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

/**
 * GET /api/account/export — RGPD export of everything Lingo stores about the
 * signed-in account, as JSON. Reuses `exportAccountData`
 * (src/lib/account-export.server.ts) unchanged: it only ever queries through
 * the caller's own RLS-scoped client, so it *could* be re-expressed as 8
 * direct Supabase reads from the mobile client — deliberately not done here.
 * Keeping the export's exact shape centralised in one server function means
 * a schema/PII change updates one place, not two divergent client copies.
 */
export const Route = createFileRoute("/api/account/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        try {
          const { exportAccountData } = await import("@/lib/account-export.server");
          const result = await exportAccountData(auth.context.supabase, auth.context.userId);
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
