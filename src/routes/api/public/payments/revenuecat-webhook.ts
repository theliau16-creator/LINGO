import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    );
  }
  return _supabase;
}

type RevenueCatEvent = {
  id?: string;
  type: string;
  app_user_id: string;
  product_id?: string;
  environment?: "SANDBOX" | "PRODUCTION";
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  original_transaction_id?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapEnvironment(env: string | undefined): "sandbox" | "live" {
  return env === "PRODUCTION" ? "live" : "sandbox";
}

/**
 * Writes/updates the generic (provider, provider_subscription_id) row —
 * never touches stripe_customer_id/stripe_subscription_id/price_id, which
 * stay exclusively owned by the Stripe webhook (webhook.ts, unmodified).
 * user_id relies entirely on the mobile app calling `Purchases.logIn(<the
 * Supabase user id>)` right after auth (lib/revenuecat.ts) — RevenueCat's
 * "identified users" pattern — so app_user_id already IS our user_id, no
 * separate mapping table needed.
 */
async function upsertSubscription(event: RevenueCatEvent, status: string) {
  const userId = event.app_user_id;
  if (!UUID_RE.test(userId)) {
    // Anonymous RevenueCat user (never logged in via Purchases.logIn) —
    // cannot be tied to a Supabase account; nothing to persist.
    console.error("RevenueCat event with non-UUID app_user_id, skipped:", userId);
    return;
  }
  if (!event.product_id) {
    console.error("RevenueCat event missing product_id, skipped:", event.type);
    return;
  }

  const providerSubscriptionId = event.original_transaction_id ?? `${userId}:${event.product_id}`;

  const { error } = await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        provider: "revenuecat",
        provider_customer_id: event.app_user_id,
        provider_subscription_id: providerSubscriptionId,
        product_id: event.product_id,
        status,
        current_period_start: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
        current_period_end: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
        environment: mapEnvironment(event.environment),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_subscription_id" },
    );
  if (error) console.error("RevenueCat subscription upsert failed:", error);
}

/**
 * Maps RevenueCat's event taxonomy onto the same status vocabulary Stripe
 * already writes (active/canceled/past_due) — is_premium_user() reads
 * exactly these values regardless of provider, so no change was needed
 * there. Only the event types that change entitlement state are handled;
 * everything else (PAYWALL_IMPRESSION, TEMPORARY_ENTITLEMENT_GRANT,
 * VIRTUAL_CURRENCY_TRANSACTION, experiment/analytics events, etc.) is
 * logged and ignored, same posture as the Stripe webhook's own default case.
 */
async function handleEvent(event: RevenueCatEvent) {
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
    case "TRANSFER":
      await upsertSubscription(event, "active");
      break;
    case "CANCELLATION":
      // Auto-renew turned off — is_premium_user() keeps access until
      // current_period_end, exactly like a canceled Stripe subscription.
      await upsertSubscription(event, "canceled");
      break;
    case "EXPIRATION":
      await upsertSubscription(event, "expired");
      break;
    case "BILLING_ISSUE":
      await upsertSubscription(event, "past_due");
      break;
    default:
      console.log("Unhandled RevenueCat event:", event.type);
  }
}

/**
 * POST /api/public/payments/revenuecat-webhook — public (RevenueCat has no
 * session), authenticated via a shared secret configured in the RevenueCat
 * dashboard's "Authorization header" field and compared against
 * REVENUECAT_WEBHOOK_SECRET (server-only env, never in the mobile app).
 * Does not touch src/routes/api/public/payments/webhook.ts (Stripe) at all.
 */
export const Route = createFileRoute("/api/public/payments/revenuecat-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env["REVENUECAT_WEBHOOK_SECRET"];
        if (!expectedSecret) {
          console.error("REVENUECAT_WEBHOOK_SECRET is not configured");
          return new Response("Webhook not configured", { status: 500 });
        }
        if (request.headers.get("authorization") !== expectedSecret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { event?: RevenueCatEvent };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event = body.event;
        if (!event?.type || !event.app_user_id) {
          return new Response("Malformed event", { status: 400 });
        }

        // Idempotency: RevenueCat retries a failed/unacknowledged delivery
        // up to 5 times (5/10/20/40/80 min) — same pattern as the Stripe
        // webhook's processed_stripe_events.
        if (event.id) {
          const { error: seenError } = await getSupabase()
            .from("processed_revenuecat_events")
            .insert({ event_id: event.id, type: event.type, environment: mapEnvironment(event.environment) });
          if (seenError) {
            if (seenError.code === "23505") {
              console.log("Duplicate RevenueCat event ignored:", event.id);
              return Response.json({ received: true });
            }
            console.error("RevenueCat idempotency insert failed:", seenError);
          }
        }

        try {
          await handleEvent(event);
          return Response.json({ received: true });
        } catch (e) {
          console.error("RevenueCat webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
