import { useEffect, useRef } from "react";
import { useAuth } from "./auth-context";
import { configureRevenueCat } from "./revenuecat";

/** Mounted once in the protected layout, same placement/lifecycle as usePushNotifications. */
export function useRevenueCatSession() {
  const { session } = useAuth();
  const configuredFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || configuredFor.current === userId) return;
    configuredFor.current = userId;
    void configureRevenueCat(userId);
  }, [session?.user.id]);
}
