import { Sparkles, RefreshCw } from "lucide-react";

// Empty-state shown on a report page when the feature hasn't been run yet.
// Reports are on-demand: nothing is computed until the user clicks Run.
export function RunReportCard({
  feature,
  blurb,
  cta,
  onRun,
  computing,
}: {
  feature: string;
  blurb: string;
  cta: string;
  onRun: () => void;
  computing: boolean;
}) {
  return (
    <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
      <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
        <Sparkles className="w-6 h-6" strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
        Run {feature}
      </h2>
      <p className="mt-3 text-[15px] text-[var(--text-secondary)]">{blurb}</p>
      <button
        onClick={onRun}
        disabled={computing}
        className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-60"
      >
        {computing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" /> Computing…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" /> {cta}
          </>
        )}
      </button>
      <p className="mt-4 text-[11px] text-[var(--text-muted)]">
        Computed from your stored Shopify data with deterministic logic — no AI
        affects the numbers.
      </p>
    </div>
  );
}

// Small "recompute" control for the header of an already-run report.
export function RecomputeButton({
  onRun,
  computing,
}: {
  onRun: () => void;
  computing: boolean;
}) {
  return (
    <button
      onClick={onRun}
      disabled={computing}
      className="btn-ghost-light text-sm inline-flex items-center gap-2 disabled:opacity-60"
      title="Recompute from the latest stored data"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${computing ? "animate-spin" : ""}`} />
      {computing ? "Computing…" : "Recompute"}
    </button>
  );
}
