import { useCallback, useEffect, useState } from "react";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import {
  PurchaseCancelledError,
  fetchCurrentOffering,
  hasActiveEntitlement,
  isRevenueCatConfigured,
  purchasePackage as purchasePackageIap,
  restorePurchases as restorePurchasesIap,
} from "./revenuecat";

export type PurchaseOutcome =
  | { ok: true; premium: boolean }
  | { ok: false; cancelled: boolean; message?: string };

/**
 * Fetches the real RevenueCat offering (products actually configured in
 * App Store Connect + the RevenueCat dashboard — nothing hardcoded here)
 * and exposes purchase/restore as plain async actions. Never computes
 * "isPremium" itself: that keeps coming from GET /api/quota exactly as
 * before this phase — this hook only reports the immediate RevenueCat-local
 * outcome, for optimistic UX (loading state, success/cancel/error
 * messaging) while the real entitlement propagates server-side.
 */
export function usePaywall() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [offeringError, setOfferingError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadOffering = useCallback(async () => {
    setLoadingOffering(true);
    setOfferingError(null);
    try {
      setOffering(await fetchCurrentOffering());
    } catch (err) {
      setOfferingError(err instanceof Error ? err.message : "Produits indisponibles.");
    } finally {
      setLoadingOffering(false);
    }
  }, []);

  useEffect(() => {
    void loadOffering();
  }, [loadOffering]);

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
    setPurchasing(true);
    try {
      const customerInfo = await purchasePackageIap(pkg);
      return { ok: true, premium: hasActiveEntitlement(customerInfo) };
    } catch (err) {
      if (err instanceof PurchaseCancelledError) return { ok: false, cancelled: true };
      return { ok: false, cancelled: false, message: err instanceof Error ? err.message : "Achat impossible." };
    } finally {
      setPurchasing(false);
    }
  }, []);

  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    setRestoring(true);
    try {
      const customerInfo = await restorePurchasesIap();
      return { ok: true, premium: hasActiveEntitlement(customerInfo) };
    } catch (err) {
      return { ok: false, cancelled: false, message: err instanceof Error ? err.message : "Restauration impossible." };
    } finally {
      setRestoring(false);
    }
  }, []);

  return {
    available: isRevenueCatConfigured(),
    offering,
    loadingOffering,
    offeringError,
    purchasing,
    restoring,
    purchase,
    restore,
    refetchOffering: loadOffering,
  };
}
