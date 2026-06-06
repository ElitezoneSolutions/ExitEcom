import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X, ChevronDown, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { RunReportCard, RecomputeButton } from "@/components/ex/RunReportCard";
import { useReport } from "@/hooks/useReport";
import { fmtGBP } from "@/lib/utils";

export const Route = createFileRoute("/_app/valuation")({
  component: Valuation,
});

function Valuation() {
  const { isShopifyConnected, report, computing, run } = useReport();
  const [open, setOpen] = useState(false);

  if (!isShopifyConnected) {
    return (
      <ConnectShopifyGate title="Valuation Engine" feature="your valuation" />
    );
  }

  if (!report) {
    return (
      <>
        <PageHeader
          title="Valuation Engine"
          subtitle="What a buyer will actually pay — and why."
        />
        <RunReportCard
          feature="Valuation Engine"
          blurb="We translate your trailing-twelve-month revenue and earnings into a buyer-grade valuation range with three scenarios."
          cta="Run Valuation Engine"
          onRun={run}
          computing={computing}
        />
      </>
    );
  }

  const { valuation: v, metrics } = report;
  const mult = (val: number) =>
    v.adjustedEarnings > 0 ? (val / v.adjustedEarnings).toFixed(1) : "0";

  return (
    <>
      <PageHeader
        title="Valuation Engine"
        subtitle="What a buyer will actually pay — and why."
        right={<RecomputeButton onRun={run} computing={computing} />}
      />

      {/* Hero */}
      <div className="card-dark p-10">
        <SectionLabel dark>Buyer-Grade Valuation</SectionLabel>
        <p className="mt-3 text-xs text-[var(--text-on-dark-secondary)]">
          Derived from your real order and earnings data
        </p>
        <div className="mt-8 grid lg:grid-cols-3 gap-6 items-end">
          <div className="lg:col-span-2">
            <div className="font-display text-[var(--accent)] text-[56px] md:text-[68px] leading-none">
              {fmtGBP(v.valuationLow)} — {fmtGBP(v.valuationHigh)}
            </div>
            <div className="mt-4 font-display text-xl text-[var(--text-on-dark)]">
              Fair Market Value: {fmtGBP(v.fairMarket)}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Chip>Current Multiple: {v.currentMultiple}x</Chip>
              <Chip>Adjusted Earnings: {fmtGBP(v.adjustedEarnings)}</Chip>
            </div>
          </div>
          <div className="lg:text-right">
            <div className="font-display text-2xl text-[var(--accent)]">
              You're leaving {fmtGBP(v.valueGap)} on the table.
            </div>
          </div>
        </div>
      </div>

      {/* Value opportunity */}
      <div
        className="mt-8 card-light p-8"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <h3 className="font-display text-2xl">Your Value Opportunity</h3>
        <div className="mt-4 flex items-center gap-6 text-sm flex-wrap">
          <div>
            <span className="text-[var(--text-muted)]">Current:</span>{" "}
            <span className="font-display text-lg">{fmtGBP(v.fairMarket)}</span>{" "}
            at {v.currentMultiple}x
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
          <div>
            <span className="text-[var(--text-muted)]">Potential:</span>{" "}
            <span className="font-display text-lg text-[var(--accent)]">
              {fmtGBP(v.optimised)}
            </span>{" "}
            at {v.optimisedMultiple}x
          </div>
        </div>
        <div className="mt-6 h-3 bg-[var(--bg-secondary)] rounded-sm relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--text-secondary)]"
            style={{ width: "55%" }}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-[var(--accent)]"
            style={{ left: "55%" }}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-[var(--accent)]"
            style={{ left: "85%" }}
          />
        </div>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          Valuation suppressed by:{" "}
          {v.negativeDrivers.map((d) => d.name).join(" · ")}
        </p>
      </div>

      {/* Drivers */}
      <div className="mt-12 grid md:grid-cols-2 gap-6">
        <DriverList
          label="Positive Drivers"
          items={v.positiveDrivers}
          positive
        />
        <DriverList label="Negative Drivers" items={v.negativeDrivers} />
      </div>

      {/* Scenarios */}
      <div className="mt-12">
        <SectionLabel>Three Scenarios</SectionLabel>
        <div className="mt-5 grid md:grid-cols-3 gap-5">
          <Scenario
            label="Quick Sale"
            v={v.quickSale}
            m={`${mult(v.quickSale)}x`}
            desc="Conservative market conditions"
            muted
          />
          <Scenario
            label="Fair Market"
            v={v.fairMarket}
            m={`${mult(v.fairMarket)}x`}
            desc="Current realistic expectation"
            gold
          />
          <Scenario
            label="Optimised"
            v={v.optimised}
            m={`${mult(v.optimised)}x`}
            desc="After implementing optimization plan"
            accent
          />
        </div>
      </div>

      {/* Methodology */}
      <div className="mt-10">
        <button
          onClick={() => setOpen((o) => !o)}
          className="card-light w-full px-6 py-4 flex items-center justify-between hover:border-[var(--accent)] transition-colors"
        >
          <span className="text-sm font-medium">
            View Valuation Methodology
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="mt-3 card-light p-6 text-sm text-[var(--text-secondary)] space-y-3 leading-relaxed">
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                Earnings (SDE):
              </span>{" "}
              From {fmtGBP(metrics.revenueTTM)} trailing-twelve-month revenue at
              a {Math.round(metrics.grossMargin * 100)}% gross margin and{" "}
              {Math.round(metrics.netMargin * 100)}% net margin benchmark,
              yielding {fmtGBP(v.adjustedEarnings)} adjusted earnings.
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                Multiple:
              </span>{" "}
              Set by the Exit Readiness Score ({v.currentMultiple}x at fair
              market), adjusted up to {v.optimisedMultiple}x once risks are
              addressed.
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                Note:
              </span>{" "}
              COGS, ad spend and net margin use industry-standard benchmarks —
              connect a P&amp;L to replace them with verified figures.
            </p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[var(--border-warm)]">
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 border border-[var(--border-dark)] rounded-sm text-xs text-[var(--text-on-dark)]">
      {children}
    </span>
  );
}

