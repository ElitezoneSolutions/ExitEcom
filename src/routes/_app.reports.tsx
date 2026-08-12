import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Printer, FileText, ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
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
// Engine, Risk Scanner, Optimization Plan — plus the Full Report. The page is
// a picker first: nothing is rendered until the user opens a report, so they
// aren't scrolling past a document they didn't ask for. All the reports are
// rendered from the same `computeFullReport` result (see ReportDocument), so
// which one is open changes the sections included, never a figure.
function Reports() {
  const { isShopifyConnected, report, business, store, computing, run } =
    useReport();
  const [open, setOpen] = useState<ReportTypeId | null>(null);
  // Stamped once per mount so the printed document carries a stable date.
  const [generatedAt] = useState(() => new Date());

  const sections = useMemo(
    () => (report && open ? reportSections(report, open) : []),
    [report, open],
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

  // --- Picker -------------------------------------------------------------
  if (!open) {
    return (
      <>
        <PageHeader
          title="Reports"
          subtitle="Choose a report to view, then download it as a PDF."
          right={<RecomputeButton onRun={run} computing={computing} />}
        />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {REPORT_TYPES.map((t) => (
            <div key={t.id} className="card-light p-6 flex flex-col">
              <div className="flex items-center gap-2">
                <FileText
                  className="w-4 h-4 text-[var(--accent)]"
                  strokeWidth={1.5}
                />
                <span className="font-display text-xl">{t.name}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed flex-1">
                {t.description}
              </p>
              <div className="mt-4 text-[11px] tracking-[0.12em] uppercase text-[var(--text-muted)]">
                {reportSections(report, t.id).length} sections
              </div>
              <button
                onClick={() => setOpen(t.id)}
                className="btn-primary mt-5 text-sm justify-center"
              >
                View Report <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </>
    );
  }

  // --- One report ---------------------------------------------------------
  const active = reportTypeById(open);

  return (
    <>
      <div className="report-chrome">
        <button
          onClick={() => setOpen(null)}
          className="btn-ghost-light text-xs mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All reports
        </button>
        <PageHeader
          title={active.name}
          subtitle={active.description}
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
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8 items-start">
        <nav className="report-chrome card-light p-5 hidden lg:block lg:sticky lg:top-6">
          <div className="label-caps" style={{ fontSize: 10 }}>
            Contents
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
            type={open}
          />
        </div>
      </div>
    </>
  );
}
