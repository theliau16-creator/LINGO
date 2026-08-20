import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type UserSettings = {
  auto_translate: boolean;
  show_online_status: boolean;
  read_receipts_enabled: boolean;
};

const DEFAULTS: UserSettings = { auto_translate: true, show_online_status: true, read_receipts_enabled: true };

/** Direct port of the settingsQuery + update mutation in src/routes/_authenticated/settings.tsx. */
export function useUserSettings() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
    setSettings({
      auto_translate: data?.auto_translate ?? true,
      show_online_status: data?.show_online_status ?? true,
      read_receipts_enabled: data?.read_receipts_enabled ?? true,
    });
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function update(patch: Partial<UserSettings>) {
    if (!userId) return;
    setSettings((current) => ({ ...current, ...patch }));
    const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
    if (error) {
      void refetch();
      throw error;
    }
  }

  return { settings, isLoading, update };
}
