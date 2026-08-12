import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Printer, FileText } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { RunReportCard, RecomputeButton } from "@/components/ex/RunReportCard";
import { ReportDocument } from "@/components/ex/ReportDocument";
import {
  REPORT_TYPES,
  reportSections,
  reportTypeById,
  type ReportTypeId,
} from "@/lib/reportSections";
import { useReport } from "@/hooks/useReport";

export const Route = createFileRoute("/_app/reports")({ component: Reports });

// Reports offers one document per tool — Exit Readiness Score, Valuation
// Engine, Risk Scanner, Optimization Plan — plus the Full Report. They are all
// rendered from the same `computeFullReport` result (see ReportDocument), so
// picking a report only changes which sections are included, never a figure.
function Reports() {
  const { isShopifyConnected, report, business, store, computing, run } =
    useReport();
  const [type, setType] = useState<ReportTypeId>("full");
  // Stamped once per mount so the printed document carries a stable date.
  const [generatedAt] = useState(() => new Date());

  const sections = useMemo(
    () => (report ? reportSections(report, type) : []),
    [report, type],
  );

  if (!isShopifyConnected) {
    return <ConnectShopifyGate title="Reports" feature="your reports" />;
  }

  if (!report) {
    return (
      <>
        <PageHeader
          title="Reports"
          subtitle="Buyer-ready documents, generated from your live data."
        />
        <RunReportCard
          feature="Your Reports"
          blurb="One run computes every report — Exit Readiness Score, Valuation Engine, Risk Scanner, Optimization Plan and the Full Report — from the data you've connected."
          cta="Generate Reports"
          onRun={run}
          computing={computing}
        />
      </>
    );
  }

  const storeName = store?.name || business.name || "Your business";
  const active = reportTypeById(type);

  return (
    <>
      <div className="report-chrome">
        <PageHeader
          title="Reports"
          subtitle="Buyer-ready documents, generated from your live data."
          right={
            <div className="flex items-center gap-2">
              <RecomputeButton onRun={run} computing={computing} />
              <button
                onClick={() => window.print()}
                className="btn-primary text-sm"
              >
                <Printer className="w-4 h-4" /> Download PDF
              </button>
            </div>
          }
        />

        <SectionLabel>Choose a report</SectionLabel>
        <div className="mt-4 mb-10 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_TYPES.map((t) => {
            const selected = t.id === type;
            return (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                aria-pressed={selected}
                className="card-light p-5 text-left transition-colors"
                style={{
                  borderColor: selected
                    ? "var(--accent)"
                    : "var(--border-warm)",
                  boxShadow: selected
                    ? "inset 0 0 0 1px var(--accent)"
                    : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <FileText
                    className="w-4 h-4"
                    style={{
                      color: selected ? "var(--accent)" : "var(--text-muted)",
                    }}
                  />
                  <span className="font-display text-lg">{t.name}</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {t.description}
                </p>
                <div className="mt-3 text-[11px] tracking-[0.12em] uppercase text-[var(--text-muted)]">
                  {reportSections(report, t.id).length} sections
                  {selected ? " · Showing" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8 items-start">
        <nav className="report-chrome card-light p-5 hidden lg:block lg:sticky lg:top-6">
          <div className="label-caps" style={{ fontSize: 10 }}>
            {active.name}
          </div>
          <ol className="mt-3 space-y-1.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="report-toc-link">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="bg-white border border-[var(--border-warm)] rounded-lg p-8 lg:p-12 shadow-sm report-sheet">
          <ReportDocument
            report={report}
            business={business}
            storeName={storeName}
            generatedAt={generatedAt}
            type={type}
          />
        </div>
      </div>
    </>
  );
}
