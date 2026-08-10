import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * RGPD export: everything Lingo stores about one account, as plain JSON.
 * Read with the caller's own client so RLS remains the safety net.
 */
export async function exportAccountData(supabase: Client, userId: string) {
  const [profile, settings, preferences, friends, participants, messages, corrections, usage] =
    await Promise.all([
      // `phone` is deliberately excluded: it is not readable through the Data API.
      supabase
        .from("profiles")
        .select(
          "id, username, avatar_url, primary_language, secondary_language, country, status, created_at, updated_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("chat_preferences").select("*").eq("user_id", userId),
      supabase.from("friendships").select("friend_id, created_at").eq("user_id", userId),
      supabase
        .from("conversation_participants")
        .select("conversation_id, role, created_at")
        .eq("user_id", userId),
      supabase
        .from("messages")
        .select("id, conversation_id, original_text, source_language, message_type, created_at")
        .eq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("translation_corrections")
        .select("original_text, previous_translation, corrected_translation, created_at")
        .eq("user_id", userId),
      supabase.from("translation_usage").select("used, updated_at").eq("user_id", userId).maybeSingle(),
    ]);

  return {
    generated_at: new Date().toISOString(),
    account_id: userId,
    profile: profile.data ?? null,
    settings: settings.data ?? null,
    chat_preferences: preferences.data ?? [],
    friends: friends.data ?? [],
    conversations: participants.data ?? [],
    messages: messages.data ?? [],
    translation_corrections: corrections.data ?? [],
    translation_usage: usage.data ?? null,
  };
}
