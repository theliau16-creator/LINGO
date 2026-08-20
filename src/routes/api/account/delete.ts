import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

/**
 * POST /api/account/delete — permanently deletes the signed-in account.
 * Reuses `deleteAccount` (src/lib/account.server.ts) unchanged: it calls
 * `supabaseAdmin.auth.admin.deleteUser`, a service-role-only operation that
 * cannot exist client-side under any circumstances — the one genuinely
 * server-required piece of the whole Profile/Settings phase.
 *
 * The "SUPPRIMER" confirmation check mirrors the one-line inputValidator in
 * `deleteMyAccount` (src/lib/account.functions.ts) so a wrong confirmation
 * is a clean 400 before the irreversible call, same as the web.
 */
export const Route = createFileRoute("/api/account/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        let body: { confirmation?: unknown };
        try {
          body = (await request.json()) as { confirmation?: unknown };
        } catch {
          return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
        }

        if (body.confirmation !== "SUPPRIMER") {
          return apiError(400, "INVALID_INPUT", 'confirmation must be exactly "SUPPRIMER".');
        }

        try {
          const { deleteAccount } = await import("@/lib/account.server");
          const result = await deleteAccount(auth.context.supabase, auth.context.userId);
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
