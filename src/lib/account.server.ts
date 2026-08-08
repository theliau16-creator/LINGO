import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Deletes a Lingo account:
 * 1. cancels any active Stripe subscription,
 * 2. anonymises content that other users still legitimately see,
 * 3. deletes the private rows,
 * 4. removes the auth user (cascades the rest).
 */
export async function deleteAccount(supabase: Client, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Stripe — cancel every non-terminated subscription of this user.
  const { data: subscriptions } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_subscription_id, status, environment")
    .eq("user_id", userId);

  for (const subscription of subscriptions ?? []) {
    if (["canceled", "incomplete_expired"].includes(subscription.status)) continue;
    try {
      const { createStripeClient } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(subscription.environment === "live" ? "live" : "sandbox");
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (error) {
      console.error("[ACCOUNT_DELETE_STRIPE]", error);
    }
  }

  // 2. Anonymise messages kept for the other participant.
  await supabaseAdmin
    .from("messages")
    .update({ original_text: "Message d'un compte supprimé" })
    .eq("sender_id", userId);

  // 3. Private data.
  await supabaseAdmin.from("chat_preferences").delete().eq("user_id", userId);
  await supabaseAdmin.from("device_link_tokens").delete().eq("user_id", userId);
  await supabaseAdmin.from("blocked_users").delete().eq("user_id", userId);
  await supabaseAdmin.from("profiles").update({ phone: null, avatar_url: null }).eq("id", userId);

  // 4. Auth user (cascades profiles, friendships, participants, ...).
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  void supabase; // caller identity already verified by the middleware
  return { deleted: true };
}
