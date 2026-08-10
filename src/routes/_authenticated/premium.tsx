import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useT } from "@/lib/i18n";
import { isPaymentsConfigured, PREMIUM_PRICES } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/premium")({
  head: () => ({
    meta: [
      { title: "Lingo Premium — traductions illimitées" },
      {
        name: "description",
        content:
          "Passez à Lingo Premium : traductions illimitées, toutes les langues, thèmes de chat et réglages avancés.",
      },
      { property: "og:title", content: "Lingo Premium — traductions illimitées" },
      {
        property: "og:description",
        content: "Traductions illimitées, toutes les langues, thèmes premium et réglages avancés.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PremiumPage,
});

function PremiumPage() {
  const { t } = useT();
  const { data: user } = useCurrentUser();
  const subscription = useSubscription();
  const [selected, setSelected] = useState<string>(PREMIUM_PRICES.yearly);
  const [checkout, setCheckout] = useState<string | null>(null);
  const configured = isPaymentsConfigured();

  const FEATURES = [
    t("billing.featureUnlimited"),
    t("billing.featureAllLanguages"),
    t("billing.featureThemes"),
    t("billing.featureAdvanced"),
  ];

  const PLANS = [
    {
      id: PREMIUM_PRICES.monthly,
      label: t("billing.planMonthlyLabel"),
      price: "10,00 €",
      period: t("billing.planMonthlyPeriod"),
      note: t("billing.planMonthlyNote"),
    },
    {
      id: PREMIUM_PRICES.yearly,
      label: t("billing.planYearlyLabel"),
      price: "83,88 €",
      period: t("billing.planYearlyPeriod"),
      note: t("billing.planYearlyNote"),
    },
  ] as const;

  const emailQuery = useQuery({
    queryKey: ["auth", "email", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => user?.email ?? null,
  });

  if (checkout) {
    return (
      <AppShell title={t("billing.paymentTitle")} subtitle={t("billing.paymentSubtitle")}>
        <PaymentTestModeBanner />
        <div className="glass mt-3 overflow-hidden rounded-3xl p-2">
          <StripeEmbeddedCheckout
            priceId={checkout}
            userId={user?.id}
            customerEmail={emailQuery.data ?? undefined}
            returnUrl={`${window.location.origin}/subscription?checkout=success`}
          />
        </div>
        <button
          type="button"
          onClick={() => setCheckout(null)}
          className="mt-3 w-full rounded-3xl py-3 text-sm font-semibold text-muted-foreground"
        >
          {t("billing.backToOffers")}
        </button>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("billing.premiumTitle")} subtitle={t("billing.premiumSubtitle")}>
      <PaymentTestModeBanner />

      {subscription.isPremium ? (
        <div className="glass mt-3 rounded-3xl p-5">
          <p className="font-semibold">{t("billing.alreadyPremiumTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing.alreadyPremiumDesc")}</p>
          <Link
            to="/subscription"
            className="bg-brand mt-4 flex h-12 items-center justify-center rounded-3xl text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            {t("billing.manageSubscription")}
          </Link>
        </div>
      ) : (
        <>
          <section className="glass mt-3 rounded-3xl p-5">
            <span className="bg-brand mb-3 flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <ul className="space-y-2">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 space-y-2">
            <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              {t("billing.choosePlan")}
            </h2>
            {PLANS.map((plan) => {
              const active = selected === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelected(plan.id)}
                  className={`glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-all duration-300 active:scale-[0.98] ${
                    active ? "ring-2 ring-primary/60" : ""
                  }`}
                >
                  <span className="flex-1">
                    <span className="block font-semibold">{plan.label}</span>
                    <span className="block text-xs text-muted-foreground">{plan.note}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{plan.price}</span>
                    <span className="block text-[11px] text-muted-foreground">{plan.period}</span>
                  </span>
                </button>
              );
            })}
          </section>

          <button
            type="button"
            disabled={!configured || subscription.isLoading}
            onClick={() => setCheckout(selected)}
            className="bg-brand mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-3xl text-[15px] font-semibold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
          >
            {subscription.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("billing.upgradeToPremium")
            )}
          </button>
          <p className="mt-3 px-1 text-center text-[11px] text-muted-foreground">
            {t("billing.paymentMethodsNote")}
          </p>


        </>
      )}
    </AppShell>
  );
}
