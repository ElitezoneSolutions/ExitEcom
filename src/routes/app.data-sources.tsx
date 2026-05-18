import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { ScoreRing } from "@/components/ex/ScoreRing";

export const Route = createFileRoute("/app/data-sources")({ component: DataSources });

const platforms = [
  { name: "Shopify", section: "Store", status: "connected", sync: "5 min ago" },
  { name: "Meta Ads", section: "Marketing", status: "connected", sync: "12 min ago" },
  { name: "Google Ads", section: "Marketing", status: "connected", sync: "1 hour ago" },
  { name: "TikTok Ads", section: "Marketing", status: "missing", sync: "—" },
  { name: "Snapchat Ads", section: "Marketing", status: "missing", sync: "—" },
  { name: "P&L Upload", section: "Financial", status: "missing", sync: "—" },
  { name: "Triple Whale", section: "Financial", status: "missing", sync: "—" },
  { name: "Google Analytics 4", section: "Analytics", status: "missing", sync: "—" },
] as const;

function DataSources() {
  const sections = ["Store", "Marketing", "Financial", "Analytics"] as const;
  return (
    <>
      <PageHeader
        title="Data Sources"
        subtitle="The more data you connect, the more accurate your Exit Score."
        right={
          <div className="card-light p-5 flex items-center gap-4">
            <ScoreRing score={72} size={72} color="var(--accent)" trackColor="var(--border-warm)" />
            <div>
              <div className="label-caps" style={{ fontSize: 10 }}>Data Confidence</div>
              <div className="text-xs text-[var(--text-muted)] mt-1 max-w-[180px]">Connect P&L and GA4 to reach 90%+.</div>
            </div>
          </div>
        }
      />
      {sections.map((sec) => (
        <div key={sec} className="mb-10">
          <SectionLabel>{sec} Platforms</SectionLabel>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {platforms.filter((p) => p.section === sec).map((p) => (
              <div key={p.name} className="card-light px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Last sync: {p.sync}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={p.status as "connected" | "missing"} />
                  <button className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]">
                    {p.status === "connected" ? "Manage" : "Connect"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
