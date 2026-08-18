import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { signInWithApple, signInWithGoogle } from "@/lib/use-oauth";

/**
 * Shared by sign-in.tsx and sign-up.tsx — Supabase's signInWithIdToken/
 * signInWithOAuth create the account on first use, so there's no real
 * distinction between "sign in" and "sign up" for these providers, same as
 * the web's single combined screen (src/routes/auth.tsx).
 */
export function OAuthButtons() {
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  async function handleApple() {
    setBusy("apple");
    try {
      await signInWithApple();
    } catch (err) {
      Alert.alert("Connexion Apple impossible", err instanceof Error ? err.message : "Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert("Connexion Google impossible", err instanceof Error ? err.message : "Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="gap-2">
      {Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={24}
          style={{ height: 52, width: "100%", opacity: busy && busy !== "apple" ? 0.5 : 1 }}
          onPress={() => void handleApple()}
        />
      ) : null}

      <Pressable
        onPress={() => void handleGoogle()}
        disabled={busy !== null}
        className={`h-[52px] flex-row items-center justify-center gap-2 rounded-3xl border border-border bg-secondary ${busy && busy !== "google" ? "opacity-50" : ""}`}
      >
        {busy === "google" ? (
          <ActivityIndicator color="#f7f8fb" />
        ) : (
          <>
            <Text className="text-[15px] font-semibold text-foreground">G</Text>
            <Text className="text-[15px] font-semibold text-foreground">Continuer avec Google</Text>
          </>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.push("/phone-auth")}
        disabled={busy !== null}
        className="h-[52px] flex-row items-center justify-center gap-2 rounded-3xl border border-border bg-secondary"
      >
        <Text className="text-[15px] font-semibold text-foreground">📱 Continuer avec le téléphone</Text>
      </Pressable>
    </View>
  );
}
