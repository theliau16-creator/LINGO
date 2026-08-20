import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { FREE_TRANSLATION_LIMIT, type Quota } from "@/lib/use-quota";

/**
 * Mirrors src/components/quota-card.tsx (web) — same two states (Premium /
 * free with progress bar), same "low" threshold (<=10% left). Purely a
 * display of what GET /api/quota already returned; no quota math happens
 * here beyond the progress-bar ratio, which is cosmetic only.
 */
export function QuotaCard({ quota, isLoading }: { quota: Quota | null; isLoading: boolean }) {
  if (isLoading || !quota) {
    return <View className="h-24 animate-pulse rounded-3xl bg-card" />;
  }

  if (quota.isPremium) {
    return (
      <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4">
        <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary">
          <Text className="text-[16px]">✨</Text>
        </View>
        <View className="flex-1">
          <Text className="font-semibold text-foreground">Traductions illimitées</Text>
          <Text className="text-[12px] text-muted-foreground">
            {quota.used.toLocaleString("fr-FR")} traductions utilisées — Premium actif
          </Text>
        </View>
      </View>
    );
  }

  const limit = quota.limit ?? FREE_TRANSLATION_LIMIT;
  const remaining = quota.remaining ?? 0;
  const ratio = Math.min(100, Math.round((quota.used / limit) * 100));
  const low = remaining <= limit * 0.1;

  return (
    <View className="rounded-3xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary">
          <Text className="text-[16px]">⚡</Text>
        </View>
        <View className="flex-1">
          <Text className="font-semibold text-foreground">Quota gratuit</Text>
          <Text className="text-[12px] text-muted-foreground">
            {quota.used.toLocaleString("fr-FR")} / {limit.toLocaleString("fr-FR")} traductions
          </Text>
        </View>
        <Text className={`text-[15px] font-semibold ${low ? "text-destructive" : "text-muted-foreground"}`}>
          {remaining.toLocaleString("fr-FR")}
        </Text>
      </View>

      <View className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <View
          className={`h-full rounded-full ${low ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${ratio}%` }}
        />
      </View>

      {low ? (
        <Pressable onPress={() => router.push("/premium")} className="mt-3 h-11 items-center justify-center rounded-3xl bg-primary">
          <Text className="text-[14px] font-semibold text-primary-foreground">
            {remaining === 0 ? "Quota atteint — passer à Premium" : "Passer à Premium"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
