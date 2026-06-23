import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { createPortalSessionFn } from "@/lib/billing";

interface BillingSearch {
  checkout?: string;
}

export const Route = createFileRoute("/_app/billing")({
  validateSearch: (search: Record<string, unknown>): BillingSearch => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  component: Billing,
});

const ACCESS_STATUSES = ["active", "trialing", "past_due", "comp"];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Maps the Stripe status to a badge style + human label.
function statusBadge(status: string) {
  switch (status) {
    case "active":
      return { style: "ready" as const, label: "Active" };
    case "trialing":
      return { style: "ready" as const, label: "Trial" };
    case "comp":
      return { style: "connected" as const, label: "Complimentary" };
    case "past_due":
    case "unpaid":
      return { style: "pending" as const, label: "Past due" };
    case "canceled":
      return { style: "missing" as const, label: "Cancelled" };
    default:
      return { style: "missing" as const, label: "No plan" };
  }
}

function Billing() {
  const { session } = useAuth();
  const search = useSearch({ from: "/_app/billing" });
  const {
    configured,
    status,
    hasAccess,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    loading,
    refresh,
  } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  // After returning from Checkout the webhook may lag a second or two — poll the
  // status until it flips to an access-granting state (or we give up).
  const [finalizing, setFinalizing] = useState(search.checkout === "success");
  const pollRan = useRef(false);
  useEffect(() => {
    if (search.checkout !== "success" || pollRan.current) return;
    pollRan.current = true;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      await refresh();
      if (attempts >= 6) setFinalizing(false);
    };
    const id = setInterval(() => void tick(), 2000);
    return () => clearInterval(id);
  }, [search.checkout, refresh]);

  useEffect(() => {
    if (hasAccess && status !== "none") setFinalizing(false);
  }, [hasAccess, status]);

  const openPortal = async () => {
    if (!session?.access_token) {
      toast.error("Please sign in again.");
      return;
    }
    setPortalLoading(true);
    try {
      const { configured: ok, url } = await createPortalSessionFn({
        data: {
          accessToken: session.access_token,
          origin: window.location.origin,
        },
      });
      if (!ok || !url) {
        toast.error("Billing portal is unavailable right now.");
        setPortalLoading(false);
        return;
      }
      window.location.href = url;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't open the billing portal.",
      );
      setPortalLoading(false);
    }
  };

  if (loading || finalizing) {
    return (
      <>
        <PageHeader title="Billing" />
        <div className="card-light p-10 flex items-center justify-center gap-3 text-sm text-[var(--text-secondary)]">
          <RefreshCw className="w-5 h-5 text-[var(--accent)] animate-spin" />
          {finalizing ? "Confirming your subscription…" : "Loading…"}
        </div>
      </>
    );
  }

  // Billing disabled on this deployment (no Stripe env) — no plan to show.
  if (!configured) {
    return (
      <>
        <PageHeader title="Billing" />
        <div className="card-light p-7 text-sm text-[var(--text-secondary)]">
          Billing is not enabled on this deployment.
        </div>
      </>
    );
  }

  const hasPlan = ACCESS_STATUSES.includes(status);
  const badge = statusBadge(status);

  return (
    <>
      <PageHeader
        title="Billing"
        right={
          <button
            onClick={openPortal}
            disabled={portalLoading || status === "comp"}
            className="btn-ghost-light text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {portalLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Manage billing
          </button>
        }
      />

      {!hasPlan ? (
        <div className="card-light p-7">
          <SectionLabel>No active subscription</SectionLabel>
          <p className="text-sm text-[var(--text-secondary)] mt-3">
            You don't have an active plan. Subscribe to access your Exit
            Readiness reports.
          </p>
          <Link
            to="/subscribe"
            className="btn-primary mt-5 text-sm inline-flex"
          >
            View plan
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="card-dark p-7 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="label-caps-dark" style={{ fontSize: 10 }}>
                Current Plan
              </div>
              <StatusBadge status={badge.style}>{badge.label}</StatusBadge>
            </div>
            <div className="font-display text-3xl text-[var(--accent)] mt-3">
              Professional · £199/mo
            </div>
            <div className="text-xs text-[var(--text-on-dark-secondary)] mt-2">
              {status === "comp"
                ? "Complimentary access"
                : cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(currentPeriodEnd)}`
                  : `Renews ${formatDate(currentPeriodEnd)}`}
            </div>
          </div>

          <div className="card-light p-7">
            <SectionLabel>Payment & invoices</SectionLabel>
            <p className="text-sm text-[var(--text-secondary)] mt-3">
              {status === "comp"
                ? "This account has complimentary access — no payment method on file."
                : "Update your card, view invoices, or cancel from the secure Stripe portal."}
            </p>
            {status === "past_due" && (
              <div className="mt-4 flex items-start gap-2 text-xs text-[var(--risk-medium)]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Your last payment failed. Update your card to keep access.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
