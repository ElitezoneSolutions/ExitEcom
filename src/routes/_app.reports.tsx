import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Printer, FileText, ArrowLeft, ArrowRight, Lock } from "lucide-react";
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
import {
  toolsForReport,
  REQUEST_TOOLS,
  TOOL_NAMES,
  type RequestTool,
} from "@/lib/reportRequests";
import { PendingReviewCard } from "@/components/ex/ReviewStateCard";
import { useCleanPrintUrl } from "@/lib/printUrl";

// Which report is open lives in the URL (`/reports?report=risk`) rather than
// component state, so the sidebar can link straight to one, and a report can be
// bookmarked, shared or reloaded without landing back on the picker. An
// unrecognised value falls back to the picker rather than erroring.
export const Route = createFileRoute("/_app/reports")({
  component: Reports,
  validateSearch: (search: Record<string, unknown>) => {
    const requested = search.report;
    const valid = REPORT_TYPES.some((t) => t.id === requested);
    return { report: valid ? (requested as ReportTypeId) : undefined };
  },
});

// Reports offers one document per tool — Exit Readiness Score, Valuation
// Engine, Risk Scanner, Optimization Plan — plus the Full Report. The page is
// a picker first: nothing is rendered until the user opens a report, so they
// aren't scrolling past a document they didn't ask for. All the reports are
// rendered from the same `computeFullReport` result (see ReportDocument), so
// which one is open changes the sections included, never a figure.
function Reports() {
  const {
    isShopifyConnected,
    business,
    store,
    computing,
    run,
    statusFor,
    approvedFor,
    requestFor,
  } = useReport();
  const { report: open } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const openReport = (id?: ReportTypeId) =>
    navigate({ search: { report: id }, resetScroll: true });
  // Stamped once per mount so the printed document carries a stable date.
  const [generatedAt] = useState(() => new Date());
  // Keep `?report=…` out of the browser's printed header/footer.
  useCleanPrintUrl();

  // A document is only viewable once every tool it contains has been approved.
  // The four tool reports need their own approval; the Full Report needs all
  // four, or it would hand a buyer an unreviewed section. The payload shown is
  // the newest approved one among its tools, so the document is internally
  // consistent with what was signed off.
  const documentFor = useCallback(
    (id: ReportTypeId) => {
      const tools = toolsForReport(id);
      if (tools.some((t) => statusFor(t) !== "approved")) return null;
      const newest = tools
        .map((t) => requestFor(t))
        .filter(Boolean)
        .sort((a, b) => (a!.createdAt < b!.createdAt ? 1 : -1))[0];
      return newest ? approvedFor(newest.tool) : null;
    },
    [statusFor, requestFor, approvedFor],
  );

  const anyApproved = REPORT_TYPES.some((t) => documentFor(t.id));
  const pendingTools = REQUEST_TOOLS.filter((t) => statusFor(t) === "pending");
  const report = open ? documentFor(open) : null;

  const sections = useMemo(
    () => (report && open ? reportSections(report, open) : []),
    [report, open],
  );

  if (!isShopifyConnected) {
    return <ConnectShopifyGate title="Reports" feature="your reports" />;
  }

  if (!anyApproved) {
    return (
      <>
        <PageHeader
          title="Reports"
          subtitle="Buyer-ready documents, generated from your live data."
        />
        {pendingTools.length > 0 ? (
          <PendingReviewCard
            feature={
              pendingTools.length === REQUEST_TOOLS.length
                ? "reports"
                : pendingTools.map((t) => TOOL_NAMES[t]).join(", ")
            }
            submittedAt={requestFor(pendingTools[0])?.createdAt}
          />
        ) : (
          <RunReportCard
            feature="Your Reports"
            blurb="One run computes every report — Exit Readiness Score, Valuation Engine, Risk Scanner, Optimization Plan and the Full Report — from the data you've connected. Our team reviews each one before it's released."
            cta="Generate Reports"
            onRun={run}
            computing={computing}
          />
        )}
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
          {REPORT_TYPES.map((t) => {
            const doc = documentFor(t.id);
            const waiting = toolsForReport(t.id).filter(
              (tool) => statusFor(tool) !== "approved",
            );
            return (
              <div key={t.id} className="card-light p-6 flex flex-col">
                <div className="flex items-center gap-2">
                  {doc ? (
                    <FileText
                      className="w-4 h-4 text-[var(--accent)]"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <Lock
                      className="w-4 h-4 text-[var(--text-muted)]"
                      strokeWidth={1.5}
                    />
                  )}
                  <span className="font-display text-xl">{t.name}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed flex-1">
                  {t.description}
                </p>
                <div className="mt-4 text-[11px] tracking-[0.12em] uppercase text-[var(--text-muted)]">
                  {doc
                    ? `${reportSections(doc, t.id).length} sections`
                    : waitingLabel(waiting, statusFor)}
                </div>
                <button
                  onClick={() => openReport(t.id)}
                  disabled={!doc}
                  className="btn-primary mt-5 text-sm justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  View Report <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // --- One report ---------------------------------------------------------
  // Reachable by deep link (or by a sidebar child) before approval, so guard
  // rather than assuming the picker filtered it out.
  if (!report) {
    const active = reportTypeById(open);
    return (
      <>
        <button
          onClick={() => openReport(undefined)}
          className="btn-ghost-light text-xs mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All reports
        </button>
        <PageHeader title={active.name} subtitle={active.description} />
        <PendingReviewCard feature={active.name} />
      </>
    );
  }

  const active = reportTypeById(open);

  return (
    <>
      <div className="report-chrome">
        <button
          onClick={() => openReport(undefined)}
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

/**
 * Why a locked report card is locked, in the founder's terms — "in review" once
 * they've submitted, "not run yet" before that.
 */
function waitingLabel(
  waiting: RequestTool[],
  statusFor: (t: RequestTool) => string,
) {
  if (waiting.length === 0) return "";
  const inReview = waiting.filter((t) => statusFor(t) === "pending");
  if (inReview.length === waiting.length) return "In review";
  return `Needs ${waiting.map((t) => TOOL_NAMES[t]).join(", ")}`;
}
