import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { ScoreRing } from "@/components/ex/ScoreRing";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ProgressBar } from "@/components/ex/ProgressBar";
import { useBusinessData } from "@/hooks/useBusinessData";
import { fmtGBP, fmtGBPk } from "@/lib/mock";

export const Route = createFileRoute("/app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { business, risks, actions, loading, refetch } = useBusinessData();

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
        <p className="text-sm text-[var(--text-muted)]">
          Loading dashboard data...
        </p>
      </div>
    );
  }

  // Get first 3 risks and actions
  const displayRisks = risks.slice(0, 3);
  const displayActions = actions.slice(0, 3);

  // Check data sources connection status
  const isShopifyConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("shopify"),
  );
  const isMetaConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("meta"),
  );
  const isPLConnected = business.connectedSources.some(
    (s) =>
      s.toLowerCase().includes("pl") ||
      s.toLowerCase().includes("p&l") ||
      s.toLowerCase().includes("upload"),
  );
  const isGA4Connected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("ga4"),
  );

  return (
    <>
      <div className="flex items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="font-display text-3xl text-[var(--text-primary)]">
            Good morning, {business.ownerName}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          Last updated: Today, 09:34
          <button
            onClick={() => refetch()}
            className="p-1.5 hover:text-[var(--accent)] transition-colors"
            title="Refresh database data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hero cards */}
      <div className="grid md:grid-cols-3 gap-5">
        <div className="card-dark p-7">
          <SectionLabel dark>Exit Readiness Score</SectionLabel>
          <div className="mt-6 flex items-center gap-5">
            <ScoreRing score={business.exitScore} size={120} />
            <div>
              <div className="inline-flex items-center px-2.5 py-1 border border-[var(--accent)] rounded-sm">
                <span className="text-[var(--accent)] text-[10px] tracking-[0.16em] uppercase">
                  {business.scoreTier}
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--text-on-dark-secondary)] max-w-[140px]">
                Buyers are discounting this business right now
              </p>
            </div>
          </div>
          <Link
            to="/app/exit-score"
            className="mt-6 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]"
          >
            View Full Analysis <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="card-dark p-7">
          <SectionLabel dark>Estimated Value Range</SectionLabel>
          <div className="font-display text-[var(--accent)] text-[34px] mt-5 leading-none">
            {fmtGBPk(business.valuationLow)} — {fmtGBPk(business.valuationHigh)}
          </div>
          <div className="mt-3 text-sm text-[var(--text-on-dark)]">
            Fair Market: {fmtGBP(business.fairMarket)}
          </div>
          <div className="text-xs text-[var(--text-on-dark-secondary)] mt-1">
            Current Multiple: {business.currentMultiple}x
          </div>
          <Link
            to="/app/valuation"
            className="mt-6 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]"
          >
            View Valuation Engine <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="surface-accent p-7 rounded-lg">
          <div className="text-[10px] tracking-[0.18em] uppercase font-medium surface-accent-muted">
            Value Left on the Table
          </div>
          <div className="font-display text-[44px] leading-none mt-5">
            {fmtGBP(business.valueGap)}
          </div>
          <p className="mt-3 text-sm leading-snug max-w-[220px]">
            You're currently leaving this in potential exit value unrealised.
          </p>
          <Link
            to="/app/optimization"
            className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-white hover:opacity-80"
          >
            See How to Unlock It <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Premium Hook & Strategy Session */}
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <div className="surface-accent-muted p-5 rounded-lg flex items-center justify-between border border-[var(--accent)]/20">
          <div>
            <div className="font-medium text-[var(--text-primary)]">
              12 buyers are looking for businesses like yours
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              In your specific category and revenue range.
            </div>
          </div>
          <Link
            to="/app/buyer-matching"
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors"
          >
            See Matched Buyers
          </Link>
        </div>
        <div className="card-light p-5 rounded-lg flex items-center justify-between">
          <div>
            <div className="font-medium text-[var(--text-primary)]">
              Book a 30-min Exit Strategy Session
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Review your score with an M&A expert.
            </div>
          </div>
          <button className="px-4 py-2 border border-[var(--border-warm)] text-[var(--text-primary)] text-sm font-medium rounded-md hover:bg-[var(--sidebar-active)] transition-colors">
            Book Session
          </button>
        </div>
      </div>

      {/* Mid section */}
      <div className="grid lg:grid-cols-5 gap-8 mt-12">
        <div className="lg:col-span-3">
          <SectionLabel>Top Buyer Concerns</SectionLabel>
          <div className="mt-4 space-y-3">
            {displayRisks.map((r) => (
              <div
                key={r.title}
                className="card-light px-5 py-4 flex items-center gap-4"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      r.severity === "high"
                        ? "var(--risk-critical)"
                        : "var(--risk-medium)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {r.title}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {r.description}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-lg text-[var(--accent)]">
                    {fmtGBPk(r.impact)}
                  </div>
                </div>
                <Link
                  to="/app/risk-scanner"
                  className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] shrink-0"
                >
                  Details →
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              {Math.max(0, risks.length - 3)} additional risks identified
            </span>
            <Link
              to="/app/risk-scanner"
              className="text-[var(--accent)] hover:text-[var(--accent-muted)]"
            >
              View All Risks →
            </Link>
          </div>
        </div>

        <div className="lg:col-span-2">
          <SectionLabel>
            Your personalised roadmap to a higher exit
          </SectionLabel>
          <div className="mt-4 space-y-3">
            {displayActions.map((a) => (
              <div key={a.title} className="card-light px-5 py-4">
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] tracking-[0.16em] uppercase font-medium"
                    style={{
                      color:
                        a.priority === "high"
                          ? "var(--risk-critical)"
                          : "var(--risk-medium)",
                    }}
                  >
                    {a.priority}
                  </span>
                  <span className="font-display text-base text-[var(--accent)]">
                    +{fmtGBPk(a.uplift)}
                  </span>
                </div>
                <div className="text-sm text-[var(--text-primary)] mt-2 leading-snug">
                  {a.title}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Est. {a.time}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-right">
            <Link
              to="/app/optimization"
              className="text-[var(--accent)] hover:text-[var(--accent-muted)]"
            >
              View Full Optimization Plan →
            </Link>
          </div>
        </div>
      </div>

      {/* Snapshot */}
      <div className="mt-12">
        <SectionLabel>Business Snapshot</SectionLabel>
        <div className="mt-4 card-light grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-[var(--border-warm)]">
          {[
            { l: "Revenue (TTM)", v: fmtGBPk(business.revenueTTM) },
            { l: "EBITDA", v: fmtGBPk(business.ebitda) },
            {
              l: "Profit Margin",
              v: `${(business.netMargin * 100).toFixed(0)}%`,
            },
            {
              l: "Repeat Rate",
              v: `${(business.repeatRate * 100).toFixed(0)}%`,
            },
            { l: "ROAS", v: `${business.roas}x` },
            { l: "Business Age", v: business.age },
          ].map((t) => (
            <div key={t.l} className="px-5 py-5">
              <div className="label-caps" style={{ fontSize: 10 }}>
                {t.l}
              </div>
              <div className="font-display text-2xl mt-2">{t.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Data health */}
      <div className="mt-8 card-light px-6 py-4 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-[260px]">
          <span className="label-caps" style={{ fontSize: 10 }}>
            Data Health
          </span>
          <div className="flex-1 max-w-[200px]">
            <ProgressBar value={business.dataConfidence} />
          </div>
          <span className="text-sm font-display text-[var(--accent)]">
            {business.dataConfidence}%
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <Connected name="Shopify" ok={isShopifyConnected} />
          <Connected name="Meta Ads" ok={isMetaConnected} />
          <Connected name="P&L" ok={isPLConnected} />
          <Connected name="GA4" ok={isGA4Connected} />
          <Link
            to="/app/data-sources"
            className="text-[var(--accent)] hover:text-[var(--accent-muted)]"
          >
            Complete Your Data Sources →
          </Link>
        </div>
      </div>
    </>
  );
}

function Connected({ name, ok }: { name: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--positive)]" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      )}
      {name}
    </span>
  );
}
