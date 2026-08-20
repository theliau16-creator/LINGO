import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { PurchasesPackage } from "react-native-purchases";
import { useQuota } from "@/lib/use-quota";
import { usePaywall } from "@/lib/use-paywall";
import { QuotaCard } from "@/components/quota-card";
import { Button } from "@/components/ui/button";

const FEATURES = ["Traductions illimitées", "Toutes les langues disponibles", "Accès prioritaire aux nouveautés"];

const PACKAGE_LABELS: Partial<Record<string, string>> = {
  MONTHLY: "Mensuel",
  ANNUAL: "Annuel",
  WEEKLY: "Hebdomadaire",
  SIX_MONTH: "6 mois",
  THREE_MONTH: "3 mois",
  TWO_MONTH: "2 mois",
  LIFETIME: "À vie",
};

/**
 * Real paywall (Phase 11): produits/prix affichés viennent de l'offering
 * RevenueCat actuel (rien de statique) — remplace le paywall provisoire de
 * la Phase 4. Le statut Premium affiché (`quota.isPremium`) reste
 * entièrement backend (GET /api/quota → is_premium_user), jamais recalculé
 * ici : après un achat/une restauration, on ne fait que redemander ce même
 * état — RevenueCat ne sert qu'à l'achat lui-même et au message optimiste
 * pendant que le webhook propage côté serveur.
 */
export default function Premium() {
  const { quota, isLoading, refetch: refetchQuota } = useQuota();
  const { available, offering, loadingOffering, offeringError, purchasing, restoring, purchase, restore } = usePaywall();

  const [selected, setSelected] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    if (!selected && offering?.availablePackages?.length) {
      setSelected(offering.availablePackages[offering.availablePackages.length - 1] ?? offering.availablePackages[0]!);
    }
  }, [offering, selected]);

  async function refetchQuotaWithRetry() {
    await refetchQuota();
    // Le webhook RevenueCat peut arriver avec un léger décalage après
    // l'achat — un second essai après un court délai couvre la majorité
    // des cas sans bloquer l'interface en attendant.
    setTimeout(() => void refetchQuota(), 2500);
  }

  async function handlePurchase() {
    if (!selected) return;
    const result = await purchase(selected);
    if (result.ok) {
      await refetchQuotaWithRetry();
      if (!result.premium) {
        Alert.alert("Achat en cours de validation", "Votre abonnement sera actif dans quelques instants.");
      }
      return;
    }
    if (result.cancelled) return;
    Alert.alert("Achat impossible", result.message ?? "Réessayez.");
  }

  async function handleRestore() {
    const result = await restore();
    if (result.ok) {
      await refetchQuotaWithRetry();
      Alert.alert(
        result.premium ? "Achats restaurés" : "Aucun achat actif",
        result.premium
          ? "Votre abonnement Premium est de nouveau actif."
          : "Aucun abonnement actif n'a été trouvé pour ce compte.",
      );
      return;
    }
    Alert.alert("Restauration impossible", result.message ?? "Réessayez.");
  }

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

            {!available ? (
              <View className="rounded-3xl border border-border bg-card p-5">
                <Text className="text-[13px] text-muted-foreground">
                  L'achat intégré n'est pas disponible sur cette plateforme pour l'instant. Utilisez la version web pour
                  souscrire à Premium.
                </Text>
              </View>
            ) : loadingOffering ? (
              <View className="items-center py-6">
                <ActivityIndicator />
              </View>
            ) : offeringError || !offering?.availablePackages?.length ? (
              <View className="rounded-3xl border border-border bg-card p-5">
                <Text className="text-[13px] text-muted-foreground">
                  {offeringError ?? "Aucun forfait disponible pour le moment. Réessayez plus tard."}
                </Text>
              </View>
            ) : (
              <>
                <View className="gap-2">
                  <Text className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Choisir un forfait
                  </Text>
                  {offering.availablePackages.map((pkg) => {
                    const active = selected?.identifier === pkg.identifier;
                    return (
                      <Pressable
                        key={pkg.identifier}
                        onPress={() => setSelected(pkg)}
                        className={`flex-row items-center justify-between rounded-3xl border p-4 ${
                          active ? "border-primary bg-primary/10" : "border-border bg-card"
                        }`}
                      >
                        <Text className="font-semibold text-foreground">
                          {PACKAGE_LABELS[pkg.packageType] ?? pkg.product.title}
                        </Text>
                        <Text className="text-[15px] font-semibold text-foreground">{pkg.product.priceString}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Button
                  label={purchasing ? "Achat…" : "S'abonner"}
                  loading={purchasing}
                  disabled={!selected || restoring}
                  onPress={() => void handlePurchase()}
                  className="mt-2"
                />
              </>
            )}

            {available ? (
              <Pressable
                onPress={() => void handleRestore()}
                disabled={restoring || purchasing}
                className="items-center py-2"
              >
                <Text className="text-[13px] font-semibold text-muted-foreground">
                  {restoring ? "Restauration…" : "Restaurer mes achats"}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
