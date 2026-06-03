import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ActionCard } from "@/components/ex/ActionCard";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { useBusinessData } from "@/hooks/useBusinessData";
import { topActions, fmtGBP } from "@/lib/mock";

export const Route = createFileRoute("/app/optimization")({
  component: Optimization,
});

const roadmap = {
  "Quick Wins (0–48 hours)": [
    "Add trust badges to PDP",
    "Collect 30 customer reviews",
    "Fix mobile checkout UX",
  ],
  "Short-term (1–4 weeks)": [
    "Improve top-3 ad creatives",
    "Launch welcome & post-purchase email flows",
    "Optimise product pricing",
  ],
  "Strategic (1–3 months)": [
    "Add 2 adjacent product lines",
    "Build SOPs for top workflows",
    "Launch organic content channel",
  ],
};

function Optimization() {
  const { isShopifyConnected } = useBusinessData();
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

  return (
    <>
      <PageHeader
        title="Optimization Plan"
        subtitle="The highest-impact actions to increase what buyers will pay."
      />

      <div className="grid md:grid-cols-3 gap-5">
        <Hero
          label="Total Unlock Potential"
          value={fmtGBP(120000)}
          sub="Across all priority actions"
        />
        <Hero
          label="Actions Required"
          value="8 total"
          sub="3 High · 3 Medium · 2 Quick Wins"
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
          {topActions.map((a) => (
            <ActionCard key={a.title} {...a} />
          ))}
        </div>
      </div>

      <div className="mt-12">
        <SectionLabel>Implementation Roadmap</SectionLabel>
        <div className="mt-5 grid md:grid-cols-3 gap-5">
          {Object.entries(roadmap).map(([col, items]) => (
            <div key={col} className="card-light p-6">
              <div className="label-caps-gold" style={{ fontSize: 10 }}>
                {col}
              </div>
              <ul className="mt-5 space-y-3">
                {items.map((it) => {
                  const k = `${col}::${it}`;
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
          <Step label="Current Value" v={220000} />
          <Connector />
          <Step label="After Quick Wins" v={255000} />
          <Connector />
          <Step label="After Full Plan" v={340000} accent />
        </div>
      </div>

      <div className="mt-10 flex flex-wrap justify-between gap-4">
        <button className="btn-primary">
          Download Full Optimization Report (PDF)
        </button>
        <a className="btn-ghost-light" href="/app/financial-normalizer">
          Continue to Financial Normalizer →
        </a>
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
