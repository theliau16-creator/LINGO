import { useT } from "@/lib/i18n";

const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

export function PaymentTestModeBanner() {
  const { t } = useT();
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-center text-xs text-destructive">
        {t("billing.paymentsNotConfiguredBanner")}
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs text-muted-foreground">
        {t("billing.testModeBanner")}
      </div>
    );
  }
  return null;
}
