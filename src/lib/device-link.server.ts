import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const TOKEN_TTL_MS = 2 * 60 * 1000;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Creates a short-lived single-use token the signed-in device encodes in a QR. */
export async function createDeviceLinkToken(supabase: Client, userId: string) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await supabase.from("device_link_tokens").delete().eq("user_id", userId).lt("expires_at", new Date().toISOString());

  const { error } = await supabase.from("device_link_tokens").insert({
    user_id: userId,
    token_hash: await sha256(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Exchanges a scanned token for a one-time email OTP hash the new device can
 * verify to obtain a session. The token is consumed in the process.
 */
export async function consumeDeviceLinkToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256(token);

  const { data: row } = await supabaseAdmin
    .from("device_link_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!row) throw new Error("QR code invalide.");
  if (row.used_at) throw new Error("Ce QR code a déjà été utilisé.");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("QR code expiré.");

  await supabaseAdmin.from("device_link_tokens").delete().eq("id", row.id);

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
  if (userError || !userData.user?.email) throw new Error("Connexion par QR indisponible pour ce compte.");

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkError || !link.properties?.hashed_token) {
    throw new Error(linkError?.message ?? "Impossible de créer la session.");
  }

  return { tokenHash: link.properties.hashed_token };
}
