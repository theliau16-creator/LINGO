import { apiFetch } from "./api";
import { supabase } from "./supabase";

export type DeviceLinkToken = { token: string; expiresAt: string };

/**
 * Issues a short-lived (2 min), single-use QR token for this signed-in
 * device — authenticated, reuses POST /api/device-link/token
 * (src/routes/api/device-link/token.ts), which itself calls
 * `createDeviceLinkToken` unchanged. No token generation logic lives here.
 */
export async function issueDeviceLinkToken(): Promise<DeviceLinkToken> {
  return apiFetch<DeviceLinkToken>("/api/device-link/token", { method: "POST" });
}

export class QrSignInError extends Error {}

/**
 * Redeems a scanned "lingo:login:<token>" QR value and signs in on this
 * device — exact two-step exchange as the web (src/routes/auth.tsx
 * handleQrResult): POST /api/public/device-link/redeem (public — this
 * device has no session yet) for a one-time magiclink token_hash, then
 * supabase.auth.verifyOtp to obtain the session. Neither step re-implements
 * any of the sensitive token logic, which stays server-side.
 */
export async function signInWithDeviceLinkQr(rawValue: string): Promise<void> {
  if (!rawValue.startsWith("lingo:login:")) {
    throw new QrSignInError("QR code invalide.");
  }
  const token = rawValue.slice("lingo:login:".length);

  const { tokenHash } = await apiFetch<{ tokenHash: string }>("/api/public/device-link/redeem", {
    method: "POST",
    body: { token },
    auth: false,
  });

  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) throw error;
}
