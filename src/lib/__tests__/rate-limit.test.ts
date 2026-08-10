import { describe, expect, it } from "vitest";
import { RATE_RULES, ipFromHeaders, parseRetryAfter, rateKey } from "../rate-limit.server";
import { isRateLimited, rateLimitDelay, rateLimitMessage } from "../backend-errors";

describe("rateKey", () => {
  it("separates users, guests and IPs so one cannot consume another's budget", () => {
    expect(rateKey("translation", { kind: "user", id: "u1" })).toBe("translation:user:u1");
    expect(rateKey("translation", { kind: "guest", id: "u1" })).toBe("translation:guest:u1");
    expect(rateKey("translation", { kind: "ip", id: "1.2.3.4" })).toBe("translation:ip:1.2.3.4");
    expect(rateKey("translation", { kind: "anon" })).toBe("translation:anon");
  });

  it("keeps one bucket per action", () => {
    const a = rateKey("message_send", { kind: "user", id: "u1" });
    const b = rateKey("transcription", { kind: "user", id: "u1" });
    expect(a).not.toBe(b);
  });
});

describe("RATE_RULES", () => {
  it("defines a positive limit and window for every action", () => {
    for (const [action, rule] of Object.entries(RATE_RULES)) {
      expect(rule.limit, action).toBeGreaterThan(0);
      expect(rule.windowSeconds, action).toBeGreaterThan(0);
    }
  });

  it("keeps the expensive actions stricter than plain messages", () => {
    expect(RATE_RULES.transcription.limit).toBeLessThan(RATE_RULES.message_send.limit);
    expect(RATE_RULES.invite_create.limit).toBeLessThan(RATE_RULES.message_send.limit);
  });
});

describe("ipFromHeaders", () => {
  it("prefers the edge header, then falls back", () => {
    expect(ipFromHeaders(new Headers({ "cf-connecting-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(ipFromHeaders(new Headers())).toBeNull();
  });
});

describe("client-side 429 handling", () => {
  it("detects a rate limit from both the trigger and HTTP wording", () => {
    expect(isRateLimited(new Error("RATE_LIMITED:42"))).toBe(true);
    expect(isRateLimited(new Error("Request failed with status 429"))).toBe(true);
    expect(isRateLimited(new Error("boom"))).toBe(false);
  });

  it("reads the retry delay and caps it", () => {
    expect(parseRetryAfter("RATE_LIMITED:12")).toBe(12);
    expect(rateLimitDelay(new Error("RATE_LIMITED:12"))).toBe(12);
    expect(rateLimitDelay(new Error("429"))).toBe(60);
    expect(rateLimitDelay(new Error("RATE_LIMITED:99999"))).toBe(900);
  });

  it("returns a short French sentence", () => {
    expect(rateLimitMessage(new Error("RATE_LIMITED:20"))).toMatch(/instant/);
    expect(rateLimitMessage(new Error("RATE_LIMITED:600"))).toMatch(/10 minutes/);
  });
});
