import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "@/lib/supabase";

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
    <View style={styles.container}>
      <Text style={styles.title}>Lingo</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#8892a0"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor="#8892a0"
        autoCapitalize="none"
        autoComplete="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={loading || !email || !password}
      >
        <Text style={styles.buttonText}>{loading ? "Connexion…" : "Se connecter"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#0b0d12",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 24,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#2a2f3a",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#ffffff",
    backgroundColor: "#151822",
  },
  button: {
    backgroundColor: "#5b6bfa",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
