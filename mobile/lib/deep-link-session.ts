import { getQueryParams } from "expo-auth-session/build/QueryParams";
import { supabase } from "./supabase";

/**
 * Extracts a session from a Supabase auth redirect URL and establishes it —
 * shared by password recovery (lib/auth-context.tsx) and OAuth sign-in
 * (lib/use-oauth.ts, Google). Both land as
 * `lingo://<path>#access_token=...&refresh_token=...` (or `?code=...`
 * depending on flow type). `detectSessionInUrl` is off on the mobile client
 * (no browser location bar to parse it automatically), so this is done by
 * hand — the pattern from Supabase's own React Native deep-linking guide.
 */
export async function establishSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = getQueryParams(url);
  if (errorCode) return false;

  if (params["access_token"] && params["refresh_token"]) {
    const { error } = await supabase.auth.setSession({
      access_token: params["access_token"],
      refresh_token: params["refresh_token"],
    });
    return !error;
  }

  if (params["code"]) {
    const { error } = await supabase.auth.exchangeCodeForSession(params["code"]);
    return !error;
  }

  return false;
}
