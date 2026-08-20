import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type Profile = {
  username: string | null;
  country: string | null;
  primary_language: string | null;
};

type ProfileContextValue = {
  profile: Profile | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Single shared fetch behind a context — every screen reads/refetches the
 * same profile. Without this, each `useProfile()` call had its own copy, so
 * e.g. onboarding's `refetch()` after saving country/language never reached
 * the (protected) layout's own copy, which kept gating on the stale row and
 * never let the user past onboarding.
 */
export function ProfileProvider({ children }: PropsWithChildren) {
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

  return (
    <ProfileContext.Provider value={{ profile, isLoading, refetch }}>{children}</ProfileContext.Provider>
  );
}

/** Own profile row — columns needed for Phase 1 (identity + onboarding gate). */
export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used within a ProfileProvider");
  return value;
}
