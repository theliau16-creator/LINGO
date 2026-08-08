import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { FREE_TRANSLATION_LIMIT } from "./quota.server";

type Client = SupabaseClient<Database>;

const PREMIUM_PRICE_IDS = ["lingo_premium_monthly", "lingo_premium_yearly"];
const PREMIUM_STATUSES = ["active", "trialing", "past_due", "canceled"];

/** Throws unless the caller holds the admin role (checked as the caller, not as admin). */
export async function requireAdmin(supabase: Client, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès réservé aux administrateurs.");
}

export type AdminAccount = {
  id: string;
  username: string;
  primaryLanguage: string;
  country: string | null;
  createdAt: string;
  used: number;
  limit: number | null;
  isPremium: boolean;
};

/** Every account with its plan and translation usage, newest first. */
export async function listAccounts(): Promise<AdminAccount[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [profiles, usage, subscriptions] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, username, primary_language, country, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin.from("translation_usage").select("user_id, used"),
    supabaseAdmin.from("subscriptions").select("user_id, status, price_id, current_period_end"),
  ]);

  const usedBy = new Map((usage.data ?? []).map((row) => [row.user_id, row.used]));
  const premium = new Set(
    (subscriptions.data ?? [])
      .filter(
        (row) =>
          PREMIUM_PRICE_IDS.includes(row.price_id) &&
          PREMIUM_STATUSES.includes(row.status) &&
          (!row.current_period_end || new Date(row.current_period_end).getTime() > Date.now()),
      )
      .map((row) => row.user_id),
  );

  return (profiles.data ?? []).map((profile) => ({
    id: profile.id,
    username: profile.username,
    primaryLanguage: profile.primary_language,
    country: profile.country,
    createdAt: profile.created_at,
    used: usedBy.get(profile.id) ?? 0,
    limit: premium.has(profile.id) ? null : FREE_TRANSLATION_LIMIT,
    isPremium: premium.has(profile.id),
  }));
}
