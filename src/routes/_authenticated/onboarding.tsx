import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/chat-theme";
import { COUNTRIES } from "@/lib/countries";
import { detectCountry, languageForCountry } from "@/lib/country-language";
import { useT } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/languages";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Choisissez votre langue — Lingo" },
      {
        name: "description",
        content: "Sélectionnez votre pays et votre langue : Lingo traduit tout le reste.",
      },
      { property: "og:title", content: "Choisissez votre langue — Lingo" },
      {
        property: "og:description",
        content: "Sélectionnez votre pays et votre langue : Lingo traduit tout le reste.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useT();

  const [country, setCountry] = useState(() => detectCountry());
  const [language, setLanguage] = useState(() => languageForCountry(detectCountry()));
  const [touchedLanguage, setTouchedLanguage] = useState(false);

  // Le pays pilote la langue tant que l'utilisateur n'en a pas choisi une.
  useEffect(() => {
    if (!touchedLanguage) setLanguage(languageForCountry(country));
  }, [country, touchedLanguage]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ country, primary_language: language })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      haptic();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      toast.success(t("onboarding.ready"), {
        description: t("onboarding.readyHint"),
      });
      navigate({ to: "/chats", replace: true });
    },
    onError: (error) =>
      toast.error(t("common.saveFailed"), {
        description: error instanceof Error ? error.message : t("common.retry"),
      }),
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 pt-12 pb-10">
      <div className="animate-rise">
        <span className="bg-brand shadow-glow flex h-12 w-12 items-center justify-center rounded-2xl text-primary-foreground">
          <Globe className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">
          {t("onboarding.welcome")}{profile?.username ? `, ${profile.username}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("onboarding.intro")}
        </p>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("onboarding.country")}
        </h2>
        <div className="glass rounded-3xl px-5 py-4">
          <select
            value={country}
            onChange={(event) => {
              haptic();
              setTouchedLanguage(false);
              setCountry(event.target.value);
            }}
            aria-label="Pays"
            className="w-full bg-transparent text-[15px] outline-none"
          >
            {COUNTRIES.map((item) => (
              <option key={item.code} value={item.code} className="bg-background">
                {item.flag} {item.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t("settings.myLanguage")}
        </h2>
        <div className="glass rounded-3xl px-5 py-4">
          <p className="mb-3 text-xs text-muted-foreground">
            {t("settings.myLanguageHint")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  haptic();
                  setTouchedLanguage(true);
                  setLanguage(item.code);
                }}
                className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition-all duration-300 ${
                  language === item.code
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
      </section>

      <button
        type="button"
        disabled={save.isPending || !user}
        onClick={() => save.mutate()}
        className="bg-brand shadow-glow mt-4 flex w-full items-center justify-center gap-2 rounded-3xl py-4 text-sm font-semibold text-primary-foreground transition-transform duration-300 active:scale-[0.98] disabled:opacity-60"
      >
        <Check className="h-4 w-4" />
        {save.isPending ? t("common.saving") : t("onboarding.continue")}
      </button>

      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("lingo:onboarding-skipped", "1");
          navigate({ to: "/chats", replace: true });
        }}

        className="mt-4 text-center text-sm text-muted-foreground"
      >
        {t("onboarding.later")}
      </button>
    </div>
  );
}
