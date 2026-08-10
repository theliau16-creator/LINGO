import { describe, expect, it } from "vitest";
import { apiOk, apiError, mapBusinessError } from "../api-http.server";
import { RateLimitError } from "../rate-limit.server";
import {
  PreferencesValidationError,
  validatePreferencesInput,
  type PreferencesInput,
} from "../preferences.server";

const validPreferences: PreferencesInput = {
  conversationId: "conv-1",
  background_type: "color",
  background_value: "#112233",
  outgoing_message_color: "#445566",
  incoming_message_color: null,
  theme: "default",
};

describe("apiOk / apiError", () => {
  it("returns JSON with the requested status", async () => {
    const ok = apiOk({ used: 3 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ used: 3 });

    const err = apiError(401, "MISSING_TOKEN", "No authorization header provided.");
    expect(err.status).toBe(401);
    expect(await err.json()).toEqual({
      error: { code: "MISSING_TOKEN", message: "No authorization header provided." },
    });
  });

  it("carries extra fields such as retryAfter", async () => {
    const err = apiError(429, "RATE_LIMITED", "Too many requests.", { retryAfter: 30 });
    expect((await err.json()).error.retryAfter).toBe(30);
  });
});

describe("mapBusinessError", () => {
  it("maps a rate limit to 429 with the retry delay", async () => {
    const response = mapBusinessError(new RateLimitError(42));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.retryAfter).toBe(42);
  });

  it("maps an exhausted free quota to 403", async () => {
    const response = mapBusinessError(new Error("TRANSLATION_QUOTA_REACHED"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("QUOTA_REACHED");
  });

  it("maps the premium paywall to 403", async () => {
    const response = mapBusinessError(new Error("PREMIUM_REQUIRED"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("PREMIUM_REQUIRED");
  });

  it("maps an RLS denial to 403", async () => {
    const response = mapBusinessError({ code: "42501", message: "row-level security" });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  it("maps a declared not-found business message to 404", async () => {
    const response = mapBusinessError(new Error("Message introuvable."), {
      notFound: ["Message introuvable."],
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("keeps every QR failure indistinguishable so tokens cannot be probed", async () => {
    const qrErrors = ["QR code invalide.", "Ce QR code a déjà été utilisé.", "QR code expiré."];
    for (const message of qrErrors) {
      const response = mapBusinessError(new Error(message), { notFound: qrErrors });
      expect(response.status, message).toBe(404);
      expect((await response.json()).error.code, message).toBe("NOT_FOUND");
    }
  });

  it("never leaks an unexpected technical detail to the client", async () => {
    const response = mapBusinessError(new Error("pg: relation messages does not exist"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/relation/);
  });
});

describe("preferences input validation (shared by web server fn and mobile route)", () => {
  it("accepts a well-formed payload", () => {
    expect(validatePreferencesInput(validPreferences)).toEqual(validPreferences);
  });

  it("rejects an unknown background type", () => {
    expect(() =>
      validatePreferencesInput({ ...validPreferences, background_type: "video" }),
    ).toThrow(PreferencesValidationError);
  });

  it("rejects a malformed colour", () => {
    expect(() =>
      validatePreferencesInput({ ...validPreferences, outgoing_message_color: "red; drop table" }),
    ).toThrow(PreferencesValidationError);
  });

  it("rejects an oversized background value and theme", () => {
    expect(() =>
      validatePreferencesInput({ ...validPreferences, background_value: "x".repeat(301) }),
    ).toThrow(PreferencesValidationError);
    expect(() => validatePreferencesInput({ ...validPreferences, theme: "x".repeat(41) })).toThrow(
      PreferencesValidationError,
    );
  });

  it("accepts a gradient produced by the customiser", () => {
    expect(() =>
      validatePreferencesInput({
        ...validPreferences,
        outgoing_message_color: "linear-gradient(180deg, #111 0%, #222 100%)",
      }),
    ).not.toThrow();
  });
});
