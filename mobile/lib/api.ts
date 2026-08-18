import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Calls one of the mobile HTTP endpoints under src/routes/api/** (privileged
 * operations only — translation, quota, etc.). Attaches the current Supabase
 * session's JWT as a Bearer token, the same contract `authenticateApiRequest`
 * (src/lib/api-auth.server.ts) expects. Throws `ApiError` on a non-2xx
 * response, using the `{error:{code,message}}` shape every endpoint returns
 * (src/lib/api-http.server.ts).
 */
export async function apiFetch<T>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown; auth?: boolean },
): Promise<T> {
  if (!API_URL) {
    throw new Error("Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env and fill it in.");
  }

  const headers: Record<string, string> = {};
  // auth: false — for the rare public endpoint (e.g. device-link redeem) that
  // must be reachable before this device has a session at all.
  if (options?.auth !== false) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError(401, "MISSING_TOKEN", "No active session.");
    headers.Authorization = `Bearer ${token}`;
  }
  if (options?.body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_URL}${path}`, {
    method: options?.method ?? "GET",
    headers,
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const json = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string } }
    | null;

  if (!response.ok) {
    const error = json && "error" in json ? json.error : null;
    throw new ApiError(response.status, error?.code ?? "UNKNOWN", error?.message ?? "Request failed.");
  }

  return json as T;
}
