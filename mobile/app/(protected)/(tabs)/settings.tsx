import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import { useQuota } from "@/lib/use-quota";
import { useUserSettings } from "@/lib/use-user-settings";
import { useBlockedUsers } from "@/lib/use-blocked-users";
import { useAccount } from "@/lib/use-account";
import { useDeviceLink } from "@/lib/use-device-link";
import { Button } from "@/components/ui/button";
import { QuotaCard } from "@/components/quota-card";
import { QrCode } from "@/components/qr-code";

/**
 * Réglages : traduction, confidentialité, comptes bloqués, appareils,
 * abonnement, export/suppression, déconnexion — réutilise les mêmes hooks
 * que l'ancien écran Profil combiné, sans dupliquer l'identité (pseudo/
 * langue/avatar), qui reste dans profile.tsx.
 */
export default function Settings() {
  const { signOut } = useAuth();
  const { quota, isLoading: quotaLoading } = useQuota();
  const { settings, update: updateSettings } = useUserSettings();
  const { blocked, unblock } = useBlockedUsers();
  const { deleting, exporting, deleteAccount, exportData } = useAccount();
  const { token: deviceToken, generating: generatingToken, generate: generateDeviceToken } = useDeviceLink();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function handleExport() {
    try {
      const data = await exportData();
      Alert.alert(
        "Export prêt",
        `${Object.keys(data).length} sections de données récupérées. Le téléchargement de fichier n'est pas encore disponible sur mobile — utilisez la version web pour l'enregistrer.`,
      );
    } catch (err) {
      Alert.alert("Échec de l'export", err instanceof Error ? err.message : "Réessayez.");
    }
  }

  async function handleDelete() {
    try {
      await deleteAccount(deleteConfirm.trim());
      setDeleteOpen(false);
      await signOut();
    } catch (err) {
      Alert.alert("Suppression impossible", err instanceof Error ? err.message : "Réessayez.");
    }
  }

  async function handleGenerateDeviceToken() {
    try {
      await generateDeviceToken();
    } catch (err) {
      Alert.alert("QR indisponible", err instanceof Error ? err.message : "Réessayez.");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }} viewBox="0 0 402 340">
        <Defs>
          <RadialGradient id="settingsHaloLeft" cx="48" cy="-34" r="360" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#337bff" stopOpacity={0.26} />
            <Stop offset="0.35" stopColor="#337bff" stopOpacity={0.08} />
            <Stop offset="0.58" stopColor="#337bff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="settingsHaloRight" cx="382" cy="27" r="340" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#aa6ef3" stopOpacity={0.22} />
            <Stop offset="0.35" stopColor="#aa6ef3" stopOpacity={0.07} />
            <Stop offset="0.6" stopColor="#aa6ef3" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="402" height="340" fill="url(#settingsHaloLeft)" />
        <Rect x="0" y="0" width="402" height="340" fill="url(#settingsHaloRight)" />
      </Svg>
      <ScrollView contentContainerClassName="gap-6 px-5 pb-12 pt-4">
        <Text className="text-[22px] font-bold text-foreground">Réglages</Text>

        <Section title="Traduction">
          <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary">
              <Text className="text-[16px]">✨</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-foreground">Lingo AI</Text>
              <Text className="text-[12px] text-muted-foreground">Moteur de traduction actif</Text>
            </View>
          </View>
          <QuotaCard quota={quota} isLoading={quotaLoading} />
          <ToggleRow
            label="Traduction automatique"
            hint="Traduit les messages reçus sans y penser"
            value={settings.auto_translate}
            onChange={(value) => void updateSettings({ auto_translate: value })}
          />
        </Section>

        <Section title="Confidentialité">
          <ToggleRow
            label="Statut en ligne"
            hint="Visible par vos contacts quand vous êtes actif"
            value={settings.show_online_status}
            onChange={(value) => void updateSettings({ show_online_status: value })}
          />
          <ToggleRow
            label="Accusés de lecture"
            hint="Indique quand vous avez lu un message"
            value={settings.read_receipts_enabled}
            onChange={(value) => void updateSettings({ read_receipts_enabled: value })}
          />
        </Section>

        {blocked.length > 0 ? (
          <Section title="Comptes bloqués">
            {blocked.map((row) => (
              <View key={row.id} className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-3">
                <Text className="flex-1 text-[14px] font-semibold text-foreground">{row.username}</Text>
                <Pressable onPress={() => void unblock(row.userId)} className="rounded-2xl bg-secondary px-3 py-2">
                  <Text className="text-[12px] font-semibold text-muted-foreground">Débloquer</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        ) : null}

        <Section title="Abonnement">
          <Pressable
            onPress={() => router.push("/premium")}
            className="flex-row items-center justify-between rounded-3xl border border-border bg-card p-4"
          >
            <View>
              <Text className="font-semibold text-foreground">Lingo Premium</Text>
              <Text className="text-[12px] text-muted-foreground">Voir les avantages et gérer l'abonnement</Text>
            </View>
            <Text className="text-muted-foreground">›</Text>
          </Pressable>
        </Section>

        <Section title="Lier un appareil">
          <View className="rounded-3xl border border-border bg-card p-4">
            <Text className="text-[13px] text-muted-foreground">
              Générez un QR code pour connecter un autre appareil à votre compte Lingo. Valable 2 minutes,
              usage unique.
            </Text>
            {deviceToken ? (
              <View className="mt-4 items-center">
                <QrCode value={`lingo:login:${deviceToken.token}`} size={180} />
              </View>
            ) : null}
            <Button
              label={generatingToken ? "Génération…" : deviceToken ? "Générer un nouveau QR" : "Générer un QR"}
              loading={generatingToken}
              variant="secondary"
              onPress={() => void handleGenerateDeviceToken()}
              className="mt-3"
            />
          </View>
        </Section>

        <Section title="Zone sensible">
          <Pressable
            onPress={() => void handleExport()}
            disabled={exporting}
            className={`flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4 ${exporting ? "opacity-60" : ""}`}
          >
            <Text className="text-[18px]">⬇️</Text>
            <View className="flex-1">
              <Text className="font-semibold text-foreground">{exporting ? "Export en cours…" : "Exporter mes données"}</Text>
              <Text className="text-[12px] text-muted-foreground">Copie RGPD de tout ce que Lingo conserve sur vous</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
            className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4"
          >
            <Text className="text-[18px]">🗑️</Text>
            <View className="flex-1">
              <Text className="font-semibold text-destructive">Supprimer le compte</Text>
              <Text className="text-[12px] text-muted-foreground">Définitif, ne peut pas être annulé</Text>
            </View>
          </Pressable>
        </Section>

        <Button label="Se déconnecter" variant="secondary" onPress={signOut} />
      </ScrollView>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View className="flex-1 items-center justify-end bg-black/70 p-4">
          <View className="w-full rounded-3xl border border-border bg-card p-5">
            <Text className="text-[16px] font-bold text-foreground">Supprimer définitivement le compte ?</Text>
            <Text className="mt-1 text-[13px] text-muted-foreground">
              Tapez SUPPRIMER pour confirmer. Cette action est irréversible.
            </Text>
            <TextInput
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              placeholder="SUPPRIMER"
              placeholderTextColor="#9598a4"
              autoCapitalize="characters"
              className="mt-4 rounded-2xl border border-border bg-secondary px-4 py-3 text-[15px] text-foreground"
            />
            <View className="mt-4 flex-row gap-2">
              <Pressable onPress={() => setDeleteOpen(false)} className="flex-1 items-center rounded-2xl bg-secondary py-3">
                <Text className="font-semibold text-foreground">Annuler</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDelete()}
                disabled={deleteConfirm.trim() !== "SUPPRIMER" || deleting}
                className={`flex-1 items-center rounded-2xl bg-destructive py-3 ${deleteConfirm.trim() !== "SUPPRIMER" || deleting ? "opacity-50" : ""}`}
              >
                <Text className="font-semibold text-destructive-foreground">{deleting ? "Suppression…" : "Supprimer"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-3xl border border-border bg-card p-4">
      <View className="flex-1 pr-3">
        <Text className="font-semibold text-foreground">{label}</Text>
        <Text className="text-[12px] text-muted-foreground">{hint}</Text>
      </View>
      <Pressable onPress={() => onChange(!value)} className={`h-7 w-12 rounded-full p-1 ${value ? "bg-primary" : "bg-secondary"}`}>
        <View className={`h-5 w-5 rounded-full bg-background ${value ? "ml-5" : "ml-0"}`} />
      </Pressable>
    </View>
  );
}
