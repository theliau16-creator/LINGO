/**
 * Centralised error handling.
 *
 * Rules:
 * - the UI only ever sees a short French sentence,
 * - the technical detail stays in the developer console,
 * - secrets (tokens, OTP codes, API keys) are never logged.
 */

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

const DOMAIN_MESSAGES: Record<ErrorDomain, string> = {
  AUTH_ERROR: "Connexion impossible pour le moment.",
  NETWORK_ERROR: "Connexion instable. Réessayez dans un instant.",
  MESSAGE_ERROR: "Le message n'a pas pu être envoyé.",
  TRANSLATION_ERROR: "La traduction est momentanément indisponible.",
  PAYMENT_ERROR: "Le paiement n'a pas pu aboutir.",
  QR_ERROR: "Ce QR code n'est pas utilisable.",
  DATABASE_ERROR: "Action impossible pour le moment.",
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
 * Single entry point used by the UI: logs the technical detail and returns a
 * user-safe French sentence for the given domain.
 */
export function handleError(domain: ErrorDomain, error: unknown): string {
  logBackendError(domain, error);
  if (looksLikeNetworkError(error)) return DOMAIN_MESSAGES.NETWORK_ERROR;

  const text = raw(error).toLowerCase();
  if (domain === "QR_ERROR") {
    if (text.includes("expir")) return "Ce QR code a expiré. Générez-en un nouveau.";
    if (text.includes("déjà") || text.includes("used")) return "Ce QR code a déjà été utilisé.";
    return "QR code invalide.";
  }
  if (domain === "TRANSLATION_ERROR") {
    if (text.includes("crédits") || text.includes("402")) {
      return "Crédits de traduction épuisés.";
    }
    if (text.includes("429") || text.includes("trop")) {
      return "Trop de traductions d'un coup. Réessayez dans un instant.";
    }
  }
  if (isRlsDenied(error)) return "Vous n'êtes pas autorisé à effectuer cette action.";
  return DOMAIN_MESSAGES[domain];
}

/** French message for a Supabase phone-auth (send OTP) failure. */
export function phoneSendMessage(error: unknown): string {
  const text = raw(error).toLowerCase();
  if (
    text.includes("unsupported phone provider") ||
    text.includes("provider is not enabled") ||
    text.includes("phone_provider_disabled")
  ) {
    return "L'envoi par SMS n'est pas encore configuré.";
  }
  if (text.includes("invalid phone") || text.includes("phone number") || text.includes("invalid format")) {
    return "Vérifiez votre numéro de téléphone.";
  }
  if (text.includes("rate limit") || text.includes("too many") || text.includes("security purposes")) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  if (text.includes("signups not allowed") || text.includes("signup is disabled")) {
    return "Les inscriptions par SMS sont désactivées.";
  }
  return "Envoi impossible pour le moment. Réessayez.";
}

/** French message for a Supabase OTP verification failure. */
export function phoneVerifyMessage(error: unknown): string {
  const text = raw(error).toLowerCase();
  if (text.includes("expired")) return "Ce code a expiré. Demandez-en un nouveau.";
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  if (text.includes("invalid") || text.includes("token")) return "Le code saisi est incorrect.";
  return "Vérification impossible. Réessayez.";
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
  if (isDuplicate(error)) return "Une demande existe déjà avec cette personne.";
  if (isRlsDenied(error)) return "Vous n'êtes pas autorisé à effectuer cette action.";
  return "Réessayez dans un instant.";
}
