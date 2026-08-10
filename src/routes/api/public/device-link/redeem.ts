import { createFileRoute } from "@tanstack/react-router";
import { apiOk, apiError, mapBusinessError } from "@/lib/api-http.server";

const QR_ERRORS = ["QR code invalide.", "Ce QR code a déjà été utilisé.", "QR code expiré."];

/**
 * POST /api/public/device-link/redeem — exchanges a scanned QR token for a
 * one-time sign-in hash. Public by design: the scanning device has no session
 * yet (same as the existing `redeemDeviceLinkToken` server function, which is
 * also unauthenticated). Reuses `consumeDeviceLinkToken`
 * (src/lib/device-link.server.ts) unchanged — the token is single-use, hashed
 * at rest and expires after 2 minutes.
 */
export const Route = createFileRoute("/api/public/device-link/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { token?: unknown };
        try {
          body = (await request.json()) as { token?: unknown };
        } catch {
          return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
        }

        const token = body.token;
        if (typeof token !== "string" || token.length < 16) {
          return apiError(400, "INVALID_INPUT", "A valid token is required.");
        }

        try {
          const { consumeDeviceLinkToken } = await import("@/lib/device-link.server");
          const result = await consumeDeviceLinkToken(token);
          return apiOk(result);
        } catch (error) {
          // An invalid, used or expired QR is a client-side condition (404),
          // never a server fault — and all three stay indistinguishable in
          // wording so a scanner cannot probe which tokens exist.
          return mapBusinessError(error, { notFound: QR_ERRORS });
        }
      },
    },
  },
});
