import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import { useQuota } from "@/lib/use-quota";
import { languageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { QuotaCard } from "@/components/quota-card";

/**
 * Identity + sign out (Phase 1) + quota/Premium status (Phase 4). Temporary
 * home for the quota card until the real Settings screen exists (Phase 6) —
 * this is the closest existing screen to what the web puts in Réglages.
 */
export default function Profile() {
  const { session, signOut } = useAuth();
  const { profile } = useProfile();
  const { quota, isLoading: quotaLoading } = useQuota();
  const identity = profile?.username ?? session?.user.email ?? "…";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="items-center gap-2 px-8 pt-8 pb-12">
        <View className="mb-2 h-16 w-16 items-center justify-center rounded-full bg-primary">
          <Text className="text-[24px] font-bold text-primary-foreground">
            {identity.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text className="text-[20px] font-bold text-foreground">{identity}</Text>
        <Text className="text-[13px] text-muted-foreground">{session?.user.email}</Text>
        {profile?.primary_language ? (
          <Text className="mt-1 text-[13px] text-muted-foreground">
            {languageLabel(profile.primary_language)}
          </Text>
        ) : null}

        <View className="mt-6 w-full">
          <QuotaCard quota={quota} isLoading={quotaLoading} />
        </View>

        <Button label="Se déconnecter" variant="secondary" onPress={signOut} className="mt-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
