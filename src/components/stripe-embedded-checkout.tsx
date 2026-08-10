import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { createCheckoutSession } from "@/lib/payments.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

export function StripeEmbeddedCheckout({
  priceId,
  customerEmail,
  userId,
  returnUrl,
}: {
  priceId: string;
  customerEmail?: string | undefined;
  userId?: string | undefined;
  returnUrl?: string | undefined;
}) {
  const { t } = useT();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setClientSecret(null);
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await createCheckoutSession({
          data: {
            priceId,
            ...(customerEmail ? { customerEmail } : {}),
            ...(userId ? { userId } : {}),
            returnUrl: returnUrl || window.location.href,
            environment: getStripeEnvironment(),
          },
        });
        if (cancelled) return;
        if ("error" in result) throw new Error(result.error);
        if (!result.clientSecret) throw new Error(t("billing.checkoutInvalidSession"));
        setClientSecret(result.clientSecret);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("billing.checkoutUnknownError"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceId, customerEmail, userId, returnUrl, attempt]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="font-semibold">{t("billing.checkoutLoadError")}</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="bg-brand mt-2 h-11 rounded-3xl px-6 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
        >
          {t("billing.retry")}
        </button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("billing.checkoutLoading")}
      </div>
    );
  }

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
