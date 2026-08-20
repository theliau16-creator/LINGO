import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import { useFriends } from "@/lib/use-friends";
import { supabase } from "@/lib/supabase";
import { LANGUAGES } from "@/lib/languages";
import { Button } from "@/components/ui/button";

/**
 * Identité (avatar/pseudo/langue) uniquement — les réglages (traduction,
 * confidentialité, comptes bloqués, appareils, export, suppression,
 * déconnexion) vivent dans l'onglet Réglages (settings.tsx), qui réutilise
 * les mêmes hooks sans dupliquer cette logique d'identité.
 */
export default function Profile() {
  const { session } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { friends } = useFriends();

  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState("fr");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username ?? "");
    setLanguage(profile.primary_language ?? "fr");
  }, [profile]);

  const identity = profile?.username ?? session?.user.email ?? "…";

  async function handleSave() {
    if (!session?.user.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ username: username.trim(), primary_language: language })
      .eq("id", session.user.id);
    setSaving(false);
    if (error) {
      Alert.alert("Erreur", error.message);
      return;
    }
    await refetchProfile();
    Alert.alert("Profil mis à jour");
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }} viewBox="0 0 402 340">
        <Defs>
          <RadialGradient id="profileHaloLeft" cx="48" cy="-34" r="360" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#337bff" stopOpacity={0.26} />
            <Stop offset="0.35" stopColor="#337bff" stopOpacity={0.08} />
            <Stop offset="0.58" stopColor="#337bff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="profileHaloRight" cx="382" cy="27" r="340" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#aa6ef3" stopOpacity={0.22} />
            <Stop offset="0.35" stopColor="#aa6ef3" stopOpacity={0.07} />
            <Stop offset="0.6" stopColor="#aa6ef3" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="402" height="340" fill="url(#profileHaloLeft)" />
        <Rect x="0" y="0" width="402" height="340" fill="url(#profileHaloRight)" />
      </Svg>
      <ScrollView contentContainerClassName="gap-6 px-5 pb-12 pt-4">
        <View className="items-center rounded-3xl border border-border bg-card px-6 py-8">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary">
            <Text className="text-[28px] font-bold text-primary-foreground">
              {identity.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text className="mt-4 text-[20px] font-bold text-foreground">{identity}</Text>
          <Text className="text-[13px] text-muted-foreground">{session?.user.email}</Text>
          <View className="mt-5 flex-row gap-3">
            <Stat label="Amis" value={friends.length} />
            <Stat label="Langue" value={language.toUpperCase()} />
          </View>
        </View>

        <Section title="Profil">
          <Field label="Pseudo" value={username} onChangeText={setUsername} />
          <Text className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Ma langue
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {LANGUAGES.map((item) => (
              <Pressable
                key={item.code}
                onPress={() => setLanguage(item.code)}
                className={`rounded-2xl px-3 py-2.5 ${language === item.code ? "bg-primary" : "border border-border bg-secondary"}`}
              >
                <Text className={`text-[13px] ${language === item.code ? "font-semibold text-primary-foreground" : "text-muted-foreground"}`}>
                  {item.flag} {item.native}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button label={saving ? "Enregistrement…" : "Enregistrer"} loading={saving} onPress={handleSave} className="mt-3" />
        </Section>

        <Pressable
          onPress={() => router.push("/settings")}
          className="flex-row items-center justify-between rounded-3xl border border-border bg-card p-4"
        >
          <Text className="font-semibold text-foreground">Réglages</Text>
          <Text className="text-muted-foreground">›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="rounded-2xl bg-secondary px-5 py-3">
      <Text className="text-center text-[16px] font-bold text-foreground">{value}</Text>
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View className="mb-3 rounded-3xl border border-border bg-card px-5 py-3">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} autoCapitalize="none" className="mt-1 text-[15px] text-foreground" />
    </View>
  );
}
