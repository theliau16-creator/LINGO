import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import { COUNTRIES } from "@/lib/countries";
import { LANGUAGES } from "@/lib/languages";
import { languageForCountry, detectCountry } from "@/lib/country-language";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";

/**
 * Minimal onboarding — country + primary language, same two columns the web
 * writes (src/routes/_authenticated/onboarding.tsx). No "skip" option here:
 * on mobile there's no other screen yet to skip to (Phase 1 only).
 */
export default function Onboarding() {
  const { session } = useAuth();
  const { profile, refetch } = useProfile();
  const [country, setCountry] = useState(detectCountry());
  const [language, setLanguage] = useState(languageForCountry(detectCountry()));
  const [touchedLanguage, setTouchedLanguage] = useState(false);
  const [saving, setSaving] = useState(false);

  function selectCountry(code: string) {
    setCountry(code);
    if (!touchedLanguage) setLanguage(languageForCountry(code));
  }

  async function handleContinue() {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ country, primary_language: language })
      .eq("id", session.user.id);
    setSaving(false);
    if (error) {
      Alert.alert("Erreur", error.message);
      return;
    }
    await refetch();
  }

  return (
    <Screen>
      <View className="gap-2">
        <Text className="text-[28px] font-bold text-foreground">
          Bienvenue{profile?.username ? `, ${profile.username}` : ""}
        </Text>
        <Text className="text-[14px] text-muted-foreground">
          Sélectionnez votre pays et votre langue : Lingo traduit tout le reste.
        </Text>
      </View>

      <View className="mt-8 gap-2">
        <Text className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pays
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {COUNTRIES.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => selectCountry(item.code)}
              className={`rounded-2xl px-3 py-2.5 ${country === item.code ? "bg-primary" : "border border-border bg-secondary"}`}
            >
              <Text
                className={`text-[13px] ${country === item.code ? "font-semibold text-primary-foreground" : "text-muted-foreground"}`}
              >
                {item.flag} {item.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="mt-6 gap-2">
        <Text className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Ma langue
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {LANGUAGES.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => {
                setTouchedLanguage(true);
                setLanguage(item.code);
              }}
              className={`rounded-2xl px-3 py-2.5 ${language === item.code ? "bg-primary" : "border border-border bg-secondary"}`}
            >
              <Text
                className={`text-[13px] ${language === item.code ? "font-semibold text-primary-foreground" : "text-muted-foreground"}`}
              >
                {item.flag} {item.native}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Button
        label={saving ? "Enregistrement…" : "Continuer"}
        loading={saving}
        onPress={handleContinue}
        className="mt-8"
      />
    </Screen>
  );
}
