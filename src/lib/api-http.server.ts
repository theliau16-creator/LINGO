import { isRateLimited, rateLimitDelay, isRlsDenied } from "@/lib/backend-errors";

/**
 * Every id-shaped route/body param that reaches a
 * `.eq("id", …)`/`.eq("conversation_id", …)` query against a UUID column
 * must be checked with this BEFORE the query — otherwise Postgres/PostgREST
 * rejects it with a generic type-cast error that `mapBusinessError` cannot
 * distinguish from a real 500, and a malformed id leaks as a 500 instead of
 * a clean 400.
 */
export { isUuid } from "@/lib/uuid";

/**
 * JSON response helpers for the mobile HTTP API (`src/routes/api/**`).
 * Machine-readable {code, message} — no French UI prose here, that stays in
 * `backend-errors.ts` for the web app. A mobile client branches on `code`.
 */
export function apiOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

/**
 * Maps an error thrown by reused, unmodified `*.server.ts` business logic to
 * an HTTP response. Reuses the same classifiers the web UI already relies on
 * (`src/lib/backend-errors.ts`) instead of re-deriving rate-limit/RLS
 * detection from scratch.
 *
 * `notFound` lists the exact business-logic messages (e.g. "Message
 * introuvable.") that mean "this resource does not exist or you cannot
 * access it" for the given endpoint — deliberately not distinguished from a
 * genuine 404, so a non-participant cannot probe for a conversation's
 * existence.
 */
export function mapBusinessError(error: unknown, options?: { notFound?: string[] }): Response {
  const message = error instanceof Error ? error.message : String(error);

  if (options?.notFound?.includes(message)) {
    return apiError(404, "NOT_FOUND", message);
  }
  if (isRateLimited(error)) {
    return apiError(429, "RATE_LIMITED", "Too many requests.", { retryAfter: rateLimitDelay(error) });
  }
  if (message === "TRANSLATION_QUOTA_REACHED") {
    return apiError(403, "QUOTA_REACHED", "Free translation quota exhausted.");
  }
  if (message === "PREMIUM_REQUIRED") {
    return apiError(403, "PREMIUM_REQUIRED", "This feature requires Lingo Premium.");
  }
  if (isRlsDenied(error)) {
    return apiError(403, "FORBIDDEN", "You do not have access to this resource.");
  }

  console.error("[API_ERROR]", message);
  return apiError(500, "INTERNAL_ERROR", "Unexpected server error.");
}
