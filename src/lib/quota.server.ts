/**
 * Centralised translation quota.
 *
 * Business rules:
 * - free plan: 1 000 real translations (cache hits are free),
 * - premium: unlimited,
 * - the counter is server-side only; the client can read it but never write it,
 * - the counter is incremented through an atomic SQL function so two concurrent
 *   translations can never overwrite each other's increment.
 */

export const FREE_TRANSLATION_LIMIT = 1000;
export const QUOTA_REACHED = "TRANSLATION_QUOTA_REACHED";

export type QuotaState = {
  used: number;
  limit: number | null;
  remaining: number | null;
  isPremium: boolean;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Single source of truth for premium access (shared by quota, personalisation,
 * admin and UI). The rules live in the `is_premium_user` SQL function:
 * `active`/`trialing` are premium, `canceled` stays premium until the paid
 * period ends, `past_due` keeps a bounded 7-day grace period.
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin.rpc("is_premium_user", { _user_id: userId });
  if (error) {
    console.error("[QUOTA_PREMIUM_CHECK]", error.message);
    return false;
  }
  return data === true;
}

/** Current quota state for one user. */
export async function getQuotaState(userId: string): Promise<QuotaState> {
  const supabaseAdmin = await admin();
  const [premium, usage] = await Promise.all([
    isPremiumUser(userId),
    supabaseAdmin.from("translation_usage").select("used").eq("user_id", userId).maybeSingle(),
  ]);

  const used = usage.data?.used ?? 0;
  if (premium) return { used, limit: null, remaining: null, isPremium: true };
  return {
    used,
    limit: FREE_TRANSLATION_LIMIT,
    remaining: Math.max(0, FREE_TRANSLATION_LIMIT - used),
    isPremium: false,
  };
}

/** Throws `TRANSLATION_QUOTA_REACHED` when the free plan is exhausted. */
export async function assertQuota(userId: string | null | undefined): Promise<QuotaState | null> {
  if (!userId) return null;
  const state = await getQuotaState(userId);
  if (!state.isPremium && (state.remaining ?? 0) <= 0) throw new Error(QUOTA_REACHED);
  return state;
}

/**
 * Increments the counter after a real (non-cached) translation.
 * Atomic: `consume_translation_quota` does the read + write in one statement,
 * so concurrent translations cannot lose an increment.
 */
export async function consumeQuota(userId: string | null | undefined, amount = 1): Promise<void> {
  if (!userId || amount <= 0) return;
  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin.rpc("consume_translation_quota", {
    _user_id: userId,
    _amount: amount,
  });
  if (error) console.error("[QUOTA_CONSUME]", error.message);
}

/** Admin-only: resets a user's counter to zero. */
export async function resetQuota(userId: string): Promise<void> {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("translation_usage")
    .upsert({ user_id: userId, used: 0 }, { onConflict: "user_id" });
}
