import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import * as Linking from "expo-linking";
import { getQueryParams } from "expo-auth-session/build/QueryParams";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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

/**
 * Recovery links land as `lingo://reset-password#access_token=...&refresh_token=...&type=recovery`
 * (or `?code=...` depending on the Supabase project's auth flow). `detectSessionInUrl`
 * is off on the mobile client (there's no browser location bar to parse), so the
 * link is parsed and exchanged for a session by hand — the pattern from Supabase's
 * own React Native deep-linking guide.
 */
async function tryHandleRecoveryUrl(url: string): Promise<boolean> {
  const { params, errorCode } = getQueryParams(url);
  if (errorCode) return false;

  if (params["access_token"] && params["refresh_token"]) {
    const { error } = await supabase.auth.setSession({
      access_token: params["access_token"],
      refresh_token: params["refresh_token"],
    });
    return !error;
  }

  if (params["code"]) {
    const { error } = await supabase.auth.exchangeCodeForSession(params["code"]);
    return !error;
  }

  return false;
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
      const handled = await tryHandleRecoveryUrl(url);
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
          await supabase.auth.signOut();
          setNeedsPasswordReset(false);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
