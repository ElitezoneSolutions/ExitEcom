import { Link } from "@tanstack/react-router";
import { Lock, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";

/**
 * Empty-state shown on result pages until the user connects Shopify.
 * Results (Exit Score, valuation, risks, actions) are derived from Shopify, so
 * we never show numbers — real or placeholder — before a store is connected.
 */
export function ConnectShopifyGate({
  title = "Connect Shopify to unlock this",
  feature = "your Exit Score and results",
}: {
  title?: string;
  feature?: string;
}) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={`We build ${feature} directly from your store data. Connect your Shopify store to get started.`}
      />
      <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
        <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
          <Lock className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
          No data yet
        </h2>
        <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
          Once your Shopify store is connected, we analyse your orders, products
          and customers to generate {feature}. Nothing here is simulated — it is
          all built from your real store.
        </p>
        <Link
          to="/app/data-sources"
          className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors"
        >
          Connect Shopify <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </>
  );
}
