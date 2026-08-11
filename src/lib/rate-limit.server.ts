/**
 * Server-side rate limiting.
 *
 * Backed by an atomic Postgres fixed-window counter (`check_rate_limit`), so
 * two concurrent workers can never both pass the last slot. The table is
 * service-role only: the browser can neither read nor reset a counter.
 *
 * Design notes:
 * - fixed windows are enough here (we protect cost, not milliseconds),
 * - a failing limiter must NEVER block a legitimate message: if the DB call
 *   itself errors we fail open and log,
 * - the thrown error is a stable code the UI maps to a French message.
 */

export const RATE_LIMITED = "RATE_LIMITED";

export type RateRule = { limit: number; windowSeconds: number };

/** Central table of limits. Tuned for a 50-100 user beta, generous for humans. */
export const RATE_RULES = {
  /** Text messages: bursty by nature (a user can fire a few in a row). */
  message_send: { limit: 40, windowSeconds: 60 },
  /** Paid AI translation of a message into one language. */
  translation: { limit: 120, windowSeconds: 60 },
  /** Voice transcription: the most expensive call we make. */
  transcription: { limit: 15, windowSeconds: 300 },
  /** Photo uploads attached to messages. */
  media_upload: { limit: 30, windowSeconds: 300 },
  /** Creating an invitation link / QR. */
  invite_create: { limit: 10, windowSeconds: 3600 },
  /** Redeeming an invitation (guest join) — keyed by IP, anti-enumeration. */
  invite_join: { limit: 20, windowSeconds: 3600 },
  /**
   * Redeeming a device-link QR (public, unauthenticated) — keyed by IP,
   * same anti-enumeration profile as invite_join: each attempt triggers a
   * Supabase Auth admin call (`generateLink`) on success, and a wrong guess
   * must not let a caller cheaply probe for valid-but-not-yet-scanned tokens.
   */
  device_link_redeem: { limit: 20, windowSeconds: 3600 },
  /** Open Graph fetches (outbound traffic from our worker). */
  link_preview: { limit: 30, windowSeconds: 300 },
  /** Phone OTP requests we can observe in our own layer. */
  otp_request: { limit: 5, windowSeconds: 900 },
} satisfies Record<string, RateRule>;

export type RateAction = keyof typeof RATE_RULES;

export type RateSubject =
  | { kind: "user"; id: string }
  | { kind: "guest"; id: string }
  | { kind: "ip"; id: string }
  | { kind: "anon" };

/** Deterministic bucket key. Pure — unit tested. */
export function rateKey(action: RateAction, subject: RateSubject): string {
  const suffix = subject.kind === "anon" ? "anon" : `${subject.kind}:${subject.id}`;
  return `${action}:${suffix}`;
}

/** Best-effort caller IP from the incoming request headers. */
export function ipFromHeaders(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const value of candidates) {
    const ip = value?.trim();
    if (ip) return ip.slice(0, 64);
  }
  return null;
}

/** Subject for public (unauthenticated) endpoints: caller IP, else anonymous. */
export async function callerIpSubject(): Promise<RateSubject> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const ip = ipFromHeaders(getRequest().headers);
    return ip ? { kind: "ip", id: ip } : { kind: "anon" };
  } catch {
    return { kind: "anon" };
  }
}

export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super(`${RATE_LIMITED}:${retryAfter}`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/** Extracts the retry delay (seconds) from a rate-limit error message. */
export function parseRetryAfter(message: string): number | null {
  const match = /^RATE_LIMITED:(\d+)$/.exec(message.trim());
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Consumes one slot. Throws `RateLimitError` when the subject is over budget.
 * Never throws for infrastructure failures (fail open, logged).
 */
export async function enforceRateLimit(
  action: RateAction,
  subject: RateSubject,
  overrides?: Partial<RateRule>,
): Promise<void> {
  const rule = { ...RATE_RULES[action], ...overrides };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    _bucket: rateKey(action, subject),
    _limit: rule.limit,
    _window_seconds: rule.windowSeconds,
  });

  if (error) {
    // Structured log, no user content, no identifiers beyond the action.
    console.error("[RATE_LIMIT_UNAVAILABLE]", JSON.stringify({ action, code: error.code }));
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    console.warn(
      "[RATE_LIMITED]",
      JSON.stringify({ action, subject: subject.kind, retry_after: row.retry_after }),
    );
    throw new RateLimitError(row.retry_after ?? 60);
  }
}
