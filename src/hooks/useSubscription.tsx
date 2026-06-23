import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getBillingStatusFn, type BillingStatus } from "@/lib/billing";

// Reads the signed-in user's billing status via the server function (the single
// source of truth — it knows both whether Stripe is configured and the user's
// subscription row). The paywall in _app.tsx consumes `hasAccess`.
//
// Resolution states mirror useAuth's `role`: `loading` true until the first
// resolve completes; treat that as "not yet known", never "no access".
//
// Demo mode (no Supabase) and any deployment without Stripe configured both
// resolve to full access — the paywall is opt-in via the STRIPE_* env vars.

interface UseSubscription extends BillingStatus {
  loading: boolean;
  /** Re-fetch status (e.g. after returning from Stripe Checkout). */
  refresh: () => Promise<void>;
}

const FULL_ACCESS: BillingStatus = {
  configured: false,
  status: "none",
  hasAccess: true,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  priceId: null,
};

export function useSubscription(): UseSubscription {
  const { user, session, isDemoMode } = useAuth();
  const [state, setState] = useState<BillingStatus>(FULL_ACCESS);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    // No backend / no session → nothing to gate on; grant access.
    if (isDemoMode || !user || !session?.access_token) {
      setState(FULL_ACCESS);
      setLoading(false);
      return;
    }
    try {
      const status = await getBillingStatusFn({
        data: { accessToken: session.access_token },
      });
      setState(status);
    } catch {
      // Never trap the user on a transient billing-status error: fail open so a
      // glitch in Stripe/DB doesn't lock paying users out of the whole app.
      setState(FULL_ACCESS);
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, user, session?.access_token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await fetchStatus();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStatus]);

  return { ...state, loading, refresh: fetchStatus };
}
