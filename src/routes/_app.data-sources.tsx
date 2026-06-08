import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { ScoreRing } from "@/components/ex/ScoreRing";
import { DisconnectButton } from "@/components/ex/DisconnectButton";
import { useBusinessData } from "@/hooks/useBusinessData";

export const Route = createFileRoute("/_app/data-sources")({
  component: DataSources,
});

function DataSources() {
  const { business, disconnectShopify, disconnectMeta } = useBusinessData();

  const disconnectFor = (name: string) =>
    name === "Meta Ads" ? disconnectMeta : disconnectShopify;

  const isShopifyConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("shopify"),
  );
  const isMetaConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("meta"),
  );

  const platforms = [
    {
      name: "Shopify",
      section: "Store",
      status: isShopifyConnected ? "connected" : "missing",
      sync: isShopifyConnected ? "Synced live" : "—",
      impact: "Valuation range narrowed by £15k",
      explanation:
        "Your core revenue engine — orders, products and customers. This is all we need to build your Exit Score.",
    },
    {
      name: "Meta Ads",
      section: "Marketing",
      status: isMetaConnected ? "connected" : "missing",
      sync: isMetaConnected ? "Synced live" : "—",
      impact: "Marketing efficiency verified with real ROAS",
      explanation: "Verify acquisition costs and blended ROAS.",
    },
    {
      name: "Google Ads",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Verify ROAS on high-intent channels.",
    },
    {
      name: "P&L Upload",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Tighten your valuation range with verified financials.",
    },
    {
      name: "Triple Whale",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Validate blended CPA and margin metrics.",
    },
    {
      name: "Google Analytics 4",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Give buyers confidence in your traffic quality.",
    },
    {
      name: "TikTok Ads",
      section: "Coming Soon",
      status: "missing",
      sync: "—",
      explanation: "Optional platform connection.",
    },
    {
      name: "Snapchat Ads",
      section: "Coming Soon",
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

  const sections = ["Store", "Marketing", "Coming Soon"] as const;

  const sectionLabel = (sec: (typeof sections)[number]) =>
    sec === "Coming Soon"
      ? "More Integrations — Coming Soon"
      : sec === "Marketing"
        ? "Connect Your Marketing"
        : "Connect Your Store";

  return (
    <>
      <PageHeader
        title="Data Sources"
        subtitle="Connect your Shopify store to generate your Exit Score. More integrations are on the way."
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
          <SectionLabel>{sectionLabel(sec)}</SectionLabel>
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
                      <StatusBadge
                        status={
                          sec === "Coming Soon"
                            ? "coming-soon"
                            : (p.status as "connected" | "missing")
                        }
                      />
                      {sec !== "Coming Soon" &&
                        (p.name === "Meta Ads" ? (
                          <Link
                            to={
                              p.status === "connected"
                                ? "/meta-data"
                                : "/meta-connect"
                            }
                            className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] font-medium"
                          >
                            {p.status === "connected" ? "Manage" : "Connect"}
                          </Link>
                        ) : (
                          <Link
                            to={
                              p.status === "connected"
                                ? "/store-data"
                                : "/shopify-connect"
                            }
                            className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] font-medium"
                          >
                            {p.status === "connected" ? "Manage" : "Connect"}
                          </Link>
                        ))}
                      {sec !== "Coming Soon" && p.status === "connected" && (
                        <DisconnectButton
                          name={p.name}
                          onConfirm={disconnectFor(p.name)}
                        />
                      )}
                    </div>
                  </div>
                  {"impact" in p && p.impact && p.status === "connected" && (
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
        🔒 Bank-grade encryption. Your data is never shared with buyers without
        your permission.
      </div>
    </>
  );
}
