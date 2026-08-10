import { describe, expect, it } from "vitest";
import { assertSafeUrl, cacheKey, meta } from "../links.server";
import { extractFirstUrl } from "../links";

describe("extractFirstUrl", () => {
  it("finds the first link and drops trailing punctuation", () => {
    expect(extractFirstUrl("Regarde https://lingo.app/blog.")).toBe("https://lingo.app/blog");
    expect(extractFirstUrl("(https://a.io/x)")).toBe("https://a.io/x");
  });

  it("returns null without a link", () => {
    expect(extractFirstUrl("bonjour")).toBeNull();
  });
});

describe("assertSafeUrl (anti-SSRF)", () => {
  it("accepts public https urls", () => {
    expect(assertSafeUrl("https://example.com/a").hostname).toBe("example.com");
  });

  const blocked = [
    "http://localhost/a",
    "http://127.0.0.1/a",
    "http://10.0.0.5/a",
    "http://172.16.4.1/a",
    "http://192.168.1.1/a",
    "http://169.254.169.254/latest/meta-data",
    "http://100.100.100.200/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "https://user:pass@example.com/",
    "http://router.internal/",
  ];
  it.each(blocked)("refuses %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow();
  });

  it("refuses non-http protocols", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow();
    expect(() => assertSafeUrl("gopher://example.com")).toThrow();
  });
});

describe("cacheKey", () => {
  it("strips tracking params and the hash so one page = one cache row", () => {
    const a = cacheKey(new URL("https://x.io/p?utm_source=tw&id=3&fbclid=z#top"));
    expect(a).toBe("https://x.io/p?id=3");
  });

  it("keeps meaningful params", () => {
    expect(cacheKey(new URL("https://x.io/s?q=lingo"))).toBe("https://x.io/s?q=lingo");
  });
});

describe("meta", () => {
  const html = `<meta property="og:title" content="Bonjour &amp; merci">
    <meta content="Une description" name="og:description">`;

  it("reads both attribute orders and decodes entities", () => {
    expect(meta(html, "og:title")).toBe("Bonjour & merci");
    expect(meta(html, "og:description")).toBe("Une description");
  });

  it("returns null when absent", () => {
    expect(meta(html, "og:image")).toBeNull();
  });
});
