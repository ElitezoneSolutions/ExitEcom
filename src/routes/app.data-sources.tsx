import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { ScoreRing } from "@/components/ex/ScoreRing";
import { useBusinessData } from "@/hooks/useBusinessData";

export const Route = createFileRoute("/app/data-sources")({
  component: DataSources,
});

function DataSources() {
  const { business } = useBusinessData();

  const isShopifyConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("shopify")
  );
  const isMetaConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("meta")
  );
  const isGoogleConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("google")
  );

  const platforms = [
    {
      name: "Shopify",
      section: "Store",
      status: isShopifyConnected ? "connected" : "missing",
      sync: isShopifyConnected ? "Synced live" : "—",
      impact: "Valuation range narrowed by £15k",
      explanation: "Connects your core revenue engine.",
    },
    {
      name: "Meta Ads",
      section: "Marketing",
      status: isMetaConnected ? "connected" : "missing",
      sync: isMetaConnected ? "12 min ago" : "—",
      impact: "Score increased by 3 pts",
      explanation: "Allows buyers to verify acquisition costs.",
    },
    {
      name: "Google Ads",
      section: "Marketing",
      status: isGoogleConnected ? "connected" : "missing",
      sync: isGoogleConnected ? "1 hour ago" : "—",
      impact: "Score increased by 2 pts",
      explanation: "Verifies ROAS on high-intent channels.",
    },
    {
      name: "P&L Upload",
      section: "Financial",
      status: "missing",
      sync: "—",
      explanation: "Without this, your valuation range is £40k wider than it needs to be.",
    },
    {
      name: "Triple Whale",
      section: "Financial",
      status: "missing",
      sync: "—",
      explanation: "Validates blended CPA and margin metrics.",
    },
    {
      name: "Google Analytics 4",
      section: "Analytics",
      status: "missing",
      sync: "—",
      explanation: "Without this, buyers discount your traffic quality.",
    },
    {
      name: "TikTok Ads",
      section: "More Platforms",
      status: "missing",
      sync: "—",
      explanation: "Optional platform connection.",
    },
    {
      name: "Snapchat Ads",
      section: "More Platforms",
      status: "missing",
      sync: "—",
      explanation: "Optional platform connection.",
    },
    {
      name: "Bank Statements",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Automated verification for buyers.",
    },
    {
      name: "Amazon Seller Central",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Sync your FBA revenues.",
    },
    {
      name: "WooCommerce",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Alternative storefront integration.",
    },
  ] as const;

  const sections = [
    "Store",
    "Marketing",
    "Financial",
    "Analytics",
    "More Platforms",
    "Coming Soon",
  ] as const;

  return (
    <>
      <PageHeader
        title="Data Sources"
        subtitle="The more data you connect, the more accurate your Exit Score."
        right={
          <div className="card-light p-5 flex items-center gap-4">
            <ScoreRing
              score={business.dataConfidence}
              size={72}
              color="var(--accent)"
              trackColor="var(--border-warm)"
            />
            <div>
              <div className="label-caps" style={{ fontSize: 10 }}>
                Data Confidence
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 max-w-[180px]">
                {business.dataConfidence >= 85
                  ? "High confidence. Data verified by multiple platforms."
                  : "Connect P&L and GA4 to reach 90%+."}
              </div>
            </div>
          </div>
        }
      />
      {sections.map((sec) => (
        <div key={sec} className="mb-10">
          <SectionLabel>
            {sec} {sec === "Coming Soon" ? "" : "Platforms"}
          </SectionLabel>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {platforms
              .filter((p) => p.section === sec)
              .map((p) => (
                <div
                  key={p.name}
                  className={`card-light px-5 py-4 flex flex-col justify-between ${
                    sec === "Coming Soon" ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5 max-w-[200px]">
                        {p.explanation}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={p.status as "connected" | "missing"} />
                      {sec !== "Coming Soon" && (
                        p.name === "Shopify" ? (
                          <Link
                            to="/app/shopify-connect"
                            className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] font-medium"
                          >
                            {p.status === "connected" ? "Manage" : "Connect"}
                          </Link>
                        ) : (
                          <button className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] font-medium cursor-pointer">
                            {p.status === "connected" ? "Manage" : "Connect"}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  {p.impact && p.status === "connected" && (
                    <div className="mt-3 pt-3 border-t border-[var(--border-warm)] text-[11px] text-[var(--positive)] font-medium">
                      ✓ {p.impact}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="mt-8 pt-6 border-t border-[var(--border-warm)] text-center text-sm text-[var(--text-muted)]">
        🔒 Bank-grade encryption. Your data is never shared with buyers without your permission.
      </div>
    </>
  );
}
