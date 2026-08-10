/**
 * Centralised error handling.
 *
 * Rules:
 * - the UI only ever sees a short French sentence,
 * - the technical detail stays in the developer console,
 * - secrets (tokens, OTP codes, API keys) are never logged.
 */

import { getActiveLocale } from "./i18n/core";
import { translateWith } from "./i18n/provider";
import type { TranslationKey } from "./i18n/catalog";

/** Localised sentence in the language currently rendered by the UI. */
function say(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translateWith(getActiveLocale(), key, vars);
}

export type ErrorDomain =
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "MESSAGE_ERROR"
  | "TRANSLATION_ERROR"
  | "PAYMENT_ERROR"
  | "QR_ERROR"
  | "DATABASE_ERROR";

export type BackendErrorCode =
  | ErrorDomain
  | "PHONE_AUTH_ERROR"
  | "PHONE_OTP_ERROR"
  | "FRIEND_REQUEST_INSERT_ERROR"
  | "FRIEND_REQUEST_RLS_ERROR"
  | "FRIEND_REQUEST_DUPLICATE"
  | "FRIEND_REQUEST_UPDATE_ERROR"
  | "USER_NOT_AUTHENTICATED"
  | "CONVERSATION_ERROR";

const SENSITIVE = /(token|otp|api[_-]?key|password|secret|bearer|authorization)/i;

/** Removes obviously sensitive fragments before logging. */
function scrub(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => (SENSITIVE.test(part) ? "[masqué]" : part))
    .join(" ");
}

export function logBackendError(code: BackendErrorCode, error: unknown) {
  // Technical detail stays in developer logs, never in the UI.
  console.error(`[${code}]`, typeof error === "string" ? scrub(error) : error);
}

function raw(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const anyError = error as { message?: string; error_description?: string };
  return anyError.message ?? anyError.error_description ?? "";
}

const DOMAIN_KEYS: Record<ErrorDomain, TranslationKey> = {
  AUTH_ERROR: "error.auth",
  NETWORK_ERROR: "error.network",
  MESSAGE_ERROR: "error.message",
  TRANSLATION_ERROR: "error.translation",
  PAYMENT_ERROR: "error.payment",
  QR_ERROR: "error.qr",
  DATABASE_ERROR: "error.database",
};

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function looksLikeNetworkError(error: unknown): boolean {
  const text = raw(error).toLowerCase();
  return (
    isOffline() ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("load failed") ||
    text.includes("timeout")
  );
}

/**
 * True when the failure is a server-side rate limit (Postgres trigger or
 * server function). Callers keep the message in the outbox instead of
 * discarding it.
 */
export function isRateLimited(error: unknown): boolean {
  const text = raw(error);
  return /RATE_LIMITED/.test(text) || /\b429\b/.test(text);
}

/** Seconds to wait before retrying a rate-limited action (default 60). */
export function rateLimitDelay(error: unknown): number {
  const match = /RATE_LIMITED:(\d+)/.exec(raw(error));
  const seconds = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 900) : 60;
}

/** User-facing sentence for a rate-limited action. */
export function rateLimitMessage(error: unknown): string {
  const seconds = rateLimitDelay(error);
  return seconds <= 90
    ? say("error.rateLimitShort")
    : say("error.rateLimitMinutes", { minutes: Math.ceil(seconds / 60) });
}

/**
 * Single entry point used by the UI: logs the technical detail and returns a
 * user-safe French sentence for the given domain.
 */
export function handleError(domain: ErrorDomain, error: unknown): string {
  logBackendError(domain, error);
  if (isRateLimited(error)) return rateLimitMessage(error);
  if (looksLikeNetworkError(error)) return say("error.network");

  const text = raw(error).toLowerCase();
  if (domain === "QR_ERROR") {
    if (text.includes("expir")) return say("error.qrExpired");
    if (text.includes("déjà") || text.includes("used")) return say("error.qrUsed");
    return say("error.qrInvalid");
  }
  if (domain === "TRANSLATION_ERROR") {
    if (text.includes("crédits") || text.includes("402")) {
      return say("error.translationCredits");
    }
    if (text.includes("429") || text.includes("trop")) {
      return say("error.translationBurst");
    }
  }
  if (isRlsDenied(error)) return say("error.notAllowed");
  return say(DOMAIN_KEYS[domain]);
}


/** French message for a Supabase phone-auth (send OTP) failure. */
export function phoneSendMessage(error: unknown): string {
  const text = raw(error).toLowerCase();
  if (
    text.includes("unsupported phone provider") ||
    text.includes("provider is not enabled") ||
    text.includes("phone_provider_disabled")
  ) {
    return say("error.smsNotConfigured");
  }
  if (text.includes("invalid phone") || text.includes("phone number") || text.includes("invalid format")) {
    return say("error.checkPhone");
  }
  if (text.includes("rate limit") || text.includes("too many") || text.includes("security purposes")) {
    return say("error.tooManyAttempts");
  }
  if (text.includes("signups not allowed") || text.includes("signup is disabled")) {
    return say("error.smsSignupDisabled");
  }
  return say("error.sendFailed");
}

/** French message for a Supabase OTP verification failure. */
export function phoneVerifyMessage(error: unknown): string {
  const text = raw(error).toLowerCase();
  if (text.includes("expired")) return say("error.codeExpired");
  if (text.includes("rate limit") || text.includes("too many")) {
    return say("error.tooManyAttempts");
  }
  if (text.includes("invalid") || text.includes("token")) return say("error.codeInvalid");
  return say("error.verifyFailed");
}

/** True when the error is a unique-constraint violation. */
export function isDuplicate(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505" || raw(error).toLowerCase().includes("duplicate key");
}

/** True when the error comes from a row level security policy. */
export function isRlsDenied(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42501" || raw(error).toLowerCase().includes("row-level security");
}

/** French message for friend-request mutations. */
export function friendRequestMessage(error: unknown): string {
  if (isDuplicate(error)) return say("error.friendRequestDuplicate");
  if (isRlsDenied(error)) return say("error.notAllowed");
  return say("error.retrySoon");
}
