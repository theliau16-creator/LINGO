import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export type SubscriptionState = {
  isPremium: boolean;
  isPastDue: boolean;
  status: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isLoading: boolean;
};

/**
 * Business rules:
 * - Accès premium conservé jusqu'à la fin de la période payée après annulation.
 * - `past_due` garde l'accès et déclenche une relance in-app.
 */
export function useSubscription(): SubscriptionState {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const enabled = Boolean(user?.id) && isPaymentsConfigured();

  const query = useQuery({
    queryKey: ["subscription", user?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("environment", getStripeEnvironment())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!user?.id || !enabled) return;
    const channel = supabase
      .channel(`subscriptions:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["subscription", user.id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, enabled, queryClient]);

  const row = query.data ?? null;
  const status = row?.status ?? null;
  const periodEnd = row?.current_period_end ?? null;
  const stillInPeriod = !periodEnd || new Date(periodEnd).getTime() > Date.now();

  // Provider-agnostic on purpose, mirrors is_premium_user() (the backend's
  // single source of truth) exactly: status + period only. Used to gate the
  // Stripe-price-id check here — a user premium via RevenueCat/mobile has no
  // Stripe price_id at all, and would otherwise show as non-premium on web.
  const isPremium =
    stillInPeriod && ["active", "trialing", "past_due", "canceled"].includes(status ?? "");

  return {
    isPremium,
    isPastDue: status === "past_due",
    status,
    priceId: row?.price_id ?? null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    isLoading: query.isLoading,
  };
}
