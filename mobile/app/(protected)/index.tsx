import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";

export default function Home() {
  const { session, signOut } = useAuth();
  const profile = useProfile();
  const identity = profile?.username ?? session?.user.email ?? "…";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenue</Text>
      <Text style={styles.identity}>{identity}</Text>

      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#0b0d12",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
  },
  identity: {
    fontSize: 16,
    color: "#a7adba",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#1c2030",
    borderWidth: 1,
    borderColor: "#2a2f3a",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
