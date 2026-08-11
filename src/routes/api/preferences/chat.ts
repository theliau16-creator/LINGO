import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest } from "@/lib/api-auth.server";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";
import {
  savePreferencesForUser,
  validatePreferencesInput,
  PreferencesValidationError,
  type PreferencesInput,
} from "@/lib/preferences.server";

/**
 * POST /api/preferences/chat — saves chat personalisation (background,
 * bubble colors, theme). Reuses `savePreferencesForUser`/
 * `validatePreferencesInput` from `src/lib/preferences.server.ts` — the same
 * logic the web `savePreferences` server function calls, premium gate
 * included (403 for a free account, enforced server-side either way).
 */
export const Route = createFileRoute("/api/preferences/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

        let body: PreferencesInput;
        try {
          body = (await request.json()) as PreferencesInput;
        } catch {
          return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
        }

        let validated: PreferencesInput;
        try {
          validated = validatePreferencesInput(body);
        } catch (error) {
          if (error instanceof PreferencesValidationError) {
            return apiError(400, "INVALID_INPUT", error.message);
          }
          throw error;
        }

        try {
          const result = await savePreferencesForUser(auth.context.userId, validated);
          return apiOk(result);
        } catch (error) {
          return mapBusinessError(error);
        }
      },
    },
  },
});
