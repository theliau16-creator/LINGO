/**
 * Centralised translation quota.
 *
 * Business rules:
 * - free plan: 5 000 real translations (cache hits are free),
 * - premium: unlimited,
 * - the counter is server-side only; the client can read it but never write it.
 */

export const FREE_TRANSLATION_LIMIT = 5000;
export const QUOTA_REACHED = "TRANSLATION_QUOTA_REACHED";

const PREMIUM_PRICE_IDS = ["lingo_premium_monthly", "lingo_premium_yearly"];
const PREMIUM_STATUSES = ["active", "trialing", "past_due", "canceled"];

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

/** Premium = an active (or still-paid) subscription on a premium price. */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status, price_id, current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []).some((row) => {
    if (!PREMIUM_PRICE_IDS.includes(row.price_id)) return false;
    if (!PREMIUM_STATUSES.includes(row.status)) return false;
    if (!row.current_period_end) return true;
    return new Date(row.current_period_end).getTime() > Date.now();
  });
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

/** Increments the counter after a real (non-cached) translation. */
export async function consumeQuota(userId: string | null | undefined, amount = 1): Promise<void> {
  if (!userId || amount <= 0) return;
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("translation_usage")
    .select("used")
    .eq("user_id", userId)
    .maybeSingle();

  await supabaseAdmin
    .from("translation_usage")
    .upsert({ user_id: userId, used: (data?.used ?? 0) + amount }, { onConflict: "user_id" });
}

/** Admin-only: resets a user's counter to zero. */
export async function resetQuota(userId: string): Promise<void> {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("translation_usage")
    .upsert({ user_id: userId, used: 0 }, { onConflict: "user_id" });
}
