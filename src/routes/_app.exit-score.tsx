import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ProgressBar } from "@/components/ex/ProgressBar";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { RunReportCard, RecomputeButton } from "@/components/ex/RunReportCard";
import { useReport } from "@/hooks/useReport";
import type { ScoreDimension } from "@/lib/analytics";
import { fmtGBP, fmtGBPk } from "@/lib/utils";

export const Route = createFileRoute("/_app/exit-score")({
  component: ExitScore,
});

function ExitScore() {
  const { isShopifyConnected, report, computing, run } = useReport();

  if (!isShopifyConnected) {
    return (
      <ConnectShopifyGate
        title="Exit Readiness Score"
        feature="your Exit Readiness Score"
      />
    );
  }

  if (!report) {
    return (
      <>
        <PageHeader
          title="Exit Readiness Score"
          subtitle="A buyer-grade assessment of your business across nine critical dimensions."
        />
        <RunReportCard
          feature="Exit Readiness Score"
          blurb="We score your store across nine buyer-grade dimensions using your real orders, products and customers."
          cta="Run Exit Readiness Score"
          onRun={run}
          computing={computing}
        />
      </>
    );
  }

  const { score, valuation, metrics } = report;

  return (
    <>
      <PageHeader
        title="Exit Readiness Score"
        subtitle="A buyer-grade assessment of your business across nine critical dimensions."
        right={<RecomputeButton onRun={run} computing={computing} />}
      />

      {/* Hero */}
      <div className="card-dark p-10 grid lg:grid-cols-5 gap-10 items-center">
        <div className="lg:col-span-3">
          <SectionLabel dark>Your Exit Score</SectionLabel>
          <div className="mt-4 flex items-baseline gap-3">
            <div
              className="font-display text-[var(--accent)]"
              style={{ fontSize: 96, lineHeight: 1 }}
            >
              {score.exitScore}
            </div>
            <div className="font-display text-[var(--text-on-dark-secondary)] text-3xl">
              / 100
            </div>
          </div>
          <div className="mt-4 inline-flex items-center px-3 py-1 border border-[var(--accent)] rounded-sm">
            <span className="text-[var(--accent)] text-[11px] tracking-[0.18em] uppercase">
              {score.scoreTier}
            </span>
          </div>
          <p className="mt-6 text-[var(--text-on-dark)] text-[15px] max-w-lg leading-relaxed">
            Based on {metrics.orderCount.toLocaleString()} orders across{" "}
            {metrics.productCount} products and {metrics.customerCount}{" "}
            customers.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-5 max-w-md">
            {[
              {
                l: "Valuation Range",
                v: `${fmtGBPk(valuation.valuationLow)}–${fmtGBPk(valuation.valuationHigh)}`,
              },
              { l: "Value Gap", v: fmtGBPk(valuation.valueGap) },
              { l: "Data Confidence", v: `${score.dataConfidence}%` },
            ].map((s) => (
              <div key={s.l}>
                <div className="label-caps-dark" style={{ fontSize: 9 }}>
                  {s.l}
                </div>
                <div className="font-display text-[var(--text-on-dark)] text-lg mt-1">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <Radar cats={score.scoreBreakdown} />
        </div>
      </div>

      {/* Breakdown */}
      <div className="mt-12">
        <SectionLabel>Score Breakdown — 9 Dimensions</SectionLabel>
        <div className="mt-5 card-light divide-y divide-[var(--border-warm)]">
          {score.scoreBreakdown.map((c) => {
            const pct = (c.score / c.max) * 100;
            const dot =
              c.status === "green"
                ? "var(--positive)"
                : c.status === "amber"
                  ? "var(--risk-medium)"
                  : "var(--risk-critical)";
            return (
              <div
                key={c.key}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center"
              >
                <div className="col-span-5 flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: dot }}
                  />
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {c.name}
                  </span>
                </div>
                <div className="col-span-1 text-xs text-[var(--text-muted)]">
                  {c.max} pts
                </div>
                <div className="col-span-4">
                  <ProgressBar value={pct} />
                </div>
                <div className="col-span-2 text-right font-display text-lg">
                  {c.score} / {c.max}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Valuation Range */}
      <div className="mt-12 card-light p-8 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <SectionLabel>Estimated Value</SectionLabel>
          <div className="font-display text-4xl mt-3 text-[var(--text-primary)]">
            {fmtGBPk(valuation.valuationLow)} —{" "}
            {fmtGBPk(valuation.valuationHigh)}
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Derived from your trailing-twelve-month revenue and earnings.
          </p>
        </div>
        <div className="space-y-4">
          {[
            { l: "Quick Sale", v: valuation.quickSale, w: 30 },
            { l: "Fair Market", v: valuation.fairMarket, w: 60, gold: true },
            { l: "Optimised", v: valuation.optimised, w: 100, accent: true },
          ].map((b) => {
            const m =
              valuation.adjustedEarnings > 0
                ? Number((b.v / valuation.adjustedEarnings).toFixed(1))
                : 0;
            return (
              <div key={b.l} className="flex items-center gap-4">
                <div className="w-24 text-xs text-[var(--text-muted)] tracking-[0.12em] uppercase">
                  {b.l}
                </div>
                <div className="flex-1 h-7 bg-[var(--bg-secondary)] relative rounded-sm overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${b.w}%`,
                      backgroundColor: b.accent
                        ? "var(--accent)"
                        : b.gold
                          ? "rgba(184,150,90,0.5)"
                          : "var(--text-muted)",
                    }}
                  />
                </div>
                <div className="w-32 text-right font-display">
                  {fmtGBP(b.v)} · {m}x
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Value Gap */}
      <div
        className="mt-8 card-light p-8"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <h3 className="font-display text-2xl text-[var(--text-primary)]">
          You are leaving {fmtGBP(valuation.valueGap)} on the table. Here's why.
        </h3>
        <div className="mt-5 flex flex-wrap gap-2">
          {valuation.negativeDrivers.map((c) => (
            <span
              key={c.name}
              className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded-sm text-xs"
            >
              {c.name}{" "}
              <span className="text-[var(--accent)] font-medium ml-1">
                {c.impact}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* CTA bar */}
      <div className="mt-12 card-light px-8 py-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="font-display text-xl">
            Ready to unlock your value gap?
          </div>
          <div className="text-sm text-[var(--text-muted)] mt-1">
            Open the prioritised optimization plan with £ uplift per action.
          </div>
        </div>
        <Link to="/optimization" className="btn-primary">
          Open Optimization Plan <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </>
  );
}

function Radar({ cats }: { cats: ScoreDimension[] }) {
  const cx = 150,
    cy = 150,
    R = 120;
  const points = cats.map((c, i) => {
    const angle = (Math.PI * 2 * i) / cats.length - Math.PI / 2;
    const r = (c.score / c.max) * R;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
  const path =
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") +
    " Z";

  return (
    <svg viewBox="0 0 300 300" className="w-full h-auto max-w-[300px] mx-auto">
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <polygon
          key={s}
          points={cats
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / cats.length - Math.PI / 2;
              return `${cx + Math.cos(angle) * R * s},${cy + Math.sin(angle) * R * s}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgba(247,245,240,0.08)"
          strokeWidth={1}
        />
      ))}
      {cats.map((_, i) => {
        const angle = (Math.PI * 2 * i) / cats.length - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(angle) * R}
            y2={cy + Math.sin(angle) * R}
            stroke="rgba(247,245,240,0.08)"
          />
        );
      })}
      <path
        d={path}
        fill="rgba(184,150,90,0.25)"
        stroke="var(--accent)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
