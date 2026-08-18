import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE } from "react-native-purchases";
import type { CustomerInfo, PurchasesError, PurchasesOffering, PurchasesPackage } from "react-native-purchases";

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;

/**
 * Must match exactly the entitlement identifier configured in the
 * RevenueCat dashboard — see the Phase 11 report's external configuration
 * section. Used only for optimistic client-side UX (has the purchase the
 * user just made attached the entitlement locally yet?), never as the
 * authorization gate: that stays server-side, via is_premium_user() /
 * GET /api/quota, exactly as before this phase.
 */
export const PREMIUM_ENTITLEMENT_ID = "premium";

let configuredForUserId: string | null = null;

/**
 * Android is intentionally not wired up in this phase — Play Billing needs
 * its own RevenueCat dashboard product configuration, out of scope for the
 * iOS validation this phase targets (see the Phase 11 report). Every
 * function below no-ops cleanly on Android/without an API key rather than
 * throwing, so the rest of the app never has to branch on platform.
 */
export function isRevenueCatConfigured(): boolean {
  return Platform.OS === "ios" && Boolean(IOS_API_KEY);
}

/** Configures/identifies the SDK for `userId` — called once per signed-in session from the protected layout. */
export async function configureRevenueCat(userId: string): Promise<void> {
  if (!isRevenueCatConfigured() || configuredForUserId === userId) return;
  try {
    if (!configuredForUserId) {
      if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey: IOS_API_KEY!, appUserID: userId });
    } else {
      await Purchases.logIn(userId);
    }
    configuredForUserId = userId;
  } catch (err) {
    console.warn("[iap] configuration RevenueCat impossible:", err instanceof Error ? err.message : err);
  }
}

/** Called before supabase.auth.signOut(), same lifecycle as unregisterPushToken. */
export async function logOutRevenueCat(): Promise<void> {
  if (!configuredForUserId) return;
  try {
    await Purchases.logOut();
  } catch {
    // Best-effort — sign-out must never be blocked by this.
  } finally {
    configuredForUserId = null;
  }
}

export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isRevenueCatConfigured()) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export class PurchaseCancelledError extends Error {}

/** Throws PurchaseCancelledError for a user-initiated cancel (checked via the non-deprecated error code, not the deprecated `userCancelled` boolean) — any other failure rethrows as-is. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  try {
    const result = await Purchases.purchasePackage(pkg);
    return result.customerInfo;
  } catch (err) {
    const code = (err as PurchasesError)?.code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      throw new PurchaseCancelledError();
    }
    throw err;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/** Optimistic, local-only check — never used to authorize a privileged operation. */
export function hasActiveEntitlement(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]);
}
