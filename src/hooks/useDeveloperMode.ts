import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lingo:developer-mode";

/** True when the signed-in user holds the admin role. */
export function useIsAdmin() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return Boolean(data);
    },
  });
}

/** Developer mode: admin-only, opt-in, remembered on the device. */
export function useDeveloperMode() {
  const { data: isAdmin } = useIsAdmin();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle(next: boolean) {
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  return { isAdmin: Boolean(isAdmin), enabled: Boolean(isAdmin) && enabled, toggle, raw: enabled };
}
