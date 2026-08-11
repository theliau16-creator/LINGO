import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  savePreferencesForUser,
  validatePreferencesInput,
  type PreferencesInput,
} from "./preferences.server";

export type { PreferencesInput };

/**
 * Saves chat personalisation. Premium is enforced HERE, not only in the UI:
 * `chat_preferences` no longer accepts direct INSERT/UPDATE from the browser,
 * so a free account cannot bypass the paywall by calling the API directly.
 */
export const savePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PreferencesInput) => validatePreferencesInput(input))
  .handler(async ({ data, context }) => savePreferencesForUser(context.userId, data));
