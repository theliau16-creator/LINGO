import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PREFERENCES, type ChatPreferences } from "@/lib/chat-theme";
import { savePreferences } from "@/lib/preferences.functions";


/** Per-conversation personalisation, falling back to the user's global setting. */
export function useChatPreferences(conversationId: string) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-preferences", user?.id, conversationId],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ChatPreferences> => {
      const { data, error } = await supabase
        .from("chat_preferences")
        .select("conversation_id, background_type, background_value, outgoing_message_color, incoming_message_color, theme")
        .eq("user_id", user!.id)
        .or(`conversation_id.eq.${conversationId},conversation_id.is.null`);
      if (error) throw error;
      const rows = data ?? [];
      const row = rows.find((item) => item.conversation_id === conversationId) ?? rows[0];
      if (!row) return DEFAULT_PREFERENCES;
      return {
        background_type: (row.background_type as ChatPreferences["background_type"]) ?? "default",
        background_value: row.background_value,
        outgoing_message_color: row.outgoing_message_color,
        incoming_message_color: row.incoming_message_color,
        theme: row.theme ?? "default",
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<ChatPreferences> & { applyToAll?: boolean }) => {
      const { applyToAll, ...values } = patch;
      const next = { ...(query.data ?? DEFAULT_PREFERENCES), ...values };

      // Writes go through the server, which re-checks the Premium subscription.
      await savePreferences({
        data: {
          conversationId,
          background_type: next.background_type,
          background_value: next.background_value ?? null,
          outgoing_message_color: next.outgoing_message_color ?? null,
          incoming_message_color: next.incoming_message_color ?? null,
          theme: next.theme ?? "default",
          ...(applyToAll ? { applyToAll: true } : {}),
        },
      });
    },

    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-preferences"] }),
  });


  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("chat_preferences")
        .delete()
        .eq("user_id", user!.id)
        .eq("conversation_id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-preferences"] }),
  });

  return { preferences: query.data ?? DEFAULT_PREFERENCES, isLoading: query.isLoading, save, reset };
}

/** Resolves a signed URL for a stored background photo. */
export function useBackgroundPhotoUrl(preferences: ChatPreferences) {
  const [url, setUrl] = useState<string | null>(null);
  const path = preferences.background_type === "photo" ? preferences.background_value : null;

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    void supabase.storage
      .from("chat-backgrounds")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
