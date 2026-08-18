import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Realtime stays the source of truth while the app is open — every screen
// already reflects new messages live. Push exists only to wake/alert the
// device when the app is backgrounded or killed, so a foreground push is
// swallowed here instead of showing a redundant system banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Same fallback Expo's own docs use: `extra.eas.projectId` comes from
 * app.json (normally written by `eas init`); `easConfig.projectId` is
 * injected at build/runtime once the project is EAS-linked, and can be
 * present even before app.json is updated.
 */
function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const easConfig = Constants.easConfig as { projectId?: string } | undefined;
  return extra?.eas?.projectId ?? easConfig?.projectId;
}

async function currentPushToken(): Promise<string | null> {
  const projectId = easProjectId();
  if (!projectId) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Requests notification permission (skipped if already decided) and, once
 * granted, registers this device's Expo push token for `userId` — a plain
 * RLS-gated upsert (device_tokens_own policy), no privileged endpoint
 * needed. Silently no-ops without an EAS project id: no `eas.json` exists
 * in this repo yet, so `extra.eas.projectId` resolves to undefined (see
 * easProjectId above). Two separate one-time external steps are still
 * needed even once that id exists — `eas init` alone is not enough:
 *   1. `eas init` (and, per Expo's own docs, `eas credentials` — required
 *      explicitly when NOT using EAS Build, which this project doesn't)
 *      to generate/upload the APNs key real devices need.
 *   2. The aps-environment entitlement itself is already handled: the
 *      expo-notifications config plugin adds it to Lingo.entitlements
 *      automatically on every prebuild, no manual Xcode step needed.
 * Full command sequence documented in the Phase 10 correction report.
 * Never throws: push is a best-effort background task that must not
 * block sign-in or crash the app.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  const projectId = easProjectId();
  if (!projectId) {
    console.warn(
      "[push] extra.eas.projectId manquant dans app.json — notifications push désactivées tant que le projet EAS n'est pas configuré (voir le rapport de la Phase 10).",
    );
    return;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      status = requested.status;
    }
    if (status !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase
      .from("device_tokens")
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: "token" });
    if (error) console.warn("[push] échec de l'enregistrement du token:", error.message);
  } catch (err) {
    console.warn("[push] enregistrement push impossible:", err instanceof Error ? err.message : err);
  }
}

/**
 * Removes this device's token on sign-out so a stale session can never
 * receive a push meant for whoever signs in next on the same device — must
 * run before supabase.auth.signOut(), since the delete needs the RLS
 * policy's auth.uid() to still resolve to the outgoing user.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await currentPushToken();
    if (!token) return;
    await supabase.from("device_tokens").delete().eq("token", token);
  } catch {
    // Best-effort — sign-out must never be blocked by push cleanup.
  }
}
