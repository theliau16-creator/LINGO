import { createServerFn } from "@tanstack/react-start";

export type CheckoutSessionResult = { clientSecret: string } | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      priceId: string;
      customerEmail?: string;
      userId?: string;
      returnUrl: string;
      environment: "sandbox" | "live";
    }) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
      return data;
    },
  )
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const { resolveOrCreateCustomer } = await import("@/lib/billing.server");

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      const stripePrice = prices.data[0];
      if (!stripePrice) throw new Error("Price not found");
      const isRecurring = stripePrice.type === "recurring";

      const customerId =
        data.customerEmail || data.userId
          ? await resolveOrCreateCustomer(stripe, {
              ...(data.customerEmail ? { email: data.customerEmail } : {}),
              ...(data.userId ? { userId: data.userId } : {}),
            })
          : undefined;

      let productDescription: string | undefined;
      if (!isRecurring) {
        const productId =
          typeof stripePrice.product === "string"
            ? stripePrice.product
            : (stripePrice.product as { id: string }).id;
        const product = await stripe.products.retrieve(productId);
        productDescription = (product as { name?: string }).name;
      }

      // Dynamic Payment Methods : on ne force jamais payment_method_types.
      // Stripe affiche automatiquement carte, Link, Apple Pay, Google Pay et
      // PayPal selon l'éligibilité du compte, de la devise et de l'appareil.
      const params = {
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        ...(customerId ? { customer: customerId } : {}),
        ...(!isRecurring ? { payment_intent_data: { description: productDescription } } : {}),
        ...(data.userId
          ? {
              metadata: { userId: data.userId },
              ...(isRecurring ? { subscription_data: { metadata: { userId: data.userId } } } : {}),
            }
          : {}),
        // Prix TTC : Stripe calcule et collecte la TVA incluse dans le montant affiché.
        automatic_tax: { enabled: true },
        // automatic_tax exige une adresse : on la collecte au checkout et on
        // la sauvegarde sur le Customer.
        billing_address_collection: "auto",
        ...(customerId ? { customer_update: { address: "auto", name: "auto" } } : {}),
      };

      const session = await stripe.checkout.sessions.create(params as any);
      if (!session.client_secret) throw new Error("Stripe n'a pas renvoyé de client_secret");

      return { clientSecret: session.client_secret };
    } catch (error) {
      console.error("[stripe] createCheckoutSession failed:", getStripeErrorMessage(error));
      return { error: getStripeErrorMessage(error) };
    }

  });
