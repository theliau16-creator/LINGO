/**
 * Link previews.
 *
 * Safety rules:
 * - https only,
 * - private / loopback hosts refused (no SSRF),
 * - bounded download, bounded parsing,
 * - results cached in `link_previews` so a URL is fetched once.
 */

const MAX_BYTES = 300_000;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

/** Hostnames and literal IPs that must never be reachable from the server. */
const BLOCKED_HOSTNAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-network, RFC1918, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIpv6(raw: string): boolean {
  const host = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false;
  if (host === "::" || host === "::1") return true;
  if (/^(fe80|fc|fd)/.test(host)) return true; // link-local + unique local
  // IPv4-mapped, dotted form: ::ffff:127.0.0.1
  const dotted = host.match(/((\d{1,3}\.){3}\d{1,3})$/)?.[1];
  if (dotted && isBlockedIpv4(dotted)) return true;
  // IPv4-mapped, hex form: the URL parser rewrites ::ffff:127.0.0.1 as
  // ::ffff:7f00:1, so the dotted check alone would let loopback through.
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] && hex[2]) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    const ipv4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
    if (isBlockedIpv4(ipv4)) return true;
  }
  return false;
}


/** Rejects anything that is not a public https(?) endpoint. Exported for tests. */
export function assertSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Lien non pris en charge.");
  }
  const host = url.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTNAME.test(host)) throw new Error("Lien non autorisé.");
  if (isBlockedIpv4(host) || isBlockedIpv6(host)) throw new Error("Lien non autorisé.");
  if (url.username || url.password) throw new Error("Lien non autorisé.");
  return url;
}

/**
 * Follows redirects MANUALLY and revalidates every hop: `redirect: "follow"`
 * would let a public URL bounce to 127.0.0.1 or a cloud metadata endpoint.
 * The body is read as a bounded stream, never buffered whole.
 */
async function safeFetchHtml(startUrl: URL, signal: AbortSignal): Promise<{ finalUrl: URL; html: string }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), {
      signal,
      redirect: "manual",
      headers: { "User-Agent": "LingoBot/1.0 (+link preview)", Accept: "text/html" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Lien non lisible.");
      current = assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) throw new Error("Contenu non lisible.");
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) throw new Error("Page trop lourde.");

    const reader = response.body?.getReader();
    if (!reader) return { finalUrl: current, html: "" };
    const decoder = new TextDecoder();
    let html = "";
    let read = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (read >= MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    return { finalUrl: current, html: html.slice(0, MAX_BYTES) };
  }
  throw new Error("Trop de redirections.");
}


export function meta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      "i",
    );
    const found = html.match(pattern) ?? html.match(alt);
    if (found?.[1]) return decodeHtml(found[1]).slice(0, 300);
  }
  return null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
};

/** Normalised cache key: same page = same row, whatever the tracking params. */
export function cacheKey(url: URL): string {
  const clean = new URL(url.toString());
  clean.hash = "";
  for (const param of [...clean.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_eid|igshid)/i.test(param)) clean.searchParams.delete(param);
  }
  return clean.toString();
}

/** Fetches (and caches) the Open Graph card of a link. */
export async function getLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const url = assertSafeUrl(rawUrl);
  const key = cacheKey(url);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("link_previews")
    .select("url, title, description, image_url, site_name")
    .eq("url", key)
    .maybeSingle();
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let html = "";
  let finalUrl = url;
  try {
    const result = await safeFetchHtml(url, controller.signal);
    html = result.html;
    finalUrl = result.finalUrl;
  } finally {
    clearTimeout(timer);
  }

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const preview: LinkPreview = {
    url: key,
    title:
      meta(html, "og:title", "twitter:title") ??
      (titleTag ? decodeHtml(titleTag).slice(0, 300) : null),
    description: meta(html, "og:description", "twitter:description", "description"),
    image_url: meta(html, "og:image", "twitter:image"),
    site_name: meta(html, "og:site_name") ?? finalUrl.hostname.replace(/^www\./, ""),
  };

  await supabaseAdmin
    .from("link_previews")
    .upsert({ ...preview, fetched_at: new Date().toISOString() }, { onConflict: "url" });
  return preview;
}

