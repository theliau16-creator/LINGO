import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const consumeDeviceLinkToken = vi.fn();
const checkRateLimitRpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims } }),
}));

vi.mock("@/lib/device-link.server", () => ({
  consumeDeviceLinkToken,
  createDeviceLinkToken: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: checkRateLimitRpc },
}));

const AUTHENTICATED_USER_ID = "11111111-1111-4111-8111-111111111111";
const A_MESSAGE_ID = "b3f5c2a0-1e4d-4a6b-9c3e-7f2d8a1b6c4e";

const { Route: RedeemRoute } = await import("@/routes/api/public/device-link/redeem");
const redeemHandler = (RedeemRoute.options as any).server.handlers.POST;

const { Route: TranslateRoute } = await import("@/routes/api/chat/messages.$messageId.translate");
const translateHandler = (TranslateRoute.options as any).server.handlers.POST;

function post(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/public/device-link/redeem — rate limiting", () => {
  const handler = redeemHandler;

  beforeEach(() => {
    consumeDeviceLinkToken.mockReset();
    checkRateLimitRpc.mockReset();
  });

  it("enforces device_link_redeem before touching the token (429, no consume call)", async () => {
    checkRateLimitRpc.mockResolvedValue({ data: { allowed: false, retry_after: 55 }, error: null });

    const response = await handler({
      request: post("https://lingo.test/api/public/device-link/redeem", {
        token: "0123456789abcdef0123456789abcdef",
      }),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.retryAfter).toBe(55);
    expect(consumeDeviceLinkToken).not.toHaveBeenCalled();

    // Keyed by IP, per RATE_RULES.device_link_redeem — confirms the bucket used.
    expect(checkRateLimitRpc).toHaveBeenCalledWith(
      "check_rate_limit",
      expect.objectContaining({ _bucket: expect.stringContaining("device_link_redeem:") }),
    );
  });

  it("proceeds to consume the token when under the limit (success path)", async () => {
    checkRateLimitRpc.mockResolvedValue({ data: { allowed: true }, error: null });
    consumeDeviceLinkToken.mockResolvedValue({ tokenHash: "hashed-otp" });

    const response = await handler({
      request: post("https://lingo.test/api/public/device-link/redeem", {
        token: "0123456789abcdef0123456789abcdef",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tokenHash: "hashed-otp" });
    expect(consumeDeviceLinkToken).toHaveBeenCalledWith("0123456789abcdef0123456789abcdef");
  });

  it("rejects a malformed token before ever calling the rate limiter", async () => {
    const response = await handler({
      request: post("https://lingo.test/api/public/device-link/redeem", { token: "short" }),
    });
    expect(response.status).toBe(400);
    expect(checkRateLimitRpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/messages/:messageId/translate — messageId validation", () => {
  const handler = translateHandler;

  beforeEach(() => {
    process.env["SUPABASE_URL"] = "https://project.supabase.co";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
    getClaims.mockReset();
    getClaims.mockResolvedValue({ data: { claims: { sub: AUTHENTICATED_USER_ID } }, error: null });
  });

  it("rejects a non-UUID messageId with 400 before calling business logic", async () => {
    const response = await handler({
      request: post(
        "https://lingo.test/api/chat/messages/not-a-uuid/translate",
        undefined,
        { authorization: "Bearer header.payload.signature" },
      ),
      params: { messageId: "not-a-uuid" },
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
  });

  it("still requires auth even with a well-formed messageId", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "invalid" } });
    const response = await handler({
      request: post(
        `https://lingo.test/api/chat/messages/${A_MESSAGE_ID}/translate`,
        undefined,
        { authorization: "Bearer header.payload.signature" },
      ),
      params: { messageId: A_MESSAGE_ID },
    });
    expect(response.status).toBe(401);
  });
});
