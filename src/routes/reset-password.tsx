import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Lingo" },
      {
        name: "description",
        content: "Choisissez un nouveau mot de passe pour votre compte Lingo en toute sécurité.",
      },
      { property: "og:title", content: "Nouveau mot de passe — Lingo" },
      {
        property: "og:description",
        content: "Réinitialisez le mot de passe de votre compte Lingo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type LinkState = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useT();
  const [state, setState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // Supabase turns the recovery link into a session and emits PASSWORD_RECOVERY.
  useEffect(() => {
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        done = true;
        setState("ready");
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      setState(data.session ? "ready" : "invalid");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordTooShortTitle"), { description: t("auth.passwordTooShortDesc") });
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(t("auth.updateFailedTitle"), { description: error.message });
      return;
    }
    toast.success(t("auth.passwordUpdated"));
    await navigate({ to: "/chats", replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.newPasswordTitle")}</h1>

      {state === "checking" ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("auth.verifyingLink")}
        </p>
      ) : null}

      {state === "invalid" ? (
        <div className="glass mt-6 rounded-3xl p-5">
          <p className="text-sm text-muted-foreground">
            {t("auth.linkExpired")}
          </p>
          <button
            type="button"
            onClick={() => void navigate({ to: "/auth" })}
            className="mt-4 w-full rounded-3xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            {t("auth.backToSignIn")}
          </button>
        </div>
      ) : null}

      {state === "ready" ? (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.newPasswordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="glass w-full rounded-3xl px-4 py-3 text-sm outline-none"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.confirmPasswordPlaceholder")}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="glass w-full rounded-3xl px-4 py-3 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-3xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {t("auth.save")}
          </button>
        </form>
      ) : null}
    </main>
  );
}