function DriverList({
  label,
  items,
  positive,
}: {
  label: string;
  items: { name: string; impact: string }[];
  positive?: boolean;
}) {
  return (
    <div className="card-light p-6">
      <SectionLabel>{label}</SectionLabel>
      <ul className="mt-4 space-y-3">
        {items.map((d) => (
          <li key={d.name} className="flex items-center gap-3 text-sm">
            {positive ? (
              <Check
                className="w-4 h-4 text-[var(--positive)] shrink-0"
                strokeWidth={2}
              />
            ) : (
              <X
                className="w-4 h-4 text-[var(--risk-critical)] shrink-0"
                strokeWidth={2}
              />
            )}
            <span className="flex-1 text-[var(--text-primary)]">{d.name}</span>
            <span
              className="font-display"
              style={{
                color: positive ? "var(--positive)" : "var(--risk-critical)",
              }}
            >
              {d.impact}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Scenario({
  label,
  v,
  m,
  desc,
  muted,
  gold,
  accent,
}: {
  label: string;
  v: number;
  m: string;
  desc: string;
  muted?: boolean;
  gold?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-7"
      style={{
        backgroundColor: accent ? "var(--accent)" : "var(--bg-primary)",
        border: gold
          ? "1px solid var(--accent)"
          : accent
            ? "none"
            : "1px solid var(--border-warm)",
        opacity: muted ? 0.85 : 1,
      }}
    >
      <div
        className="text-[10px] tracking-[0.18em] uppercase font-medium"
        style={{
          color: accent ? "var(--accent-foreground)" : "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div
        className="font-display text-4xl mt-4"
        style={{
          color: accent ? "var(--accent-foreground)" : "var(--text-primary)",
        }}
      >
        {fmtGBP(v)}
      </div>
      <div
        className="mt-1 font-display text-lg"
        style={{ color: accent ? "var(--accent-foreground)" : "var(--accent)" }}
      >
        {m}
      </div>
      <p
        className="mt-4 text-sm"
        style={{
          color: accent ? "rgba(255, 255, 255, 0.82)" : "var(--text-secondary)",
        }}
      >
        {desc}
      </p>
    </div>
  );
}
