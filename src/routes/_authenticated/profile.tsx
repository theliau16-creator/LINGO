import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, FlaskConical, Loader2, QrCode, ScanLine, Sparkles, Trash2 } from "lucide-react";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/app-shell";
import { BottomSheet } from "@/components/bottom-sheet";
import { ContactActions } from "@/components/contact-actions";
import { GlobalSearch } from "@/components/global-search";
import { QrCode as QrImage } from "@/components/qr-code";
import { QrScanner } from "@/components/qr-scanner";
import { useCurrentUser, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/chat-theme";
import { deleteMyAccount } from "@/lib/account.functions";
import { useT } from "@/lib/i18n";
import { issueDeviceLinkToken } from "@/lib/device-link.functions";
import { languageFlag, languageLabel } from "@/lib/languages";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profil — Lingo" },
      { name: "description", content: "Votre pseudo, votre langue et votre QR code sur Lingo." },
      { property: "og:title", content: "Profil — Lingo" },
      {
        property: "og:description",
        content: "Votre pseudo, votre langue et votre QR code sur Lingo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const requestLinkToken = useServerFn(issueDeviceLinkToken);
  const { t } = useT();

  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState("fr");
  const [showQr, setShowQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const removeAccount = useServerFn(deleteMyAccount);

  const deleteAccountMutation = useMutation({
    mutationFn: async () => removeAccount({ data: { confirmation: deleteConfirm.trim() } }),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut();
      window.location.assign("/");
    },
    onError: (error) =>
      toast.error("Suppression impossible", {
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      }),
  });

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username ?? "");
    setLanguage(profile.primary_language ?? "fr");
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ username: username.trim(), primary_language: language })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("profile.updated"));
    },
    onError: (error) =>
      toast.error(t("common.saveFailed"), {
        description: error instanceof Error ? error.message : t("common.retry"),
      }),
  });

  const friendCount = useQuery({
    queryKey: ["friend-count", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { count } = await supabase
        .from("friendships")
        .select("friend_id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      return count ?? 0;
    },
  });

  const scannedProfile = useQuery({
    queryKey: ["scanned-profile", scannedId],
    enabled: Boolean(scannedId),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, primary_language")
        .eq("id", scannedId!)
        .maybeSingle();
      return data;
    },
  });

  const linkDevice = useMutation({
    mutationFn: async () => requestLinkToken({}),
    onSuccess: (result) => {
      setDeviceToken(result.token);
      toast.success(t("profile.qrValid"));
    },
    onError: (error) =>
      toast.error(t("profile.qrUnavailable"), {
        description: error instanceof Error ? error.message : t("common.retry"),
      }),
  });

  function handleScan(value: string) {
    setScanning(false);
    const match = /^lingo:user:([0-9a-f-]{36})$/i.exec(value.trim());
    if (!match) {
      toast.error(t("profile.qrUnknown"));
      return;
    }
    haptic([10, 40, 10]);
    setScannedId(match[1] ?? null);
  }

  async function downloadQr() {
    const image = document.querySelector<HTMLImageElement>("img[data-qr-image]");
    if (!image) return;
    const link = document.createElement("a");
    link.href = image.src;
    link.download = `lingo-${profile?.username ?? "qr"}.png`;
    link.click();
  }

  async function shareQr() {
    const url = `${window.location.origin}/?u=${user?.id ?? ""}`;
    if (navigator.share) {
      await navigator.share({ title: t("profile.myLingoProfile"), url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success(t("profile.linkCopied"));
  }

  return (
    <AppShell title={t("profile.title")} subtitle={t("profile.subtitle")}>
      <div className="glass animate-rise flex flex-col items-center rounded-3xl px-6 py-8">
        <Avatar name={profile?.username} url={profile?.avatar_url} size={88} ring />
        <p className="mt-4 text-xl font-bold">{profile?.username ?? "…"}</p>
        <p className="text-sm text-muted-foreground">{user?.email ?? profile?.phone}</p>
        <div className="mt-5 flex gap-3">
          <Stat label={t("profile.friends")} value={friendCount.data ?? 0} />
          <Stat label={t("profile.language")} value={language.toUpperCase()} />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <GlobalSearch onOpenQr={() => setScanning(true)} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              haptic();
              setShowQr(true);
            }}
            className="glass flex flex-1 items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-semibold active:scale-95"
          >
            <QrCode className="h-4 w-4" /> {t("profile.myQr")}
          </button>
          <button
            type="button"
            onClick={() => {
              haptic();
              setScanning(true);
            }}
            className="glass flex flex-1 items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-semibold active:scale-95"
          >
            <ScanLine className="h-4 w-4" /> {t("profile.scan")}
          </button>
        </div>

        <Field label={t("profile.username")} value={username} onChange={setUsername} />

        <div className="pt-1">
          <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            {t("profile.subscription")}
          </h2>
          <Link
            to="/subscription"
            className="glass flex items-center gap-3 rounded-3xl p-4 active:scale-[0.98]"
          >
            <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
              <CreditCard className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t("profile.manageSub")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("profile.manageSubHint")}
              </span>
            </span>
          </Link>
          <Link
            to="/premium"
            className="glass mt-2 flex items-center gap-3 rounded-3xl p-4 active:scale-[0.98]"
          >
            <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t("profile.discoverPremium")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("profile.discoverPremiumHint")}
              </span>
            </span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="bg-brand shadow-glow flex h-14 w-full items-center justify-center gap-2 rounded-3xl text-base font-semibold text-primary-foreground active:scale-[0.97] disabled:opacity-60"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("common.save")}
        </button>

        <Link
          to="/playground"
          className="glass flex items-center gap-3 rounded-3xl p-4 active:scale-[0.98]"
        >
          <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
            <FlaskConical className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t("settings.playground")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("settings.playgroundHint")}
            </span>
          </span>
        </Link>
      </div>


      <section className="mt-8">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-destructive uppercase">
          Zone sensible
        </h2>
        <button
          type="button"
          onClick={() => {
            haptic();
            setDeleteConfirm("");
            setDeleting(true);
          }}
          className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left active:scale-[0.98]"
        >
          <span className="bg-destructive/15 text-destructive flex h-10 w-10 items-center justify-center rounded-2xl">
            <Trash2 className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-destructive">Supprimer mon compte</span>
            <span className="block text-xs text-muted-foreground">
              Efface définitivement votre profil, vos discussions et votre abonnement.
            </span>
          </span>
        </button>
      </section>

      <BottomSheet open={deleting} onClose={() => setDeleting(false)} title="Supprimer mon compte">
        <p className="text-sm text-muted-foreground">
          Cette action est irréversible. Votre abonnement est annulé et vos données personnelles
          sont supprimées. Tapez <strong>SUPPRIMER</strong> pour confirmer.
        </p>
        <input
          value={deleteConfirm}
          onChange={(event) => setDeleteConfirm(event.target.value)}
          aria-label="Confirmation de suppression"
          placeholder="SUPPRIMER"
          className="bg-secondary/60 mt-4 w-full rounded-2xl px-4 py-3 text-sm outline-none"
        />
        <button
          type="button"
          disabled={deleteConfirm.trim() !== "SUPPRIMER" || deleteAccountMutation.isPending}
          onClick={() => deleteAccountMutation.mutate()}
          className="bg-destructive text-destructive-foreground mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold active:scale-95 disabled:opacity-50"
        >
          {deleteAccountMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Supprimer définitivement
        </button>
      </BottomSheet>

      <BottomSheet open={showQr} onClose={() => setShowQr(false)} title={t("profile.myQr")}>
        <div className="flex flex-col items-center">
          <Avatar name={profile?.username} url={profile?.avatar_url} size={64} ring />
          <p className="mt-3 font-semibold">@{profile?.username}</p>
          <p className="mb-4 text-xs text-muted-foreground">
            {languageFlag(profile?.primary_language)} {languageLabel(profile?.primary_language)}
          </p>
          {user?.id ? <QrImage value={`lingo:user:${user.id}`} /> : null}
          <div className="mt-4 flex w-full gap-2">
            <button
              type="button"
              onClick={() => void shareQr()}
              className="glass flex-1 rounded-2xl py-3 text-sm font-semibold active:scale-95"
            >
              {t("profile.share")}
            </button>
            <button
              type="button"
              onClick={() => void downloadQr()}
              className="glass flex-1 rounded-2xl py-3 text-sm font-semibold active:scale-95"
            >
              {t("common.save")}
            </button>
          </div>

          <div className="mt-6 w-full border-t border-border/50 pt-5">
            <p className="text-sm font-semibold">{t("profile.linkDevice")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("profile.linkDeviceHint")}</p>
            {deviceToken ? (
              <div className="mt-3 flex justify-center">
                <QrImage value={`lingo:login:${deviceToken}`} size={180} />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => linkDevice.mutate()}
              disabled={linkDevice.isPending}
              className="bg-brand shadow-glow mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-60"
            >
              {linkDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {deviceToken ? t("profile.newQr") : t("profile.generateQr")}
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={scanning}
        onClose={() => setScanning(false)}
        title={t("profile.scanTitle")}
      >
        {scanning ? <QrScanner onResult={handleScan} /> : null}
        <p className="mt-3 text-center text-xs text-muted-foreground">{t("profile.scanHint")}</p>
      </BottomSheet>

      <BottomSheet
        open={Boolean(scannedId)}
        onClose={() => setScannedId(null)}
        title={t("profile.scanned")}
      >
        {scannedProfile.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : scannedProfile.data ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Avatar
              name={scannedProfile.data.username}
              url={scannedProfile.data.avatar_url}
              size={72}
              ring
            />
            <p className="text-lg font-bold">@{scannedProfile.data.username}</p>
            <p className="text-xs text-muted-foreground">
              {languageFlag(scannedProfile.data.primary_language)}{" "}
              {languageLabel(scannedProfile.data.primary_language)}
            </p>
            <ContactActions profileId={scannedProfile.data.id} />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("profile.notFound")}</p>
        )}
      </BottomSheet>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-secondary/60 rounded-2xl px-5 py-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="glass block rounded-3xl px-5 py-3">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-[15px] outline-none"
      />
    </label>
  );
}
