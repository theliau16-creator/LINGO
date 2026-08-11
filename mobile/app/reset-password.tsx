import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

/**
 * Reached only once a password-recovery deep link has set a session (see
 * `needsPasswordReset` in lib/auth-context.tsx) — the root navigator routes
 * here instead of the normal protected area until the password is updated.
 */
export default function ResetPassword() {
  const { completePasswordReset } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpdate() {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert("Mise à jour impossible", error.message);
      return;
    }
    Alert.alert("Mot de passe mis à jour", undefined, [{ text: "OK", onPress: completePasswordReset }]);
  }

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text className="mb-2 text-center text-[24px] font-bold text-foreground">
          Nouveau mot de passe
        </Text>

        <TextField
          label="Nouveau mot de passe"
          placeholder="8 caractères minimum"
          autoCapitalize="none"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextField
          label="Confirmer"
          placeholder="Répétez le mot de passe"
          autoCapitalize="none"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          error={mismatch ? "Les mots de passe ne correspondent pas." : null}
        />

        <Button
          label={loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
          loading={loading}
          disabled={password.length < 8 || mismatch}
          onPress={handleUpdate}
          className="mt-3"
        />
      </View>
    </Screen>
  );
}
