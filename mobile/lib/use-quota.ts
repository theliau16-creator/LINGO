import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";

export const FREE_TRANSLATION_LIMIT = 1000;

export type Quota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  isPremium: boolean;
};

/**
 * Reads GET /api/quota (src/routes/api/quota.ts -> getQuotaState,
 * src/lib/quota.server.ts). The backend is the only source of truth here on
 * purpose: `is_premium_user` is a SECURITY DEFINER function whose EXECUTE
 * grant was revoked from `authenticated`/`anon` (see
 * supabase/migrations/20260810210705_*.sql) — a client, mobile or web,
 * cannot compute premium status itself even if it wanted to. This hook does
 * no calculation, it only relays what the backend returns.
 */
export function useQuota() {
  const { session } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const data = await apiFetch<Quota>("/api/quota");
      setQuota(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Impossible de charger le quota."));
    } finally {
      setIsLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
  }, [refetch]);

  return { quota, isLoading, error, refetch };
}
