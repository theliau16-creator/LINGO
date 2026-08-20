import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type BlockedUser = { id: string; userId: string; username: string };

/** Direct port of the blockedQuery + unblock mutation in src/routes/_authenticated/settings.tsx. */
export function useBlockedUsers() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) return;
    const { data: rows } = await supabase.from("blocked_users").select("id, blocked_id").eq("user_id", userId);
    const ids = (rows ?? []).map((row) => row.blocked_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, username").in("id", ids)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
    setBlocked((rows ?? []).map((row) => ({ id: row.id, userId: row.blocked_id, username: nameById.get(row.blocked_id) ?? "Compte" })));
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function unblock(blockedId: string) {
    if (!userId) return;
    const { error } = await supabase.from("blocked_users").delete().eq("user_id", userId).eq("blocked_id", blockedId);
    if (error) throw error;
    await refetch();
  }

  return { blocked, isLoading, unblock };
}
