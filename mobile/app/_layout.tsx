import "../global.css";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, needsPasswordReset } = useAuth();

  // Session is being read from secure storage — render nothing rather than
  // flashing the sign-in screen before we know the real auth state.
  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && !needsPasswordReset}>
        <Stack.Screen name="(protected)" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && needsPasswordReset}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}
