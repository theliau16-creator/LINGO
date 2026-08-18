import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import * as Linking from "expo-linking";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { establishSessionFromUrl } from "./deep-link-session";
import { unregisterPushToken } from "./push-notifications";

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  /** True once a password-recovery deep link has set a session — the app must
   * show the reset-password screen instead of the normal protected area until
   * `completePasswordReset()` is called. */
  needsPasswordReset: boolean;
  completePasswordReset: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an AuthProvider");
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Cold start via a recovery link (app was closed) + links received while running.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });
    return () => subscription.remove();

    async function handleUrl(url: string) {
      if (!url.includes("reset-password")) return;
      const handled = await establishSessionFromUrl(url);
      if (handled) setNeedsPasswordReset(true);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        needsPasswordReset,
        completePasswordReset: () => setNeedsPasswordReset(false),
        signOut: async () => {
          // Must run before signOut(): the delete needs auth.uid() from the
          // still-active session to satisfy the device_tokens_own RLS policy.
          await unregisterPushToken();
          await supabase.auth.signOut();
          setNeedsPasswordReset(false);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
