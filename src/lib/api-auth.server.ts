import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ApiAuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
};

export type ApiAuthResult =
  | { ok: true; context: ApiAuthContext }
  | { ok: false; status: 401 | 500; code: string; message: string };

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * Same header-safety fetch wrapper as the generated `auth-middleware.ts`
 * (not exported from there, so mirrored here): new-style Supabase keys are
 * opaque strings, not bearer JWTs, so a stray `Authorization: Bearer <key>`
 * auto-set by the SDK must not shadow the real user token.
 */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * HTTP-route equivalent of `requireSupabaseAuth`
 * (src/integrations/supabase/auth-middleware.ts — auto-generated, not
 * reusable outside the server-function RPC/middleware chain it was built
 * for). Same validation steps — Bearer header, JWT shape, `getClaims()` —
 * but takes the `Request` explicitly and returns a result instead of
 * throwing, so a plain HTTP route handler can produce a clean JSON 401.
 */
export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[API_AUTH] Missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY");
    return {
      ok: false,
      status: 500,
      code: "SERVER_MISCONFIGURED",
      message: "Server is misconfigured.",
    };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, status: 401, code: "MISSING_TOKEN", message: "No authorization header provided." };
  }
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, code: "INVALID_TOKEN", message: "Only Bearer tokens are supported." };
  }
  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) {
    return { ok: false, status: 401, code: "INVALID_TOKEN", message: "Invalid token." };
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  // getClaims both returns `{error}` and throws (an undecodable token raises),
  // so an unauthenticated caller must not be able to trigger a 500.
  let claims: Record<string, unknown> | undefined;
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      return { ok: false, status: 401, code: "INVALID_TOKEN", message: "Invalid or expired token." };
    }
    claims = data.claims as Record<string, unknown>;
  } catch {
    return { ok: false, status: 401, code: "INVALID_TOKEN", message: "Invalid or expired token." };
  }

  const sub = (claims as { sub?: string }).sub;
  if (!sub) {
    return { ok: false, status: 401, code: "INVALID_TOKEN", message: "No user ID found in token." };
  }

  return { ok: true, context: { supabase, userId: sub, claims } };
}
