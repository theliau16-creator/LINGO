import type Stripe from "stripe";
import type { InvoiceRow, SubscriptionRow } from "./billing.functions";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
const THREE_DECIMAL_CURRENCIES = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function toMajorUnit(amount: number | null | undefined, currency: string): number {
  const value = amount ?? 0;
  const c = (currency ?? "").toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return value;
  if (THREE_DECIMAL_CURRENCIES.has(c)) return value / 1000;
  return value / 100;
}

function isoFromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function planFromPrice(price: any): string | null {
  return price?.lookup_key ?? price?.metadata?.lovable_external_id ?? null;
}

export async function findCustomerIds(
  stripe: Stripe,
  options: { userId: string; email?: string },
): Promise<string[]> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const ids = new Set<string>();

  const subs = await stripe.subscriptions.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 100,
  });
  for (const sub of subs.data) {
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (customer) ids.add(customer);
  }

  const customers = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 100,
  });
  for (const c of customers.data) ids.add(c.id);

  if (ids.size === 0 && options.email) {
    const byEmail = await stripe.customers.list({ email: options.email, limit: 100 });
    for (const c of byEmail.data) ids.add(c.id);
  }

  return [...ids];
}

export async function fetchSubscriptionsForCustomers(
  stripe: Stripe,
  customerIds: string[],
): Promise<SubscriptionRow[]> {
  const out: SubscriptionRow[] = [];
  const productNames = new Map<string, string | null>();

  async function productName(product: unknown): Promise<string | null> {
    if (!product) return null;
    if (typeof product === "object" && "name" in (product as any)) {
      return ((product as any).name as string) ?? null;
    }
    if (typeof product !== "string") return null;
    if (productNames.has(product)) return productNames.get(product) ?? null;
    try {
      const fetched = await stripe.products.retrieve(product);
      const name = "name" in fetched ? ((fetched as any).name as string) : null;
      productNames.set(product, name);
      return name;
    } catch {
      productNames.set(product, null);
      return null;
    }
  }

  for (const customerId of customerIds) {
    // Stripe limite l'expansion à 4 niveaux : on résout le produit séparément.
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    for (const sub of list.data) {
      const item = sub.items?.data?.[0];
      const price: any = item?.price;
      const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end;
      out.push({
        id: sub.id,
        status: sub.status,
        plan: planFromPrice(price),
        product_name: await productName(price?.product),
        amount:
          typeof price?.unit_amount === "number"
            ? toMajorUnit(price.unit_amount, price.currency ?? "eur")
            : null,
        currency: price?.currency ?? null,
        interval: price?.recurring?.interval ?? null,
        current_period_end: isoFromUnix(periodEnd),
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
      });
    }
  }
  return out;
}


export async function fetchInvoicesForCustomers(
  stripe: Stripe,
  customerIds: string[],
): Promise<InvoiceRow[]> {
  const out: InvoiceRow[] = [];
  for (const customerId of customerIds) {
    const list = await stripe.invoices.list({ customer: customerId, limit: 100 });
    for (const inv of list.data) {
      const line: any = inv.lines?.data?.[0];
      out.push({
        id: inv.id ?? "",
        status: inv.status ?? null,
        amount_paid: toMajorUnit(inv.amount_paid, inv.currency),
        currency: inv.currency,
        created: isoFromUnix(inv.created),
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        pdf_url: inv.invoice_pdf ?? null,
        plan: planFromPrice(line?.price ?? line?.pricing?.price_details),
      });
    }
  }
  return out;
}

export async function resolveOrCreateCustomer(
  stripe: Stripe,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data[0]) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data[0];
    if (customer) {
      if (options.userId && customer.metadata?.["userId"] !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email ? { email: options.email } : {}),
    ...(options.userId ? { metadata: { userId: options.userId } } : {}),
  });
  return created.id;
}
