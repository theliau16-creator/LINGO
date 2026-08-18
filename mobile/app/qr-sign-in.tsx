import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { Stack, router } from "expo-router";
import { Screen } from "@/components/screen";
import { QrScanner } from "@/components/qr-scanner";
import { signInWithDeviceLinkQr } from "@/lib/device-link";

/**
 * Direct port of the QR half of AuthPage (src/routes/auth.tsx) — same
 * "lingo:login:<token>" contract, same redeem-then-verifyOtp flow. On any
 * failure (invalid QR, expired/used token, network) the web exits the
 * scanner back to the main auth screen rather than allowing an immediate
 * re-scan; mirrored here by popping back to sign-in.
 */
export default function QrSignIn() {
  const [loading, setLoading] = useState(false);

  async function handleResult(value: string) {
    setLoading(true);
    try {
      await signInWithDeviceLinkQr(value);
      // Session set — the root navigator's Stack.Protected guard switches on its own.
    } catch (err) {
      Alert.alert("Connexion impossible", err instanceof Error ? err.message : "QR code invalide ou expiré.");
      router.back();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <Pressable onPress={() => router.back()} className="mb-2">
        <Text className="text-[15px] text-muted-foreground">← Retour</Text>
      </Pressable>

      <Text className="text-[26px] font-bold text-foreground">Scanner un QR</Text>
      <Text className="mb-6 mt-2 text-[14px] text-muted-foreground">
        Scannez le QR affiché sur un appareil déjà connecté à votre compte Lingo (Profil → Lier un appareil).
      </Text>

      <QrScanner onResult={(value) => void handleResult(value)} />

      {loading ? (
        <Text className="mt-4 text-center text-[13px] text-muted-foreground">Connexion…</Text>
      ) : null}
    </Screen>
  );
}
