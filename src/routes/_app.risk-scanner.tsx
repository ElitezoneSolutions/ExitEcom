import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { RiskCard } from "@/components/ex/RiskCard";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { RunReportCard, RecomputeButton } from "@/components/ex/RunReportCard";
import { useReport } from "@/hooks/useReport";
import { fmtGBP } from "@/lib/utils";

export const Route = createFileRoute("/_app/risk-scanner")({
  component: RiskScanner,
});

function RiskScanner() {
  const { isShopifyConnected, report, computing, run } = useReport();

  if (!isShopifyConnected) {
    return (
      <ConnectShopifyGate title="Risk Scanner" feature="your risk profile" />
    );
  }

  if (!report) {
    return (
      <>
        <PageHeader
          title="Risk Scanner"
          subtitle="Buyer-grade risk intelligence — focused, not a firehose."
        />
        <RunReportCard
          feature="Risk Scanner"
          blurb="We surface the risks a buyer will price in — concentration, retention and channel dependency — from your real store data."
          cta="Run Risk Scanner"
          onRun={run}
          computing={computing}
        />
      </>
    );
  }

  const { risks, valuation, score } = report;
  const riskScore = Math.max(0, 100 - score.exitScore);
  const counts = {
    high: risks.filter((r) => r.severity === "high").length,
    medium: risks.filter((r) => r.severity === "medium").length,
    low: risks.filter((r) => r.severity === "low").length,
  };

  return (
    <>
      <PageHeader
        title="Risk Scanner"
        subtitle="Buyer-grade risk intelligence — focused, not a firehose."
        right={<RecomputeButton onRun={run} computing={computing} />}
      />

      <div className="grid md:grid-cols-3 gap-5">
        <Hero
          label="Risk Score"
          value={`${riskScore} / 100`}
          sub={
            riskScore > 50
              ? "Elevated Risk"
              : riskScore > 30
                ? "Moderate Risk"
                : "Low Risk"
          }
        />
        <Hero
          label="Estimated Value Lost"
          value={fmtGBP(valuation.valueGap)}
          sub="Across all identified risks"
        />
        <Hero
          label="Risks Identified"
          value={`${risks.length} total`}
          sub={`${counts.high} High · ${counts.medium} Medium · ${counts.low} Low`}
        />
      </div>

      <div className="mt-12">
        <SectionLabel>Critical Buyer Concerns</SectionLabel>
        <div className="mt-4 space-y-4">
          {risks.map((r) => (
            <RiskCard key={r.title} {...r} />
          ))}
        </div>
      </div>

      {/* Valuation impact summary */}
      <div className="mt-12 card-light p-8">
        <SectionLabel>Valuation Impact Summary</SectionLabel>
        <div className="mt-6 grid md:grid-cols-3 gap-6 items-center">
          <div className="text-center">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Current Value
            </div>
            <div className="font-display text-3xl mt-2 text-[var(--text-muted)]">
              {fmtGBP(valuation.valuationMid)}
            </div>
          </div>
          <div className="text-center text-[var(--text-muted)]">
            <div>→</div>
            <div className="text-xs mt-2">If risks addressed</div>
          </div>
          <div className="text-center">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Potential Value
            </div>
            <div className="font-display text-3xl mt-2 text-[var(--accent)]">
              {fmtGBP(valuation.valuationOptimised)}
            </div>
          </div>
        </div>
        <div className="mt-6 h-2 bg-[var(--bg-secondary)] rounded-sm relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--text-muted)]"
            style={{ width: "65%" }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-[var(--accent)]"
            style={{ width: "35%" }}
          />
        </div>
        <div className="mt-3 text-center text-xs text-[var(--text-muted)] tracking-[0.12em] uppercase">
          {fmtGBP(valuation.valueGap)} Opportunity
        </div>
      </div>

      <div className="mt-8 px-6 py-4 flex items-center justify-between flex-wrap gap-3 border-t border-[var(--border-warm)]">
        <span className="text-sm text-[var(--text-secondary)]">
          Address these risks to unlock {fmtGBP(valuation.valueGap)} in exit
          value.
        </span>
        <Link
          to="/optimization"
          className="text-sm text-[var(--accent)] hover:text-[var(--accent-muted)] inline-flex items-center gap-1"
        >
          Open Optimization Plan <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </>
  );
}

function Hero({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card-dark p-7">
      <div className="label-caps-dark" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div className="font-display text-[var(--accent)] text-4xl mt-4 leading-none">
        {value}
      </div>
      <div className="mt-3 text-xs text-[var(--text-on-dark-secondary)]">
        {sub}
      </div>
    </div>
  );
}
