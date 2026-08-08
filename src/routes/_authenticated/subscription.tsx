import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { createPortalSession, getBillingOverview } from "@/lib/billing.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "Mon abonnement — Lingo" },
      {
        name: "description",
        content:
          "Gérez votre abonnement Lingo : offre en cours, statut, renouvellement, moyen de paiement et factures.",
      },
      { property: "og:title", content: "Mon abonnement — Lingo" },
      {
        property: "og:description",
        content: "Offre en cours, factures téléchargeables, changement de formule et annulation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubscriptionPage,
});

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Période d'essai",
  past_due: "Paiement en retard",
  unpaid: "Paiement requis",
  canceled: "Annulé",
  incomplete: "Paiement incomplet",
  incomplete_expired: "Abonnement expiré",
  paused: "Suspendu",
};

const STATUS_DOTS: Record<string, string> = {
  active: "bg-emerald-500",
  trialing: "bg-sky-500",
  past_due: "bg-destructive",
  unpaid: "bg-destructive",
  canceled: "bg-muted-foreground",
  incomplete: "bg-amber-500",
  incomplete_expired: "bg-muted-foreground",
  paused: "bg-amber-500",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  paid: "Payée",
  open: "En attente",
  draft: "Brouillon",
  void: "Annulée",
  uncollectible: "Impayée",
};

const INTERVALS: Record<string, string> = {
  month: "mois",
  year: "an",
  week: "semaine",
  day: "jour",
};

const ACTIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"];

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: (currency ?? "eur").toUpperCase(),
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(value));
}

function SubscriptionPage() {
  const configured = isPaymentsConfigured();

  const billingQuery = useQuery({
    queryKey: ["billing-overview"],
    enabled: configured,
    queryFn: async () => {
      const result = await getBillingOverview({ data: { environment: getStripeEnvironment() } });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
  });

  const portal = useMutation({
    mutationFn: async () => {
      const result = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      if ("error" in result) throw new Error(result.error);
      return result.url;
    },
    onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (error) =>
      toast.error("Espace de facturation indisponible", {
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      }),
  });

  const subscriptions = billingQuery.data?.subscriptions ?? [];
  const subscription =
    subscriptions.find((s) => ACTIVE_STATUSES.includes(s.status)) ?? subscriptions[0] ?? null;
  const invoices = billingQuery.data?.invoices ?? [];
  const isPastDue = subscription?.status === "past_due" || subscription?.status === "unpaid";

  const openPortal = () => portal.mutate();

  return (
    <AppShell title="Mon abonnement" subtitle="Votre offre, votre facturation, en un endroit">
      {!configured ? (
        <div className="glass rounded-3xl p-5 text-sm text-muted-foreground">
          Les paiements ne sont pas encore actifs sur cette version de l'application.
        </div>
      ) : billingQuery.isLoading ? (
        <div className="glass flex items-center justify-center rounded-3xl p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : billingQuery.isError ? (
        <div className="glass rounded-3xl p-5 text-sm text-destructive">
          Impossible de charger votre abonnement pour le moment.
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          {isPastDue ? (
            <div className="mb-4 rounded-3xl border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="text-sm text-destructive">
                  <p className="font-semibold">Un problème est survenu avec votre paiement.</p>
                  <p className="mt-1 opacity-90">
                    Nous n'avons pas pu renouveler votre abonnement. Mettez à jour votre moyen de
                    paiement pour éviter l'interruption de Lingo Premium.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={portal.isPending}
                onClick={openPortal}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-semibold text-destructive-foreground active:scale-[0.98] disabled:opacity-50"
              >
                {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Mettre à jour mon moyen de paiement
              </button>
            </div>
          ) : null}

          <section className="mb-6">
            <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Offre en cours
            </h2>
            <div className="glass rounded-3xl p-5">
              {subscription ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">
                        {subscription.product_name ?? subscription.plan ?? "Lingo Premium"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatMoney(subscription.amount, subscription.currency)}
                        {subscription.interval
                          ? ` / ${INTERVALS[subscription.interval] ?? subscription.interval}`
                          : ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold">
                      <span
                        className={`h-2 w-2 rounded-full ${STATUS_DOTS[subscription.status] ?? "bg-muted-foreground"}`}
                      />
                      {STATUS_LABELS[subscription.status] ?? subscription.status}
                    </span>
                  </div>

                  {subscription.cancel_at_period_end ? (
                    <div className="mt-4 flex items-start gap-2 rounded-2xl bg-secondary/60 p-3 text-xs">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="block font-semibold">Annulation programmée</span>
                        <span className="block text-muted-foreground">
                          Votre accès à Lingo Premium reste disponible jusqu'au{" "}
                          {formatDate(subscription.current_period_end)}.
                        </span>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Prochain renouvellement le {formatDate(subscription.current_period_end)}.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={portal.isPending}
                    onClick={openPortal}
                    className="bg-brand mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-3xl text-sm font-semibold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
                  >
                    {portal.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Gérer mon abonnement
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Lingo Free</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Offre gratuite — 5 000 traductions incluses.
                      </p>
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold">
                      Gratuit
                    </span>
                  </div>
                  <Link
                    to="/premium"
                    className="bg-brand mt-4 flex h-12 items-center justify-center gap-2 rounded-3xl text-sm font-semibold text-primary-foreground active:scale-[0.98]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Passer à Premium
                  </Link>
                </>
              )}
            </div>
          </section>

          {subscription ? (
            <section className="mb-6">
              <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                Facturation
              </h2>
              <div className="glass rounded-3xl p-5">
                <p className="text-sm text-muted-foreground">
                  Moyen de paiement, changement de formule et annulation sont gérés de manière
                  sécurisée via Stripe. L'espace de facturation s'ouvre dans un nouvel onglet.
                </p>
                <button
                  type="button"
                  disabled={portal.isPending}
                  onClick={openPortal}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-3xl bg-secondary text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
                >
                  {portal.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Gérer la facturation
                </button>
              </div>
            </section>
          ) : null}

          <section className="mb-6">
            <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Factures
            </h2>
            {invoices.length === 0 ? (
              <div className="glass rounded-3xl p-5 text-sm text-muted-foreground">
                Aucune facture pour le moment.
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((invoice) => {
                  const url = invoice.pdf_url ?? invoice.hosted_invoice_url;
                  return (
                    <div
                      key={invoice.id}
                      className="glass flex items-center gap-3 rounded-3xl p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{formatDate(invoice.created)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {invoice.plan ?? "Abonnement"} ·{" "}
                          {formatMoney(invoice.amount_paid, invoice.currency)} ·{" "}
                          {INVOICE_STATUS_LABELS[invoice.status ?? ""] ?? (invoice.status ?? "—")}
                        </p>
                      </div>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-10 items-center gap-2 rounded-2xl bg-secondary px-3 text-xs font-semibold active:scale-[0.98]"
                        >
                          <Download className="h-4 w-4" />
                          PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Indisponible</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
