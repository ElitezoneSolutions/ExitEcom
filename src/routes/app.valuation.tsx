import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X, ChevronDown, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import {
  mockBusiness,
  positiveDrivers,
  negativeDrivers,
  fmtGBP,
} from "@/lib/mock";

export const Route = createFileRoute("/app/valuation")({
  component: Valuation,
});

function Valuation() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Valuation Engine"
        subtitle="What a buyer will actually pay — and why."
      />

      {/* Hero */}
      <div className="card-dark p-10">
        <SectionLabel dark>Buyer-Grade Valuation</SectionLabel>
        <p className="mt-3 text-xs text-[var(--text-on-dark-secondary)]">
          Based on real buyer behaviour, not marketplace estimates
        </p>
        <div className="mt-8 grid lg:grid-cols-3 gap-6 items-end">
          <div className="lg:col-span-2">
            <div className="font-display text-[var(--accent)] text-[56px] md:text-[68px] leading-none">
              {fmtGBP(mockBusiness.valuationLow)} —{" "}
              {fmtGBP(mockBusiness.valuationHigh)}
            </div>
            <div className="mt-4 font-display text-xl text-[var(--text-on-dark)]">
              Fair Market Value: {fmtGBP(mockBusiness.fairMarket)}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Chip>Current Multiple: {mockBusiness.currentMultiple}x</Chip>
              <Chip>
                Adjusted Earnings: {fmtGBP(mockBusiness.adjustedEarnings)}
              </Chip>
            </div>
          </div>
          <div className="lg:text-right">
            <div className="font-display text-2xl text-[var(--accent)]">
              You're leaving £80,000 on the table.
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
            <span className="font-display text-lg">{fmtGBP(220000)}</span> at
            1.6x
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
          <div>
            <span className="text-[var(--text-muted)]">Potential:</span>{" "}
            <span className="font-display text-lg text-[var(--accent)]">
              {fmtGBP(300000)}
            </span>{" "}
            at 2.4x
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
          Valuation suppressed by: Founder Dependency · Product Concentration ·
          Limited Operating History
        </p>
      </div>

      {/* Drivers */}
      <div className="mt-12 grid md:grid-cols-2 gap-6">
        <DriverList label="Positive Drivers" items={positiveDrivers} positive />
        <DriverList label="Negative Drivers" items={negativeDrivers} />
      </div>

      {/* Scenarios */}
      <div className="mt-12">
        <SectionLabel>Three Scenarios</SectionLabel>
        <div className="mt-5 grid md:grid-cols-3 gap-5">
          <Scenario
            label="Quick Sale"
            v={90000}
            m="0.9x"
            desc="Conservative market conditions"
            muted
          />
          <Scenario
            label="Fair Market"
            v={160000}
            m="1.6x"
            desc="Current realistic expectation"
            gold
          />
          <Scenario
            label="Optimised"
            v={240000}
            m="2.4x"
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
                SDE calculation:
              </span>{" "}
              Revenue − COGS − Ad Spend − Operating Expenses + Add-backs.
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                Quality adjustments:
              </span>{" "}
              Multiple is adjusted upward for revenue diversity, gross margin
              and growth trajectory.
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">
                Hard constraints:
              </span>{" "}
              Age cap (sub-3-year businesses cap at 2.0x) and profit cap
              (multiples cap when SDE &lt; £80k).
            </p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[var(--border-warm)]">
        <button className="btn-ghost-light text-sm">
          Download Full Valuation Report
        </button>
        <Link
          to="/app/optimization"
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
