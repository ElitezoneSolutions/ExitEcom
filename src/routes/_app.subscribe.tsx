import { useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Check, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { createCheckoutSessionFn } from "@/lib/billing";

interface SubscribeSearch {
  checkout?: string;
}

export const Route = createFileRoute("/_app/subscribe")({
  validateSearch: (search: Record<string, unknown>): SubscribeSearch => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  component: Subscribe,
});

const PLAN_FEATURES = [
  "Full ExitOS dashboard",
  "Risk Scanner & Valuation Engine",
  "Optimization Plan, Investment Memo, Data Room",
  "AI-polished recommendations",
];

function Subscribe() {
  const { session } = useAuth();
  const { configured } = useSubscription();
  const search = useSearch({ from: "/_app/subscribe" });
  const [loading, setLoading] = useState(false);

  const startCheckout = async () => {
    if (!session?.access_token) {
      toast.error("Please sign in again.");
      return;
    }
    setLoading(true);
    try {
      const { configured: ok, url } = await createCheckoutSessionFn({
        data: {
          accessToken: session.access_token,
          origin: window.location.origin,
        },
      });
      if (!ok || !url) {
        toast.error("Billing isn't available right now. Please try again later.");
        setLoading(false);
        return;
      }
      window.location.href = url; // hand off to Stripe-hosted Checkout
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't start checkout.",
      );
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Subscribe to ExitEcom"
        subtitle="An active subscription is required to access your Exit Readiness reports."
      />

      {search.checkout === "cancelled" && (
        <div className="card-light p-4 mb-6 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <AlertCircle className="w-4 h-4 text-[var(--accent)]" />
          Checkout was cancelled — you have not been charged.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card-dark p-7 lg:col-span-2">
          <div className="label-caps-dark" style={{ fontSize: 10 }}>
            Professional
          </div>
          <div className="font-display text-3xl text-[var(--accent)] mt-3">
            £199<span className="text-lg">/mo</span>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-[var(--text-on-dark)]">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="card-light p-7 flex flex-col">
          <div className="text-sm text-[var(--text-secondary)]">
            Cancel anytime from the billing portal. Secure payment handled by
            Stripe.
          </div>
          <button
            onClick={startCheckout}
            disabled={loading || !configured}
            className="btn-primary w-full justify-center mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Redirecting…
              </>
            ) : (
              "Subscribe"
            )}
          </button>
          {!configured && (
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Billing is not enabled on this deployment.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
