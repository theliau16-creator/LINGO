import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import { languageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";

/** Identity + sign out for Phase 1. Full profile/settings screen: Phase 6. */
export default function Profile() {
  const { session, signOut } = useAuth();
  const { profile } = useProfile();
  const identity = profile?.username ?? session?.user.email ?? "…";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 items-center justify-center gap-2 px-8">
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

        <Button label="Se déconnecter" variant="secondary" onPress={signOut} className="mt-8" />
      </View>
    </SafeAreaView>
  );
}
