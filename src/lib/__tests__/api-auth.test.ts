import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims } }),
}));

const { authenticateApiRequest } = await import("../api-auth.server");

// Three dot-separated segments: the shape check runs before any network call.
const WELL_FORMED_JWT = "header.payload.signature";

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("https://lingo.test/api/quota", { headers });
}

describe("authenticateApiRequest", () => {
  beforeEach(() => {
    getClaims.mockReset();
    process.env["SUPABASE_URL"] = "https://project.supabase.co";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
  });

  afterEach(() => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_PUBLISHABLE_KEY"];
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const result = await authenticateApiRequest(requestWith());
    expect(result).toMatchObject({ ok: false, status: 401, code: "MISSING_TOKEN" });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("rejects a non-Bearer scheme (401)", async () => {
    const result = await authenticateApiRequest(requestWith({ authorization: "Basic abc123" }));
    expect(result).toMatchObject({ ok: false, status: 401, code: "INVALID_TOKEN" });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("rejects a token that is not a three-segment JWT before calling Supabase (401)", async () => {
    const result = await authenticateApiRequest(requestWith({ authorization: "Bearer not-a-jwt" }));
    expect(result).toMatchObject({ ok: false, status: 401, code: "INVALID_TOKEN" });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("rejects a well-formed but invalid/expired token (401)", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "invalid JWT" } });
    const result = await authenticateApiRequest(
      requestWith({ authorization: `Bearer ${WELL_FORMED_JWT}` }),
    );
    expect(result).toMatchObject({ ok: false, status: 401, code: "INVALID_TOKEN" });
    expect(getClaims).toHaveBeenCalledWith(WELL_FORMED_JWT);
  });

  it("returns 401, not 500, when getClaims throws on an undecodable token", async () => {
    // Regression: an unauthenticated caller must never be able to trigger a 500.
    getClaims.mockRejectedValue(new Error("Invalid JWT structure"));
    const result = await authenticateApiRequest(
      requestWith({ authorization: `Bearer ${WELL_FORMED_JWT}` }),
    );
    expect(result).toMatchObject({ ok: false, status: 401, code: "INVALID_TOKEN" });
  });

  it("rejects a token whose claims carry no subject (401)", async () => {
    getClaims.mockResolvedValue({ data: { claims: { aud: "authenticated" } }, error: null });
    const result = await authenticateApiRequest(
      requestWith({ authorization: `Bearer ${WELL_FORMED_JWT}` }),
    );
    expect(result).toMatchObject({ ok: false, status: 401, code: "INVALID_TOKEN" });
  });

  it("accepts a valid token and exposes the user id", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-123", aud: "authenticated" } },
      error: null,
    });
    const result = await authenticateApiRequest(
      requestWith({ authorization: `Bearer ${WELL_FORMED_JWT}` }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.userId).toBe("user-123");
      expect(result.context.supabase).toBeDefined();
    }
  });

  it("fails closed with 500 when the server is missing Supabase configuration", async () => {
    delete process.env["SUPABASE_URL"];
    const result = await authenticateApiRequest(
      requestWith({ authorization: `Bearer ${WELL_FORMED_JWT}` }),
    );
    expect(result).toMatchObject({ ok: false, status: 500, code: "SERVER_MISCONFIGURED" });
    expect(getClaims).not.toHaveBeenCalled();
  });
});
