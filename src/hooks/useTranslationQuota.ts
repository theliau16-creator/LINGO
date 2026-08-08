import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/useAuth";
import { getTranslationQuota } from "@/lib/quota.functions";

export const FREE_TRANSLATION_LIMIT = 1000;

export type TranslationQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  isPremium: boolean;
};

/** Reads the centralised translation counter (free plan: 1 000 traductions). */
export function useTranslationQuota() {
  const { data: user } = useCurrentUser();
  const fetchQuota = useServerFn(getTranslationQuota);
  return useQuery({
    queryKey: ["translation-quota", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async () => (await fetchQuota()) as TranslationQuota,
  });
}

/** True when an error comes from the exhausted free quota. */
export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("TRANSLATION_QUOTA_REACHED");
}
