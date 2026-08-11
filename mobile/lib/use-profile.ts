import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

type Profile = { username: string | null };

/** Own profile row (username only, matches the public-column grant the API allows). */
export function useProfile(): Profile | null {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  return profile;
}
