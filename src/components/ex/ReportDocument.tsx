import type { ReactNode } from "react";
import type { FullReport } from "@/lib/analytics";
import type { BusinessData } from "@/hooks/useBusinessData";
import { Logo } from "@/components/ex/Logo";
import { fmtGBP } from "@/lib/utils";
import {
  reportSections,
  reportTypeById,
  type ReportSection,
  type ReportTypeId,
} from "@/lib/reportSections";

// The report document — one component for every report the Reports page can
// generate (Exit Readiness Score, Valuation Engine, Risk Scanner, Optimization
// Plan, and the Full Report that contains everything).
//
// Each section's markup is written once into `bodies` below; which sections
// appear, and in what order, comes entirely from `reportSections(report, type)`.
// So the tool-specific reports are slices of the same document rather than
// separate implementations, and a figure can't disagree between two of them.
// Printed as-is (see the `@media print` block in styles.css), so what the
// founder reads on screen is exactly what a buyer receives.
//
// Nothing here computes: every number comes straight off `report`, which is
// `computeFullReport(...)`. No placeholder values — a section that has no real
// data behind it renders a stated-unavailable note instead.

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
const signedPct = (x: number, digits = 0) =>
  `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
const num = (n: number) => n.toLocaleString("en-GB");
const multiple = (x: number) => `${x.toFixed(1)}x`;

const BRAND_DOMAIN = "exitecom.com";

const SEVERITY_COLOR: Record<string, string> = {
  high: "var(--rp-red)",
  medium: "var(--rp-amber)",
  low: "var(--rp-green)",
};

export function ReportDocument({
  report,
  business,
  storeName,
  generatedAt,
  type = "full",
}: {
  report: FullReport;
  business: BusinessData;
  storeName: string;
  generatedAt: Date;
  type?: ReportTypeId;
}) {
  const { metrics: m, score, valuation: v, risks, actions } = report;
  const sections = reportSections(report, type);

  const bodies: Record<string, ReactNode> = {
    summary: (
      <>
        {/* The verdict reads as the buyer's opening paragraph, so it carries the
            document's filled panel rather than sitting as loose body copy. */}
        <p className="report-verdict">
          {storeName} is a {business.industry.toLowerCase()} business trading
          from {business.country || "—"}
          {m.businessAgeYears > 0 ? ` with ${m.businessAge} of history` : ""},
          turning over {fmtGBP(m.revenueTTM)} across {num(m.orderCount)} orders
          in the last twelve months. It scores{" "}
          <strong>
            {score.exitScore}/100 ({score.scoreTier})
          </strong>{" "}
          on exit readiness, supporting a fair-market valuation of{" "}
          <strong>{fmtGBP(v.fairMarket)}</strong> at{" "}
          {multiple(v.currentMultiple)} adjusted earnings. Closing the issues in
          the optimization plan would move the multiple to{" "}
          {multiple(v.optimisedMultiple)} — a value gap of{" "}
          <strong>{fmtGBP(v.valueGap)}</strong>.
        </p>

        <StatGrid
          stats={[
            { l: "Exit Score", v: `${score.exitScore} / 100` },
            { l: "Tier", v: score.scoreTier },
            {
              l: "Valuation Range",
              v: `${fmtGBP(v.valuationLow)} – ${fmtGBP(v.valuationHigh)}`,
            },
            { l: "Value Gap", v: fmtGBP(v.valueGap) },
            { l: "Revenue (TTM)", v: fmtGBP(m.revenueTTM) },
            { l: "Adjusted Earnings", v: fmtGBP(v.adjustedEarnings) },
            { l: "Data Confidence", v: `${score.dataConfidence}%` },
            { l: "Open Risks", v: num(risks.length) },
          ]}
        />
      </>
    ),

    sources: (
      <>
        <p className="report-body">
          Every figure in this report is computed from the sources below. Data
          confidence is <strong>{score.dataConfidence}%</strong> — it rises as
          more independent sources corroborate the Shopify feed.
        </p>
        <Table
          head={["Source", "Status", "What it contributes"]}
          rows={[
            [
              "Shopify",
              `${num(m.orderCount)} orders · ${num(m.productCount)} products · ${num(m.customerCount)} customers`,
              "Revenue, margins, retention, product mix",
            ],
            [
              "Ad platforms",
              m.adSpendVerified
                ? `Verified · ${fmtGBP(m.adSpend)} tracked spend`
                : "Not connected — spend is a benchmark estimate",
              "Marketing efficiency, blended CAC, ROAS",
            ],
            [
              "Google Analytics 4",
              m.ga4Connected ? "Connected" : "Not connected",
              "Session growth, channel concentration",
            ],
            [
              "Bank statements",
              m.bankStatementsMonthCount > 0
                ? `${num(m.bankStatementsMonthCount)} months uploaded`
                : "None uploaded",
              "Verifies deposits against recorded revenue",
            ],
            [
              "P&L documents",
              m.plFileCount > 0
                ? `${num(m.plFileCount)} file(s) uploaded`
                : "None uploaded",
              "Verifies earnings and add-backs",
            ],
          ]}
        />
        {!m.adSpendVerified && (
          <Note>
            No ad platform is connected, so advertising spend shown here is an
            industry benchmark estimate rather than a tracked figure, and ROAS
            cannot be stated. Buyers discount unverified marketing numbers —
            connecting a platform is the fastest way to lift data confidence.
          </Note>
        )}
      </>
    ),

    overview: (
      <>
        <Table
          head={["Attribute", "Value"]}
          rows={[
            ["Business name", storeName],
            ["Industry", business.industry || "—"],
            ["Sales channel", business.channel || "—"],
            ["Country", business.country || "—"],
            // `businessAge` is already "N.N years" — printing the rounded years
            // beside it read as "4.0 years (4.0 years)".
            ["Trading history", m.businessAge],
            ["Reporting currency", m.currency],
            ["Intended exit timeframe", business.exitTimeframe || "—"],
            ["Orders (all time)", num(m.orderCount)],
            ["Revenue (all time)", fmtGBP(m.revenueAllTime)],
          ]}
        />
      </>
    ),

    financials: (
      <>
        <Table
          head={["Line", "Amount", "Note"]}
          rows={[
            [
              "Gross revenue (TTM)",
              fmtGBP(m.grossRevenue),
              "Order value before returns/discounts",
            ],
            ["Net revenue (TTM)", fmtGBP(m.netRevenue), "Basis for margins"],
            [
              "Cost of goods sold",
              fmtGBP(m.cogs),
              `Implied gross margin ${pct(m.grossMargin)}`,
            ],
            ["Gross profit", fmtGBP(m.grossProfit), pct(m.grossMargin)],
            [
              "Operating expenses",
              fmtGBP(m.opex),
              m.adSpendVerified
                ? `Includes ${fmtGBP(m.adSpend)} verified ad spend`
                : `Includes ${fmtGBP(m.adSpend)} estimated ad spend`,
            ],
            ["EBITDA", fmtGBP(m.ebitda), `Net margin ${pct(m.netMargin)}`],
            ["SDE (owner earnings)", fmtGBP(m.sde), "EBITDA plus add-backs"],
            [
              "Adjusted earnings",
              fmtGBP(v.adjustedEarnings),
              "Figure the multiple is applied to",
            ],
            [
              "Revenue growth",
              signedPct(m.growthRate),
              "Recent months vs prior period",
            ],
            ["Average order value", fmtGBP(m.avgOrderValue), "TTM"],
          ]}
        />

        <h4 className="report-subhead">Monthly revenue</h4>
        {m.revenueMonthly.length > 0 ? (
          <RevenueBars data={m.revenueMonthly} />
        ) : (
          <Note>No monthly revenue history is available yet.</Note>
        )}
      </>
    ),

    customers: (
      <>
        <Table
          head={["Metric", "Value", "Why a buyer cares"]}
          rows={[
            [
              "Total customers",
              num(m.customerCount),
              "Size of the acquired asset",
            ],
            [
              "New customers (TTM)",
              num(m.newCustomers),
              "Acquisition engine output",
            ],
            [
              "Returning customers",
              num(m.returningCustomers),
              "Evidence of genuine demand",
            ],
            [
              "Repeat rate",
              pct(m.repeatRate, 1),
              "Under ~20% reads as a paid-traffic treadmill",
            ],
            [
              "Average order value",
              fmtGBP(m.avgOrderValue),
              "Drives contribution per acquisition",
            ],
            [
              "Blended CAC",
              m.adSpendVerified ? fmtGBP(m.blendedCac) : "Unverified",
              "Ad spend ÷ new customers",
            ],
          ]}
        />
      </>
    ),

    products: (
      <>
        <p className="report-body">
          The top product accounts for <strong>{pct(m.topProductShare)}</strong>{" "}
          of revenue. Concentration above roughly 40% is the single most common
          reason acquirers discount an e-commerce multiple.
        </p>
        {m.productRevenue.length > 0 ? (
          <Table
            head={["#", "Product", "Revenue", "Units", "Share"]}
            rows={m.productRevenue
              .slice(0, 15)
              .map((p, i) => [
                String(i + 1),
                p.title,
                fmtGBP(p.revenue),
                num(p.units),
                pct(p.share, 1),
              ])}
          />
        ) : (
          <Note>No product-level revenue is available yet.</Note>
        )}
      </>
    ),

    marketing: (
      <>
        <Table
          head={["Metric", "Value", "Reading"]}
          rows={[
            [
              "Verified ad spend (TTM)",
              fmtGBP(m.adSpend),
              "Summed across connected platforms",
            ],
            [
              "Blended ROAS",
              `${m.roas.toFixed(2)}x`,
              "Conversion value ÷ spend",
            ],
            [
              "Blended CAC",
              fmtGBP(m.blendedCac),
              "Spend ÷ new customers acquired",
            ],
            [
              "Spend stability",
              pct(m.adSpendStability),
              "Month-to-month steadiness; erratic spend reads as unmanaged",
            ],
            [
              "Largest campaign share",
              pct(m.topCampaignShare),
              "Single-campaign dependency",
            ],
            [
              "Marketing efficiency",
              pct(m.marketingEfficiencyRatio),
              "Per-platform ROAS and stability, averaged",
            ],
          ]}
        />
      </>
    ),

    traffic: (
      <>
        <Table
          head={["Metric", "Value", "Reading"]}
          rows={[
            [
              "Session growth",
              m.sessionGrowthAvailable ? signedPct(m.sessionGrowth) : "—",
              m.sessionGrowthAvailable
                ? "Last 3 months vs prior 3 months"
                : "Under 6 months of history — excluded from scoring",
            ],
            [
              "Traffic conversion rate",
              pct(m.trafficConversionRate, 2),
              "Conversions ÷ sessions",
            ],
            [
              "Top channel",
              m.topTrafficChannel || "—",
              `${pct(m.trafficChannelConcentration)} of sessions`,
            ],
          ]}
        />
        {m.trafficChannelConcentration >= 0.6 && (
          <Note>
            {pct(m.trafficChannelConcentration)} of sessions arrive through{" "}
            {m.topTrafficChannel}. A buyer will model what happens to revenue if
            that channel's economics change after they take over.
          </Note>
        )}
      </>
    ),

    score: (
      <>
        <p className="report-body">
          <strong>
            {score.exitScore} / 100 — {score.scoreTier}
          </strong>
          . Each dimension is scored independently from the data above and
          summed; no judgement or AI is involved.
        </p>
        <Table
          head={["Dimension", "Score", "Max", "Status"]}
          rows={score.scoreBreakdown.map((d) => [
            d.name,
            String(d.score),
            String(d.max),
            <span key={d.key} className="report-status">
              <span
                className="report-dot"
                style={{ backgroundColor: SEVERITY_COLOR[statusKey(d.status)] }}
              />
              {d.status === "green"
                ? "Strong"
                : d.status === "amber"
                  ? "Needs work"
                  : "Weak"}
            </span>,
          ])}
        />
      </>
    ),

    valuation: (
      <>
        <Table
          head={["Scenario", "Value", "Multiple", "What it assumes"]}
          rows={[
            [
              "Quick sale",
              fmtGBP(v.quickSale),
              mult(v.quickSale, v.adjustedEarnings),
              "Fast close, limited diligence, motivated seller",
            ],
            [
              "Fair market",
              fmtGBP(v.fairMarket),
              mult(v.fairMarket, v.adjustedEarnings),
              "Competent broker process, current condition",
            ],
            [
              "Optimised",
              fmtGBP(v.optimised),
              mult(v.optimised, v.adjustedEarnings),
              "After the optimization plan is executed",
            ],
          ]}
        />
        <Table
          head={["Input", "Value"]}
          rows={[
            ["Adjusted earnings", fmtGBP(v.adjustedEarnings)],
            ["Current multiple", multiple(v.currentMultiple)],
            ["Achievable multiple", multiple(v.optimisedMultiple)],
            [
              "Valuation range",
              `${fmtGBP(v.valuationLow)} – ${fmtGBP(v.valuationHigh)}`,
            ],
            ["Mid-point", fmtGBP(v.valuationMid)],
            ["Value gap", fmtGBP(v.valueGap)],
          ]}
        />

        <div className="grid md:grid-cols-2 gap-6">
          <DriverList
            title="Multiple expanders"
            drivers={v.positiveDrivers}
            positive
          />
          <DriverList
            title="Multiple compressors"
            drivers={v.negativeDrivers}
          />
        </div>
      </>
    ),

    risks: (
      <>
        <p className="report-body">
          {risks.length} risk{risks.length === 1 ? "" : "s"} identified,
          carrying{" "}
          <strong>
            {fmtGBP(risks.reduce((s, r) => s + (r.impact || 0), 0))}
          </strong>{" "}
          of modelled valuation impact.
        </p>
        {risks.length === 0 ? (
          <Note>No risks were flagged against the current data.</Note>
        ) : (
          <div className="space-y-5">
            {risks.map((r, i) => (
              <div key={r.id ?? r.title} className="report-item">
                <div className="report-item-head">
                  <span
                    className="report-dot"
                    style={{ backgroundColor: SEVERITY_COLOR[r.severity] }}
                  />
                  <span className="report-item-title">
                    {i + 1}. {r.title}
                  </span>
                  <span className="report-item-meta">
                    {r.severity.toUpperCase()} · {fmtGBP(r.impact)} impact
                  </span>
                </div>
                <p className="report-body">{r.description}</p>
                {r.buyerSees && (
                  <Field label="What a buyer sees">{r.buyerSees}</Field>
                )}
                {r.buyerFears && (
                  <Field label="What they fear">{r.buyerFears}</Field>
                )}
                {r.buyerDoes && (
                  <Field label="What they do about it">{r.buyerDoes}</Field>
                )}
                {r.recommendation && (
                  <Field label="Recommendation">{r.recommendation}</Field>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    ),

    plan: (
      <>
        <p className="report-body">
          {actions.length} action{actions.length === 1 ? "" : "s"}, carrying{" "}
          <strong>
            {fmtGBP(actions.reduce((s, a) => s + (a.uplift || 0), 0))}
          </strong>{" "}
          of combined valuation uplift if executed.
        </p>
        {actions.length === 0 ? (
          <Note>No outstanding actions — the plan is clear.</Note>
        ) : (
          <div className="space-y-5">
            {actions.map((a, i) => (
              <div key={a.id ?? a.title} className="report-item">
                <div className="report-item-head">
                  <span
                    className="report-dot"
                    style={{ backgroundColor: SEVERITY_COLOR[a.priority] }}
                  />
                  <span className="report-item-title">
                    {i + 1}. {a.title}
                  </span>
                  <span className="report-item-meta">
                    {a.priority.toUpperCase()} · +{fmtGBP(a.uplift)} · {a.time}
                  </span>
                </div>
                <p className="report-body">{a.problem}</p>
                {a.steps.length > 0 && (
                  <ol className="report-steps">
                    {a.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    ),

    methodology: (
      <>
        <p className="report-body">
          Every figure in this report is computed in auditable code from the raw
          data held in your account — the same inputs always produce the same
          outputs. No language model is involved anywhere: not in the figures,
          and not in the wording of the risk and action descriptions.
        </p>
        <Table
          head={["Figure", "How it is derived"]}
          rows={[
            [
              "Revenue (TTM)",
              "Sum of order totals in the trailing twelve months from your Shopify order feed",
            ],
            [
              "Gross margin / COGS",
              "Industry cost ratio applied to net revenue where product cost data is absent",
            ],
            [
              "EBITDA / SDE",
              "Gross profit less operating expenses, with owner add-backs restored for SDE",
            ],
            [
              "Exit Score",
              "Nine independently scored dimensions, summed to 100",
            ],
            [
              "Valuation",
              "Adjusted earnings × a multiple set by the Exit Score and industry band",
            ],
            [
              "Value gap",
              "Optimised valuation less fair-market valuation at today's score",
            ],
            [
              "Data confidence",
              "Coverage and corroboration across connected sources and uploaded documents",
            ],
          ]}
        />
        <Note>
          This report is pre-exit intelligence, not a formal valuation, audit or
          financial advice. Figures are estimates derived from the data
          connected to this account and should be verified in diligence.
        </Note>
      </>
    ),
  };

  return (
    <article className="report-doc space-y-10">
      <Cover
        type={type}
        storeName={storeName}
        business={business}
        report={report}
        generatedAt={generatedAt}
      />

      <Contents sections={sections} />

      {sections.map((s) => (
        <Section key={s.id} section={s}>
          {bodies[s.id]}
        </Section>
      ))}

      <Colophon storeName={storeName} generatedAt={generatedAt} />

      {/* Repeats at the foot of every printed page (screen-hidden). */}
      <div className="report-print-footer" aria-hidden="true">
        <span>
          {storeName} — {reportTypeById(type).name}
        </span>
        <span>ExitEcom · {BRAND_DOMAIN}</span>
      </div>
    </article>
  );
}

// --- pieces -----------------------------------------------------------------

function statusKey(s: "green" | "amber" | "red") {
  return s === "green" ? "low" : s === "amber" ? "medium" : "high";
}

function mult(value: number, earnings: number) {
  return earnings > 0 ? multiple(value / earnings) : "—";
}

/**
 * The four figures in the hero strip. The score and tier are the hero itself,
 * so they're deliberately absent here — the strip frames the score rather than
 * repeating it.
 */
function coverStats(type: ReportTypeId, report: FullReport) {
  const { score, valuation: v, risks, actions } = report;
  const fairMarket = { l: "Fair Market Value", v: fmtGBP(v.fairMarket) };
  const valueGap = { l: "Value Gap", v: fmtGBP(v.valueGap) };
  const confidence = { l: "Data Confidence", v: `${score.dataConfidence}%` };
  const exitRange = {
    l: "Estimated Exit Range",
    v: `${fmtGBP(v.valuationLow)} – ${fmtGBP(v.valuationHigh)}`,
  };

  switch (type) {
    case "exit-score":
      return [
        exitRange,
        { l: "Current Multiple", v: multiple(v.currentMultiple) },
        { l: "Achievable Multiple", v: multiple(v.optimisedMultiple) },
        confidence,
      ];
    case "valuation":
      return [
        exitRange,
        fairMarket,
        { l: "Current Multiple", v: multiple(v.currentMultiple) },
        valueGap,
      ];
    case "risk":
      return [
        { l: "Risks Found", v: num(risks.length) },
        {
          l: "Valuation at Risk",
          v: fmtGBP(risks.reduce((s, r) => s + (r.impact || 0), 0)),
        },
        fairMarket,
        confidence,
      ];
    case "optimization":
      return [
        { l: "Actions", v: num(actions.length) },
        {
          l: "Total Uplift",
          v: fmtGBP(actions.reduce((s, a) => s + (a.uplift || 0), 0)),
        },
        fairMarket,
        { l: "Optimised Value", v: fmtGBP(v.optimised) },
      ];
    default:
      return [exitRange, fairMarket, valueGap, confidence];
  }
}

function Cover({
  type,
  storeName,
  business,
  report,
  generatedAt,
}: {
  type: ReportTypeId;
  storeName: string;
  business: BusinessData;
  report: FullReport;
  generatedAt: Date;
}) {
  const { score } = report;

  return (
    <header className="report-cover">
      {/* Masthead — this is an ExitEcom document wherever it ends up, and it
          is meant to end up in front of buyers and brokers. */}
      <div className="report-masthead">
        <Logo size="sm" />
        <span className="report-masthead-domain">{BRAND_DOMAIN}</span>
      </div>

      <div className="report-kicker">
        ExitEcom | Confidential {reportTypeById(type).name}
      </div>
      <h1 className="report-cover-title">{storeName}</h1>
      <div className="report-cover-meta">
        {business.industry || "E-commerce"} · {business.country || "—"} ·
        Prepared{" "}
        {generatedAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>

      {/* The hero: the one number a buyer looks for, then the four figures that
          frame it. Same values as before — the panel is what changed. */}
      <div className="report-hero">
        <div className="report-hero-main">
          <div className="report-hero-label">Exit Readiness Score</div>
          <div className="report-hero-score">{score.exitScore} / 100</div>
          <div className="report-hero-tier">{score.scoreTier}</div>
        </div>
        <div className="report-hero-strip">
          {coverStats(type, report).map((s) => (
            <div key={s.l} className="report-hero-cell">
              <div className="report-hero-cell-label">{s.l}</div>
              <div className="report-hero-cell-value">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="report-footnote">
        Prepared as if a professional buyer conducted preliminary due diligence
        on your business · Generated by ExitEcom · Confidential
      </p>
    </header>
  );
}

/** Closing credit — who produced the document and where it came from. */
function Colophon({
  storeName,
  generatedAt,
}: {
  storeName: string;
  generatedAt: Date;
}) {
  return (
    <footer className="report-colophon">
      <Logo size="sm" />
      <p className="report-body mt-3">
        Prepared by <strong>ExitEcom</strong> — pre-exit intelligence for
        e-commerce founders. Generated for {storeName} on{" "}
        {generatedAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}{" "}
        from the data connected to this account.
      </p>
      <p className="report-colophon-meta">
        {BRAND_DOMAIN} · Confidential — intended for the recipient named above.
      </p>
    </footer>
  );
}

function Contents({ sections }: { sections: ReportSection[] }) {
  return (
    <nav className="report-contents">
      <div className="report-eyebrow">Contents</div>
      <ol className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="report-toc-link">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The number lives in the eyebrow, so the heading uses the unnumbered `label` —
 * `section.title` carries the number for the contents list and the sticky nav.
 */
function Section({
  section,
  children,
}: {
  section: ReportSection;
  children: ReactNode;
}) {
  return (
    <section id={section.id} className="report-section">
      <div className="report-eyebrow">
        Section {String(section.number).padStart(2, "0")}
      </div>
      <h2 className="report-head">{section.label}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function StatGrid({ stats }: { stats: { l: string; v: string }[] }) {
  return (
    <div className="report-stat-grid">
      {stats.map((s) => (
        <div key={s.l} className="report-stat">
          <div className="report-stat-label">{s.l}</div>
          <div className="report-stat-value">{s.v}</div>
        </div>
      ))}
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverList({
  title,
  drivers,
  positive,
}: {
  title: string;
  drivers: { name: string; impact: string }[];
  positive?: boolean;
}) {
  return (
    <div>
      <h4 className="report-subhead">{title}</h4>
      {drivers.length === 0 ? (
        <p className="report-body">None identified.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {drivers.map((d) => (
            <li key={d.name} className="report-driver">
              <span>{d.name}</span>
              <span
                style={{
                  color: positive ? "var(--rp-green)" : "var(--rp-red)",
                }}
              >
                {d.impact}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevenueBars({ data }: { data: { m: string; v: number }[] }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div className="report-bars">
      {data.map((d) => (
        <div key={d.m} className="report-bar-row">
          <span className="report-bar-label">{d.m}</span>
          <span className="report-bar-track">
            <span
              className="report-bar-fill"
              style={{ width: `${(d.v / max) * 100}%` }}
            />
          </span>
          <span className="report-bar-value">{fmtGBP(d.v)}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="report-field">
      <span className="report-field-label">{label}:</span> {children}
    </p>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="report-note">{children}</p>;
}
