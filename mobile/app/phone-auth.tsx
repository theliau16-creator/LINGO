import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { COUNTRIES, toE164 } from "@/lib/countries";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";

const RESEND_DELAY = 60;

/**
 * Direct port of PhoneAuth (src/components/phone-auth.tsx) — the exact same
 * two Supabase Auth calls, not a homemade OTP system:
 * `supabase.auth.signInWithOtp({ phone })` then
 * `supabase.auth.verifyOtp({ phone, token, type: "sms" })`.
 *
 * IMPORTANT — external configuration this depends on, not present in this
 * repo and not verifiable from it: Supabase's phone auth only actually
 * sends an SMS once an SMS provider (Twilio, MessageBird, Vonage…) is
 * configured in the Supabase dashboard. Nothing in this codebase indicates
 * one is configured — same open item as the Google/Apple providers noted in
 * MIGRATION_CHECKLIST.md ("hors dépôt"). The screen and the calls are wired
 * correctly and match the web exactly, but sending/receiving a real code
 * cannot be verified until that's confirmed. Document, don't fake it.
 */
export default function PhoneAuth() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [country, setCountry] = useState(COUNTRIES[0]!.code);
  const [local, setLocal] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const dial = useMemo(() => COUNTRIES.find((c) => c.code === country)?.dial ?? "+33", [country]);
  const phone = useMemo(() => toE164(dial, local), [dial, local]);
  const phoneValid = /^\+\d{8,15}$/.test(phone);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function sendCode(resend = false) {
    if (!phoneValid) {
      Alert.alert("Numéro invalide", "Vérifiez le numéro saisi.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) {
      Alert.alert("Envoi impossible", error.message);
      return;
    }
    setStep("otp");
    setCode("");
    setCountdown(RESEND_DELAY);
    Alert.alert(resend ? "Nouveau code envoyé" : "Code envoyé", `SMS envoyé à ${phone}.`);
  }

  async function verifyCode(value: string) {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: value, type: "sms" });
    setLoading(false);
    if (error) {
      setCode("");
      Alert.alert("Code invalide", error.message);
      return;
    }
    // Session set — the root navigator's Stack.Protected guard switches on its own.
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerClassName="gap-3">
        <Pressable onPress={() => (step === "otp" ? setStep("phone") : router.back())} className="mb-2">
          <Text className="text-[15px] text-muted-foreground">← Retour</Text>
        </Pressable>

        {step === "phone" ? (
          <>
            <Text className="text-[26px] font-bold text-foreground">Votre numéro</Text>
            <Text className="mb-2 text-[14px] text-muted-foreground">
              Nous vous envoyons un code de vérification par SMS.
            </Text>

            <View className="flex-row items-center gap-2 rounded-3xl border border-border bg-secondary px-4 py-1">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-w-[110px]">
                <View className="flex-row gap-1 py-2">
                  {COUNTRIES.map((item) => (
                    <Pressable
                      key={item.code}
                      onPress={() => setCountry(item.code)}
                      className={`rounded-xl px-2 py-1 ${country === item.code ? "bg-primary" : ""}`}
                    >
                      <Text className={`text-[13px] ${country === item.code ? "text-primary-foreground" : "text-muted-foreground"}`}>
                        {item.flag} {item.dial}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <View className="h-6 w-px bg-border" />
              <TextInput
                value={local}
                onChangeText={setLocal}
                placeholder="6 12 34 56 78"
                placeholderTextColor="#9598a4"
                keyboardType="phone-pad"
                autoComplete="tel"
                className="flex-1 py-3 text-[15px] text-foreground"
              />
            </View>

            <Button
              label={loading ? "Envoi…" : "Recevoir le code"}
              loading={loading}
              disabled={!phoneValid}
              onPress={() => void sendCode()}
              className="mt-2"
            />
          </>
        ) : (
          <>
            <Text className="text-[26px] font-bold text-foreground">Code de vérification</Text>
            <Text className="mb-4 text-[14px] text-muted-foreground">
              Entrez le code envoyé à <Text className="text-foreground">{phone}</Text>.
            </Text>

            <TextInput
              value={code}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                if (digits.length === 6) void verifyCode(digits);
              }}
              placeholder="000000"
              placeholderTextColor="#9598a4"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              className="rounded-3xl border border-border bg-secondary px-4 py-4 text-center text-[24px] tracking-[8px] text-foreground"
            />

            <Button
              label={loading ? "Vérification…" : "Vérifier"}
              loading={loading}
              disabled={code.length !== 6}
              onPress={() => void verifyCode(code)}
              className="mt-4"
            />

            <View className="mt-4 flex-row items-center justify-between">
              <Pressable onPress={() => setStep("phone")}>
                <Text className="text-[13px] text-muted-foreground">Modifier le numéro</Text>
              </Pressable>
              <Pressable disabled={countdown > 0 || loading} onPress={() => void sendCode(true)}>
                <Text className={`text-[13px] font-semibold ${countdown > 0 ? "text-muted-foreground" : "text-foreground"}`}>
                  {countdown > 0 ? `Renvoyer (${countdown}s)` : "Renvoyer le code"}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
