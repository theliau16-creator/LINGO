import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function SignUp() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    // Same metadata contract as the web signup (src/routes/auth.tsx): the
    // `handle_new_user` DB trigger reads `raw_user_meta_data.username` to
    // create the profiles row, so there's no separate profile-creation call.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username || email.split("@")[0] } },
    });
    setLoading(false);
    if (error) {
      Alert.alert("Inscription impossible", error.message);
      return;
    }
    if (!data.session) {
      // Email confirmation is required by the Supabase project — no session yet.
      setCheckEmail(true);
      return;
    }
    // Session set — onAuthStateChange flips the root navigator automatically.
  }

  if (checkEmail) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-2">
          <Text className="text-center text-[22px] font-bold text-foreground">
            Vérifiez votre email
          </Text>
          <Text className="text-center text-[15px] text-muted-foreground">
            Un lien de confirmation a été envoyé à {email}. Ouvrez-le pour activer votre compte,
            puis revenez vous connecter.
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
        <Text className="mb-2 text-center text-[28px] font-bold text-foreground">
          Créer un compte
        </Text>

        <TextField
          label="Nom d'utilisateur (optionnel)"
          placeholder="Votre pseudo"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <TextField
          label="Email"
          placeholder="vous@exemple.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          label="Mot de passe"
          placeholder="8 caractères minimum"
          autoCapitalize="none"
          autoComplete="password-new"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Button
          label={loading ? "Création…" : "Créer mon compte"}
          loading={loading}
          disabled={!email || password.length < 8}
          onPress={handleSignUp}
          className="mt-3"
        />

        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-[14px] text-muted-foreground">Déjà un compte ?</Text>
          <Link href="/sign-in" className="text-[14px] font-semibold text-primary">
            Se connecter
          </Link>
        </View>
      </View>
    </Screen>
  );
}
