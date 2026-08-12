import { Clock, RotateCcw, MailCheck } from "lucide-react";

// What a founder sees between submitting a run and the team approving it.
//
// Deliberately says nothing about queue position, reviewer or timing — we don't
// know any of those, and inventing them would be the same sin as placeholder
// data. It states what's true: it's being processed, and an email is coming.

export function PendingReviewCard({
  feature,
  submittedAt,
}: {
  feature: string;
  submittedAt?: string | null;
}) {
  return (
    <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
      <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
        <Clock className="w-6 h-6" strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
        We're processing your request
      </h2>
      <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
        Your {feature} has been computed from your store data and is being
        reviewed by our team. You'll get an email as soon as it's ready.
      </p>
      <p className="mt-6 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <MailCheck className="w-3.5 h-3.5" />
        {submittedAt
          ? `Submitted ${new Date(submittedAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Submitted"}
      </p>
    </div>
  );
}

export function RejectedReviewCard({
  feature,
  note,
  onRun,
  computing,
}: {
  feature: string;
  note?: string | null;
  onRun: () => void;
  computing: boolean;
}) {
  return (
    <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
      <div className="w-12 h-12 mx-auto rounded-full bg-[rgba(220,38,38,0.1)] flex items-center justify-center text-[var(--risk-critical)]">
        <RotateCcw className="w-6 h-6" strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
        This needs another look
      </h2>
      <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
        Our team reviewed your {feature} and sent it back.
      </p>
      {note && (
        <p className="mt-5 text-sm text-[var(--text-primary)] bg-[var(--sidebar-active)] rounded-md p-4 text-left">
          {note}
        </p>
      )}
      <button
        onClick={onRun}
        disabled={computing}
        className="btn-primary mt-8 text-sm disabled:opacity-60"
      >
        {computing ? "Submitting…" : "Submit again"}
      </button>
      <p className="mt-4 text-[11px] text-[var(--text-muted)]">
        Connecting more data sources usually resolves this — check Data Sources.
      </p>
    </div>
  );
}
