import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SubscriptionRow = {
  id: string;
  status: string;
  plan: string | null;
  product_name: string | null;
  amount: number | null;
  currency: string | null;
  interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type InvoiceRow = {
  id: string;
  status: string | null;
  amount_paid: number;
  currency: string;
  created: string | null;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
  plan: string | null;
};

export type BillingResult =
  | { subscriptions: SubscriptionRow[]; invoices: InvoiceRow[] }
  | { error: string };

export const getBillingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: "sandbox" | "live" }) => data)
  .handler(async ({ data, context }): Promise<BillingResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const {
        findCustomerIds,
        fetchSubscriptionsForCustomers,
        fetchInvoicesForCustomers,
      } = await import("@/lib/billing.server");

      const customerIds = await findCustomerIds(stripe, {
        userId,
        ...(user?.email ? { email: user.email } : {}),
      });
      if (customerIds.length === 0) return { subscriptions: [], invoices: [] };

      const [subscriptions, invoices] = await Promise.all([
        fetchSubscriptionsForCustomers(stripe, customerIds),
        fetchInvoicesForCustomers(stripe, customerIds),
      ]);
      return { subscriptions, invoices };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export type PortalResult = { url: string } | { error: string };

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: "sandbox" | "live" }) => data)
  .handler(async ({ data, context }): Promise<PortalResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const { userId, supabase } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);
      const { findCustomerIds } = await import("@/lib/billing.server");

      const customerIds = await findCustomerIds(stripe, {
        userId,
        ...(user?.email ? { email: user.email } : {}),
      });
      if (customerIds.length === 0) return { error: "Aucun abonnement trouvé." };

      const portal = await stripe.billingPortal.sessions.create({
        customer: customerIds[0]!,
        ...(data.returnUrl ? { return_url: data.returnUrl } : {}),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
