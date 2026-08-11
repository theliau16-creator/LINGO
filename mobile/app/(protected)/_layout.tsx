import { Stack } from "expo-router";
import { View } from "react-native";
import { useProfile } from "@/lib/use-profile";

export default function ProtectedLayout() {
  const { profile, isLoading } = useProfile();

  // Same onboarding-needed signal as the web (src/routes/_authenticated/onboarding.tsx):
  // `country` has no DB default and is only ever written by onboarding, while
  // `primary_language` defaults to 'fr' in the schema so it can't be used as the gate.
  if (isLoading) return <View className="flex-1 bg-background" />;
  const needsOnboarding = !profile?.country;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!needsOnboarding}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[conversationId]" options={{ headerShown: true, title: "" }} />
      </Stack.Protected>
    </Stack>
  );
}
