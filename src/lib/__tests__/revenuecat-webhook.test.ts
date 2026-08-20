import { beforeEach, describe, expect, it, vi } from "vitest";

// getSupabase() in the route module caches its client on first call (same
// pattern as the Stripe webhook) — so the mock must be ONE persistent
// object whose individual mocks get reconfigured per test, not a fresh
// object swapped in per test (that stale-cache trap bit the first version
// of this file: reassigning the "current" client after the first call had
// no effect, since the route had already cached the earlier one).
const upsert = vi.fn();
const insertIdempotency = vi.fn();
const from = vi.fn((table: string) => {
  if (table === "subscriptions") return { upsert };
  if (table === "processed_revenuecat_events") return { insert: insertIdempotency };
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));

const { Route } = await import("@/routes/api/public/payments/revenuecat-webhook");
const handler = (Route.options as any).server.handlers.POST;

const SECRET = "test-shared-secret";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://lingo.test/api/public/payments/revenuecat-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function purchaseEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-1",
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    product_id: "lingo_premium_monthly_ios",
    environment: "SANDBOX",
    purchased_at_ms: Date.UTC(2026, 0, 1),
    expiration_at_ms: Date.UTC(2026, 1, 1),
    original_transaction_id: "txn-abc",
    ...overrides,
  };
}

describe("POST /api/public/payments/revenuecat-webhook", () => {
  beforeEach(() => {
    process.env["REVENUECAT_WEBHOOK_SECRET"] = SECRET;
    upsert.mockReset().mockResolvedValue({ error: null });
    insertIdempotency.mockReset().mockResolvedValue({ error: null });
    from.mockClear();
  });

  it("rejects when the server has no configured secret (500, not silently accepted)", async () => {
    delete process.env["REVENUECAT_WEBHOOK_SECRET"];
    const response = await handler({ request: post({ event: purchaseEvent() }, { authorization: SECRET }) });
    expect(response.status).toBe(500);
  });

  it("rejects a wrong/missing Authorization header (401), before touching the database", async () => {
    const response = await handler({ request: post({ event: purchaseEvent() }, { authorization: "wrong" }) });
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a malformed body (400)", async () => {
    const response = await handler({ request: post({ event: { type: "INITIAL_PURCHASE" } }, { authorization: SECRET }) });
    expect(response.status).toBe(400);
  });

  it("upserts an active subscription for INITIAL_PURCHASE, keyed on (provider, provider_subscription_id)", async () => {
    const response = await handler({ request: post({ event: purchaseEvent() }, { authorization: SECRET }) });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0]!;
    expect(payload).toMatchObject({
      user_id: USER_ID,
      provider: "revenuecat",
      provider_subscription_id: "txn-abc",
      product_id: "lingo_premium_monthly_ios",
      status: "active",
      environment: "sandbox",
    });
    expect(options).toEqual({ onConflict: "provider,provider_subscription_id" });
  });

  it.each([
    ["CANCELLATION", "canceled"],
    ["EXPIRATION", "expired"],
    ["BILLING_ISSUE", "past_due"],
    ["RENEWAL", "active"],
  ])("maps RevenueCat type %s to status %s", async (type, expectedStatus) => {
    await handler({ request: post({ event: purchaseEvent({ id: `evt-${type}`, type }) }, { authorization: SECRET }) });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ status: expectedStatus }), expect.anything());
  });

  it("ignores an unhandled event type without touching subscriptions", async () => {
    const response = await handler({
      request: post({ event: purchaseEvent({ id: "evt-x", type: "PAYWALL_IMPRESSION" }) }, { authorization: SECRET }),
    });
    expect(response.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("skips an event whose app_user_id is not a Supabase user UUID (anonymous RevenueCat user)", async () => {
    const response = await handler({
      request: post({ event: purchaseEvent({ id: "evt-anon", app_user_id: "$RCAnonymousID:abc123" }) }, { authorization: SECRET }),
    });
    expect(response.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not process the same event twice (idempotency via event id)", async () => {
    insertIdempotency.mockResolvedValue({ error: { code: "23505" } });
    const response = await handler({ request: post({ event: purchaseEvent() }, { authorization: SECRET }) });
    expect(response.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });
});
