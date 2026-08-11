import { isUuid } from "@/lib/uuid";

export type PreferencesInput = {
  conversationId: string | null;
  background_type: string;
  background_value: string | null;
  outgoing_message_color: string | null;
  incoming_message_color: string | null;
  theme: string;
  applyToAll?: boolean;
};

export const BACKGROUND_TYPES = ["default", "color", "gradient", "photo"];
export const PREFERENCES_COLOR_PATTERN = /^(#[0-9a-f]{3,8}|linear-gradient\([^)]{0,200}\))$/i;

export class PreferencesValidationError extends Error {}

export function validatePreferencesInput(input: PreferencesInput): PreferencesInput {
  if (!input) throw new PreferencesValidationError("Préférences requises.");
  if (input.conversationId !== null && !isUuid(input.conversationId)) {
    throw new PreferencesValidationError("Identifiant de conversation invalide.");
  }
  if (!BACKGROUND_TYPES.includes(input.background_type)) {
    throw new PreferencesValidationError("Type de fond invalide.");
  }
  for (const color of [input.outgoing_message_color, input.incoming_message_color]) {
    if (color && !PREFERENCES_COLOR_PATTERN.test(color)) {
      throw new PreferencesValidationError("Couleur invalide.");
    }
  }
  if (input.background_value && input.background_value.length > 300) {
    throw new PreferencesValidationError("Valeur de fond invalide.");
  }
  if (typeof input.theme !== "string" || input.theme.length > 40) {
    throw new PreferencesValidationError("Thème invalide.");
  }
  return input;
}

/**
 * Saves chat personalisation. Premium is enforced HERE, not only in the UI:
 * `chat_preferences` no longer accepts direct INSERT/UPDATE from the
 * browser, so a free account cannot bypass the paywall by calling this
 * directly. Shared by the web server function (`preferences.functions.ts`)
 * and the mobile HTTP route (`routes/api/preferences/chat.ts`).
 */
export async function savePreferencesForUser(userId: string, data: PreferencesInput) {
  const { isPremiumUser } = await import("./quota.server");
  if (!(await isPremiumUser(userId))) {
    throw new Error("PREMIUM_REQUIRED");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const target = data.applyToAll ? null : data.conversationId;

  // A background photo must belong to the caller's own storage folder.
  if (data.background_type === "photo" && data.background_value) {
    if (!data.background_value.startsWith(`${userId}/`)) {
      throw new Error("Fichier non autorisé.");
    }
  }

  const values = {
    background_type: data.background_type,
    background_value: data.background_value,
    outgoing_message_color: data.outgoing_message_color,
    incoming_message_color: data.incoming_message_color,
    theme: data.theme,
  };

  const base = supabaseAdmin.from("chat_preferences").select("id").eq("user_id", userId);
  const { data: rows } = await (target
    ? base.eq("conversation_id", target)
    : base.is("conversation_id", null));

  const rowId = rows?.[0]?.id;
  if (rowId) {
    const { error } = await supabaseAdmin.from("chat_preferences").update(values).eq("id", rowId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("chat_preferences")
      .insert({ user_id: userId, conversation_id: target, ...values });
    if (error) throw new Error(error.message);
  }

  if (data.applyToAll) {
    await supabaseAdmin
      .from("chat_preferences")
      .delete()
      .eq("user_id", userId)
      .not("conversation_id", "is", null);
  }

  return { saved: true };
}
