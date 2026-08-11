import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type Profile = {
  username: string | null;
  country: string | null;
  primary_language: string | null;
};

/** Own profile row — columns needed for Phase 1 (identity + onboarding gate). */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("username, country, primary_language")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
  }, [refetch]);

  return { profile, isLoading, refetch };
}
