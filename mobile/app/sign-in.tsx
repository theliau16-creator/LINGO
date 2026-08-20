import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { OAuthButtons } from "@/components/oauth-buttons";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert("Connexion impossible", error.message);
    // On success, onAuthStateChange updates the session and the root
    // navigator's Stack.Protected guard switches to (protected) on its own.
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text className="mb-6 text-center text-[32px] font-bold text-foreground">Lingo</Text>

        <OAuthButtons />

        <View className="my-2 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">ou</Text>
          <View className="h-px flex-1 bg-border" />
        </View>

        <TextField
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          placeholder="Mot de passe"
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Link href="/forgot-password" className="mt-1 self-end text-[13px] text-muted-foreground">
          Mot de passe oublié ?
        </Link>

        <Button
          label={loading ? "Connexion…" : "Se connecter"}
          loading={loading}
          disabled={!email || !password}
          onPress={handleSignIn}
          className="mt-3"
        />

        <Link href="/sign-up" className="mt-6 text-center text-[14px] text-muted-foreground">
          Pas de compte ? <Text className="font-semibold text-primary">Créer un compte</Text>
        </Link>
      </View>
    </Screen>
  );
}
