import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Lock } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { fmtGBPk } from "@/lib/utils";

export const Route = createFileRoute("/_app/buyer-matching")({
  component: BuyerMatching,
});

function BuyerMatching() {
  const { business, isShopifyConnected } = useBusinessData();

  if (!isShopifyConnected) {
    return (
      <ConnectShopifyGate
        title="Buyer Matching"
        feature="your matched buyers"
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Buyer Matching"
        subtitle="Get introduced to vetted acquirers actively looking for businesses in your category and revenue range."
      />

      <div className="card-light p-8 rounded-lg text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
          <Users className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
          12 buyers match {business.name}
        </h2>
        <p className="mt-3 text-[15px] text-[var(--text-secondary)] max-w-xl mx-auto">
          Based on your {business.industry} category and a fair-market valuation
          around {fmtGBPk(business.fairMarket)}, we have matched you with
          acquirers in our network. Buyer introductions unlock once your Exit
          Readiness Score and data room are review-ready.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[var(--sidebar-active)] text-xs text-[var(--text-muted)]">
          <Lock className="w-3.5 h-3.5" /> Buyer matching is in private beta
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/exit-score"
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors"
          >
            Improve Your Score
          </Link>
          <Link
            to="/data-room"
            className="px-4 py-2 border border-[var(--border-warm)] text-[var(--text-primary)] text-sm font-medium rounded-md hover:bg-[var(--sidebar-active)] transition-colors"
          >
            Prepare Data Room
          </Link>
        </div>
      </div>
    </>
  );
}
