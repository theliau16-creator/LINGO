import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Link } from "expo-router";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: makeRedirectUri({ path: "reset-password" }),
    });
    setLoading(false);
    if (error) {
      Alert.alert("Envoi impossible", error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-2">
          <Text className="text-center text-[22px] font-bold text-foreground">Email envoyé</Text>
          <Text className="text-center text-[15px] text-muted-foreground">
            Si un compte existe pour {email}, un lien de réinitialisation vient d'être envoyé.
            Ouvrez-le depuis cet appareil pour choisir un nouveau mot de passe.
          </Text>
          <Link href="/sign-in" className="mt-4 text-[15px] font-semibold text-primary">
            Retour à la connexion
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text className="mb-2 text-center text-[24px] font-bold text-foreground">
          Mot de passe oublié
        </Text>
        <Text className="mb-4 text-center text-[14px] text-muted-foreground">
          Indiquez votre email, on vous envoie un lien pour en choisir un nouveau.
        </Text>

        <TextField
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Button
          label={loading ? "Envoi…" : "Envoyer le lien"}
          loading={loading}
          disabled={!email}
          onPress={handleSend}
          className="mt-3"
        />

        <Link href="/sign-in" className="mt-6 text-center text-[14px] text-muted-foreground">
          Retour à la connexion
        </Link>
      </View>
    </Screen>
  );
}
