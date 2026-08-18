import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "./supabase";
import { establishSessionFromUrl } from "./deep-link-session";

export class OAuthError extends Error {}

/**
 * Sign in with Apple — native, no deep link involved: expo-apple-authentication
 * gets an identityToken directly from the OS, handed to Supabase's
 * signInWithIdToken (exact pattern from Supabase's own React Native guide,
 * no manual nonce — Supabase's Expo example doesn't use one either). Supabase
 * Auth remains the source of truth: the token is only ever verified
 * server-side against Apple's public keys, no secret lives in this client.
 *
 * Requires the "Sign in with Apple" capability enabled for this app's
 * bundle id in the Apple Developer portal, and the Apple provider enabled in
 * the Supabase dashboard — both external, one-time configuration steps.
 */
export async function signInWithApple(): Promise<void> {
  if (Platform.OS !== "ios") {
    throw new OAuthError("Sign in with Apple n'est disponible que sur iOS.");
  }
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new OAuthError("Sign in with Apple n'est pas disponible sur cet appareil.");
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    // ERR_REQUEST_CANCELED: the user dismissed the native sheet — not an error.
    if ((err as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
    throw err;
  }

  if (!credential.identityToken) {
    throw new OAuthError("Apple n'a pas renvoyé de jeton d'identité.");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple only ever sends the name on the very first sign-in for this app —
  // capture it now or it's gone. Best-effort: a failure here must not fail
  // the sign-in itself, the session is already established above.
  if (credential.fullName?.givenName || credential.fullName?.familyName) {
    const fullName = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ");
    await supabase.auth
      .updateUser({ data: { full_name: fullName } })
      .catch(() => undefined);
  }
}

/**
 * Sign in with Google — no native Google SDK (would need its own Google
 * Cloud "iOS" OAuth client, on top of whatever's configured in the Supabase
 * dashboard: real but avoidable extra external setup for this phase).
 * Instead: the same browser-redirect OAuth the web already uses
 * (supabase.auth.signInWithOAuth), opened in an in-app browser session via
 * expo-web-browser and caught locally when it resolves — official Supabase
 * pattern for Expo (see the "Native mobile deep linking" guide). Requires
 * the Google provider enabled in the Supabase dashboard (external, same
 * pending step already needed for the web's own Google button — see
 * MIGRATION_CHECKLIST.md) and `lingo://` registered as an allowed redirect URL.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri({ path: "auth-callback" });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new OAuthError("Impossible de démarrer la connexion Google.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return; // user cancelled — not an error

  const handled = await establishSessionFromUrl(result.url);
  if (!handled) throw new OAuthError("La connexion Google a échoué.");
}
