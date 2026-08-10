import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Phone, QrCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PhoneAuth } from "@/components/phone-auth";
import { QrScanner } from "@/components/qr-scanner";
import { redeemDeviceLinkToken } from "@/lib/device-link.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const raw = s["next"];
    return typeof raw === "string" && raw.startsWith("/") ? { next: raw } : {};
  },

  head: () => ({
    meta: [
      { title: "Connexion — Lingo" },
      {
        name: "description",
        content: "Connectez-vous à Lingo avec Google, Apple ou votre adresse e-mail.",
      },
      { property: "og:title", content: "Connexion — Lingo" },
      { property: "og:description", content: "Rejoignez la messagerie sans barrière de langue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useT();
  const { next } = Route.useSearch();
  const goAfterAuth = () => {
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/chats", replace: true });
  };
  const authRedirectUrl = () =>
    typeof window === "undefined" ? "" : window.location.origin + (next ?? "");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  const [qrMode, setQrMode] = useState(false);

  async function handleQrResult(value: string) {
    if (!value.startsWith("lingo:login:")) {
      toast.error(t("auth.qrInvalidTitle"), { description: t("auth.qrInvalidDesc") });
      setQrMode(false);
      return;
    }
    setLoading(true);
    try {
      const { tokenHash } = await redeemDeviceLinkToken({
        data: { token: value.replace("lingo:login:", "") },
      });
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (error) throw error;
      goAfterAuth();
    } catch (error) {
      toast.error(t("auth.qrFailedTitle"), {
        description: error instanceof Error ? error.message : t("auth.qrFailedFallback"),
      });
      setQrMode(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) {
      setLoading(false);
      toast.error(t("auth.oauthFailedTitle"), { description: error.message });
      return;
    }
    // signInWithOAuth redirects the browser away; nothing more to do here.
  }

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirectUrl(),
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(t("auth.checkEmailTitle"), {
            description: t("auth.checkEmailDesc"),
          });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goAfterAuth();
    } catch (error) {
      toast.error(t("auth.failedTitle"), {
        description: error instanceof Error ? error.message : t("auth.failedFallback"),
      });
    } finally {
      setLoading(false);
    }
  }

  if (qrMode) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 pt-6 pb-10">
        <button
          type="button"
          onClick={() => setQrMode(false)}
          className="glass flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="animate-rise mt-8">
          <h2 className="text-3xl font-bold tracking-tight">{t("auth.scanQrTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.scanQrHint")}
          </p>
          <div className="mt-6">
            <QrScanner onResult={(value) => void handleQrResult(value)} />
          </div>
          {loading ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("auth.signingIn")}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (phoneMode) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 pt-6 pb-10">
        <PhoneAuth onBack={() => setPhoneMode(false)} onSuccess={() => goAfterAuth()} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 pt-6 pb-10">
      <Link
        to="/"
        className="glass flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="animate-rise mt-10">
        <h1 className="text-4xl font-bold tracking-tight">
          {mode === "signin" ? t("auth.welcomeBack") : t("auth.createAccount")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? t("auth.signinSubtitle")
            : t("auth.signupSubtitle")}
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => handleOAuth("google")}
          className="glass-strong flex h-14 w-full items-center justify-center gap-3 rounded-3xl text-[15px] font-semibold transition-transform duration-300 active:scale-[0.97] disabled:opacity-60"
        >
          <GoogleMark /> {t("auth.continueWithGoogle")}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleOAuth("apple")}
          className="glass-strong flex h-14 w-full items-center justify-center gap-3 rounded-3xl text-[15px] font-semibold transition-transform duration-300 active:scale-[0.97] disabled:opacity-60"
        >
          <AppleMark /> {t("auth.continueWithApple")}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => setPhoneMode(true)}
          className="glass-strong flex h-14 w-full items-center justify-center gap-3 rounded-3xl text-[15px] font-semibold transition-transform duration-300 active:scale-[0.97] disabled:opacity-60"
        >
          <Phone className="h-5 w-5" /> {t("auth.continueWithPhone")}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => setQrMode(true)}
          className="glass-strong flex h-14 w-full items-center justify-center gap-3 rounded-3xl text-[15px] font-semibold transition-transform duration-300 active:scale-[0.97] disabled:opacity-60"
        >
          <QrCode className="h-5 w-5" /> {t("auth.signInWithQr")}
        </button>
      </div>

      <div className="my-7 flex items-center gap-4 text-[11px] tracking-widest text-muted-foreground uppercase">
        <span className="h-px flex-1 bg-border" /> {t("auth.or")} <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        {mode === "signup" ? (
          <Field
            label={t("auth.nickname")}
            value={username}
            onChange={setUsername}
            placeholder={t("auth.nicknamePlaceholder")}
            autoComplete="nickname"
          />
        ) : null}
        <Field
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          required
        />
        <Field
          label={t("auth.password")}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-brand shadow-glow flex h-14 w-full items-center justify-center gap-2 rounded-3xl text-base font-semibold text-primary-foreground transition-transform duration-300 active:scale-[0.97] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "signin" ? t("auth.signIn") : t("auth.createMyAccount")}
        </button>

        {mode === "signin" ? (
          <button
            type="button"
            onClick={async () => {
              if (!email.trim()) {
                toast.error(t("auth.enterEmailTitle"), {
                  description: t("auth.enterEmailDesc"),
                });
                return;
              }
              const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) {
                toast.error(t("auth.resetSendFailedTitle"), {
                  description: t("auth.resetSendFailedDesc"),
                });
                return;
              }
              toast.success(t("auth.resetSentTitle"), {
                description: t("auth.resetSentDesc"),
              });
            }}
            className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("auth.forgotPassword")}
          </button>
        ) : null}
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-6 text-center text-sm text-muted-foreground"
      >
        {mode === "signin" ? (
          <>
            {t("auth.noAccountYet")}{" "}
            <span className="font-semibold text-foreground">{t("auth.signUpCta")}</span>
          </>
        ) : (
          <>
            {t("auth.alreadyRegistered")} <span className="font-semibold text-foreground">{t("auth.signInCta")}</span>
          </>
        )}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="glass block rounded-3xl px-5 py-3">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
      />
    </label>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M16.4 12.8c0-2.6 2.1-3.9 2.2-4-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.5 0 2 .8 3.3.8s2.2-1.2 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9-.1 0-2.6-1-2.6-3.9ZM14 4.9c.7-.9 1.2-2.1 1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}
