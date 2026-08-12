import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import { useQuota } from "@/lib/use-quota";
import { useUserSettings } from "@/lib/use-user-settings";
import { useBlockedUsers } from "@/lib/use-blocked-users";
import { useAccount } from "@/lib/use-account";
import { useFriends } from "@/lib/use-friends";
import { supabase } from "@/lib/supabase";
import { LANGUAGES } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { QuotaCard } from "@/components/quota-card";

/**
 * Profil + Réglages + compte (Phase 6), fondu dans l'onglet Profil unique
 * (pas de 4e onglet dédié) — même contenu que src/routes/_authenticated/
 * {profile,settings}.tsx, sans avatar upload (n'existe pas côté web non
 * plus : avatar_url n'est jamais modifiable après l'inscription), sans
 * sélecteur de moteur de traduction (un seul moteur, "Lingo AI", pas de
 * choix utilisateur côté web), sans notifications/QR/device-link/admin
 * (hors scope de cette phase).
 */
export default function Profile() {
  const { session, signOut } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { quota, isLoading: quotaLoading } = useQuota();
  const { settings, update: updateSettings } = useUserSettings();
  const { blocked, unblock } = useBlockedUsers();
  const { friends } = useFriends();
  const { deleting, exporting, deleteAccount, exportData } = useAccount();

  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState("fr");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
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
