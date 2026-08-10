import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Ban, Bell, Check, CheckCheck, Eye, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useCurrentUser, useProfile } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useDeveloperMode";
import { QuotaCard } from "@/components/quota-card";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/chat-theme";
import { useLocale, useT } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/languages";
import { NotificationService } from "@/services/notifications";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Réglages — Lingo" },
      { name: "description", content: "Moteur de traduction, traduction automatique et compte." },
      { property: "og:title", content: "Réglages — Lingo" },
      {
        property: "og:description",
        content: "Moteur de traduction, traduction automatique et compte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const { t } = useT();
  const { setLocale } = useLocale();

  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();

  const settingsQuery = useQuery({
    queryKey: ["user-settings", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const blockedQuery = useQuery({
    queryKey: ["blocked-users", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("blocked_users")
        .select("id, blocked_id")
        .eq("user_id", user!.id);
      const ids = (rows ?? []).map((row) => row.blocked_id);
      if (ids.length === 0) return [] as { id: string; userId: string; username: string }[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", ids);
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
      return (rows ?? []).map((row) => ({
        id: row.id,
        userId: row.blocked_id,
        username: nameById.get(row.blocked_id) ?? "Compte",
      }));
    },
  });

  const unblock = useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase
        .from("blocked_users")
        .delete()
        .eq("user_id", user!.id)
        .eq("blocked_id", blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("social.settings.unblockedToast"));
      void queryClient.invalidateQueries({ queryKey: ["blocked-users"] });
      void queryClient.invalidateQueries({ queryKey: ["contact-state"] });
    },
    onError: () => toast.error(t("social.settings.actionFailedToast")),
  });

  const update = useMutation({
    mutationFn: async (patch: {
      auto_translate?: boolean;
      show_online_status?: boolean;
      read_receipts_enabled?: boolean;
    }) => {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user!.id, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-settings"] }),
    onError: (error) =>
      toast.error(t("settings.settingFailed"), {
        description: error instanceof Error ? error.message : t("common.retry"),
      }),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const auto = settingsQuery.data?.auto_translate ?? true;
  const showOnline = settingsQuery.data?.show_online_status ?? true;
  const readReceipts = settingsQuery.data?.read_receipts_enabled ?? true;
  const language = profile?.primary_language ?? "fr";
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const activeLanguage = selectedLanguage ?? language;

  const updateLanguage = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ primary_language: code })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: async (_result, code) => {
      // La langue pilote l'affichage des traductions partout : on rafraîchit
      // le profil, les conversations et les messages déjà chargés.
      setSelectedLanguage(null);
      // The language selector is the single source of truth for the whole app
      // language: switch the interface instantly, without a reload.
      setLocale(code);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversation-peer"] });
      toast.success(t("social.settings.languageChangedToast"), {
        description: t("social.settings.languageChangedHint"),
      });
    },
    onError: (error) =>
      toast.error(t("settings.languageFailed"), {
        description: error instanceof Error ? error.message : t("common.retry"),
      }),
  });

  return (
    <AppShell title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("settings.engine")}
        </h2>
        <div className="glass mb-2 flex items-center gap-3 rounded-3xl p-4">
          <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Lingo AI</p>
            <p className="text-xs text-muted-foreground">
              {t("social.settings.engineDesc")}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-primary">{t("settings.active")}</span>
        </div>
        <QuotaCard />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("settings.translation")}
        </h2>
        <div className="glass flex items-center justify-between rounded-3xl p-4">
          <div>
            <p className="font-semibold">{t("settings.auto")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.autoHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            onClick={() => update.mutate({ auto_translate: !auto })}
            className={`h-7 w-12 rounded-full p-1 transition-colors duration-300 ${
              auto ? "bg-brand" : "bg-secondary"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-background transition-transform duration-300 ${
                auto ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("settings.myLanguage")}
        </h2>
        <div className="glass rounded-3xl px-5 py-4">
          <p className="mb-3 text-xs text-muted-foreground">{t("settings.myLanguageHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  haptic();
                  setSelectedLanguage(item.code);
                }}
                className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition-all duration-300 ${
                  activeLanguage === item.code
                    ? "bg-brand shadow-glow font-semibold text-primary-foreground"
                    : "bg-secondary/60 text-muted-foreground"
                }`}
              >
                <span>{item.flag}</span>
                <span className="truncate">{item.native}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={updateLanguage.isPending}
          onClick={() => {
            haptic();
            updateLanguage.mutate(activeLanguage);
          }}
          className="bg-brand shadow-glow mt-3 flex w-full items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-semibold text-primary-foreground transition-transform duration-300 active:scale-[0.98] disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {updateLanguage.isPending ? t("common.saving") : t("common.save")}
        </button>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("social.settings.privacy")}
        </h2>

        <div className="glass mb-2 flex items-center justify-between rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
              <Eye className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">{t("social.settings.onlineStatus")}</p>
              <p className="text-xs text-muted-foreground">
                {t("social.settings.onlineStatusHint")}
              </p>
            </div>
          </div>
          <Switch
            checked={showOnline}
            onChange={(value) => update.mutate({ show_online_status: value })}
            label={t("social.settings.onlineStatus")}
          />
        </div>

        <div className="glass mb-2 flex items-center justify-between rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
              <CheckCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">{t("social.settings.readReceipts")}</p>
              <p className="text-xs text-muted-foreground">
                {t("social.settings.readReceiptsHint")}
              </p>
            </div>
          </div>
          <Switch
            checked={readReceipts}
            onChange={(value) => update.mutate({ read_receipts_enabled: value })}
            label={t("social.settings.readReceipts")}
          />
        </div>

        <button
          type="button"
          onClick={async () => {
            haptic();
            const granted = await NotificationService.request();
            if (granted) {
              toast.success(t("social.settings.notificationsEnabledTitle"));
              void NotificationService.notify({
                title: "Lingo",
                body: t("social.settings.notificationsReadyBody"),
              });
            } else {
              toast.error(t("social.settings.notificationsDeniedTitle"), {
                description: t("social.settings.notificationsDeniedDesc"),
              });
            }
          }}
          className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left active:scale-[0.98]"
        >
          <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
            <Bell className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t("social.settings.notifications")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("social.settings.notificationsHint")}
            </span>
          </span>
        </button>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("social.settings.blockedAccounts")}
        </h2>
        <div className="glass space-y-2 rounded-3xl p-4">
          {(blockedQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("social.settings.blockedAccountsEmpty")}
            </p>
          ) : (
            (blockedQuery.data ?? []).map((row) => (
              <div key={row.id} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground">
                  <Ban className="h-4 w-4" />
                </span>
                <p className="flex-1 truncate text-sm font-semibold">{row.username}</p>
                <button
                  type="button"
                  disabled={unblock.isPending}
                  onClick={() => {
                    haptic();
                    unblock.mutate(row.userId);
                  }}
                  className="rounded-2xl bg-secondary/60 px-3 py-2 text-xs font-semibold text-muted-foreground active:scale-95 disabled:opacity-50"
                >
                  {t("social.settings.unblock")}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("settings.dev")}
        </h2>


        {isAdmin ? (
          <Link
            to="/admin"
            className="glass flex items-center gap-3 rounded-3xl p-4 active:scale-[0.98]"
          >
            <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t("social.settings.admin")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("social.settings.adminHint")}
              </span>
            </span>
          </Link>
        ) : null}
      </section>


      <button
        type="button"
        onClick={signOut}
        className="glass flex w-full items-center justify-center gap-2 rounded-3xl py-4 text-sm font-semibold text-destructive active:scale-[0.98]"
      >
        <LogOut className="h-4 w-4" /> {t("settings.signOut")}
      </button>
    </AppShell>
  );
}

/** Small accessible toggle used by the privacy settings. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic();
        onChange(!checked);
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
        checked ? "bg-brand" : "bg-secondary"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background transition-transform duration-300 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
