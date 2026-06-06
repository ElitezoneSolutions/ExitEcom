import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ActionCard } from "@/components/ex/ActionCard";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { RunReportCard, RecomputeButton } from "@/components/ex/RunReportCard";
import { useReport } from "@/hooks/useReport";
import { fmtGBP } from "@/lib/utils";

export const Route = createFileRoute("/_app/optimization")({
  component: Optimization,
});

function Optimization() {
  const { isShopifyConnected, report, computing, run } = useReport();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }));

  if (!isShopifyConnected) {
    return (
      <ConnectShopifyGate
        title="Optimization Plan"
        feature="your optimization plan"
      />
    );
  }

  if (!report) {
    return (
      <>
        <PageHeader
          title="Optimization Plan"
          subtitle="The highest-impact actions to increase what buyers will pay."
        />
        <RunReportCard
          feature="Optimization Plan"
          blurb="We turn your store's weak points into a prioritised action plan with an estimated £ uplift for each move."
          cta="Run Optimization Plan"
          onRun={run}
          computing={computing}
        />
      </>
    );
  }

  const { actions, valuation: v } = report;
  const totalUnlock = actions.reduce((s, a) => s + a.uplift, 0);
  const afterQuickWins = v.valuationMid + Math.round(v.valueGap * 0.4);

  return (
    <>
      <PageHeader
        title="Optimization Plan"
        subtitle="The highest-impact actions to increase what buyers will pay."
        right={<RecomputeButton onRun={run} computing={computing} />}
      />

      <div className="grid md:grid-cols-3 gap-5">
        <Hero
          label="Total Unlock Potential"
          value={fmtGBP(totalUnlock)}
          sub="Across all priority actions"
        />
        <Hero
          label="Actions Required"
          value={`${actions.length} total`}
          sub={`${actions.filter((a) => a.priority === "high").length} High priority`}
        />
        <Hero
          label="Est. Time to Improve"
          value="2–3 months"
          sub="Sequenced for compounding impact"
        />
      </div>

      <div className="mt-12">
        <SectionLabel>Highest Impact Actions</SectionLabel>
        <div className="mt-5 space-y-4">
          {actions.map((a) => (
            <ActionCard key={a.title} {...a} />
          ))}
        </div>
      </div>

      <div className="mt-12">
        <SectionLabel>Implementation Roadmap</SectionLabel>
        <div className="mt-5 grid md:grid-cols-3 gap-5">
          {actions.map((a) => (
            <div key={a.title} className="card-light p-6">
              <div className="label-caps-gold" style={{ fontSize: 10 }}>
                {a.title} · {a.time}
              </div>
              <ul className="mt-5 space-y-3">
                {a.steps.map((it) => {
                  const k = `${a.title}::${it}`;
                  const isChecked = checked[k];
                  return (
                    <li key={it}>
                      <button
                        onClick={() => toggle(k)}
                        className="flex items-start gap-3 text-sm text-left w-full group"
                      >
                        <span
                          className="mt-0.5 inline-flex items-center justify-center w-4 h-4 border rounded-sm shrink-0 transition-colors"
                          style={{
                            backgroundColor: isChecked
                              ? "var(--accent)"
                              : "transparent",
                            borderColor: isChecked
                              ? "var(--accent)"
                              : "var(--border-warm)",
                          }}
                        >
                          {isChecked && (
                            <span className="text-[10px] text-[var(--accent-foreground)]">
                              ✓
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            textDecoration: isChecked ? "line-through" : "none",
                            color: isChecked
                              ? "var(--text-muted)"
                              : "var(--text-primary)",
                          }}
                        >
                          {it}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 card-light p-8">
        <SectionLabel>Progression Summary</SectionLabel>
        <div className="mt-6 flex items-center justify-between gap-4">
          <Step label="Current Value" v={v.valuationMid} />
          <Connector />
          <Step label="After Quick Wins" v={afterQuickWins} />
          <Connector />
          <Step label="After Full Plan" v={v.valuationOptimised} accent />
        </div>
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

function Step({
  label,
  v,
  accent,
}: {
  label: string;
  v: number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="w-3 h-3 rounded-full"
        style={{
          backgroundColor: accent ? "var(--accent)" : "var(--text-muted)",
        }}
      />
      <div
        className="font-display text-2xl mt-3"
        style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}
      >
        {fmtGBP(v)}
      </div>
      <div className="text-xs text-[var(--text-muted)] mt-1">{label}</div>
    </div>
  );
}

function Connector() {
  return <div className="flex-1 h-px bg-[var(--border-warm)]" />;
}
