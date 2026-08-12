import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useQuota } from "@/lib/use-quota";
import { QuotaCard } from "@/components/quota-card";

const FEATURES = ["Traductions illimitées", "Toutes les langues disponibles", "Accès prioritaire aux nouveautés"];

type Plan = { id: "monthly" | "yearly"; label: string; price: string; period: string; note?: string };

const PLANS: Plan[] = [
  { id: "monthly", label: "Mensuel", price: "10,00 €", period: "/ mois" },
  { id: "yearly", label: "Annuel", price: "83,88 €", period: "/ an", note: "soit 6,99 €/mois" },
];

/**
 * Provisional paywall (Phase 4): shows quota + plan pricing so the
 * Gratuit/Premium distinction is visible and reachable from the quota-reached
 * state. No purchase flow yet on purpose — RevenueCat/StoreKit is Phase 11.
 * Pricing mirrors the web's current Stripe prices for now (src/routes/_authenticated/premium.tsx);
 * expect it to be replaced by the App Store/Play Store product prices once IAP lands.
 */
export default function Premium() {
  const { quota, isLoading } = useQuota();
  const [selected, setSelected] = useState<(typeof PLANS)[number]["id"]>("yearly");

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen options={{ title: "Lingo Premium" }} />
      <ScrollView contentContainerClassName="gap-4 px-5 py-5">
        <QuotaCard quota={quota} isLoading={isLoading} />

        {quota?.isPremium ? (
          <View className="rounded-3xl border border-border bg-card p-5">
            <Text className="text-[16px] font-semibold text-foreground">Vous êtes Premium ✨</Text>
            <Text className="mt-1 text-[13px] text-muted-foreground">
              Traductions illimitées, déjà actives sur ce compte.
            </Text>
          </View>
        ) : (
          <>
            <View className="rounded-3xl border border-border bg-card p-5">
              <View className="mb-3 h-10 w-10 items-center justify-center rounded-2xl bg-primary">
                <Text className="text-[16px]">✨</Text>
              </View>
              {FEATURES.map((feature) => (
                <View key={feature} className="mb-2 flex-row items-start gap-2">
                  <Text className="text-[13px] text-primary">✓</Text>
                  <Text className="flex-1 text-[13px] text-foreground">{feature}</Text>
                </View>
              ))}
            </View>

            <View className="gap-2">
              <Text className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Choisir un forfait
              </Text>
              {PLANS.map((plan) => {
                const active = selected === plan.id;
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelected(plan.id)}
                    className={`flex-row items-center justify-between rounded-3xl border p-4 ${
                      active ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <View>
                      <Text className="font-semibold text-foreground">{plan.label}</Text>
                      {plan.note ? <Text className="text-[11px] text-muted-foreground">{plan.note}</Text> : null}
                    </View>
                    <Text className="text-[15px] font-semibold text-foreground">
                      {plan.price} <Text className="text-[12px] text-muted-foreground">{plan.period}</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-2 items-center gap-2">
              <View className="h-12 w-full items-center justify-center rounded-3xl bg-secondary opacity-60">
                <Text className="text-[14px] font-semibold text-muted-foreground">S'abonner</Text>
              </View>
              <Text className="text-center text-[11px] text-muted-foreground">
                Achat disponible dans une prochaine mise à jour.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
