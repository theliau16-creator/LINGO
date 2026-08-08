const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-center text-xs text-destructive">
        Les paiements réels ne sont pas encore configurés.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-xs text-muted-foreground">
        Mode test : aucun paiement réel n'est effectué dans l'aperçu.
      </div>
    );
  }
  return null;
}
