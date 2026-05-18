import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { fmtGBPk } from "@/lib/mock";

type Severity = "high" | "medium" | "low";

export function RiskCard({
  title,
  severity,
  description,
  impact,
  buyerSees,
  buyerFears,
  buyerDoes,
  recommendation,
}: {
  title: string;
  severity: Severity;
  description: string;
  impact: number;
  buyerSees?: string;
  buyerFears?: string;
  buyerDoes?: string;
  recommendation?: string;
}) {
  const [open, setOpen] = useState(false);
  const accent = severity === "high" ? "var(--risk-critical)" : severity === "medium" ? "var(--risk-medium)" : "var(--text-muted)";
  const expandable = !!buyerSees;

  return (
    <div className="card-light overflow-hidden" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
              <h3 className="text-[17px] font-medium text-[var(--text-primary)]">{title}</h3>
              <StatusBadge status={severity} />
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-display text-2xl text-[var(--accent)]">{fmtGBPk(impact)}</div>
            <div className="label-caps mt-1" style={{ fontSize: 10 }}>Valuation impact</div>
          </div>
        </div>

        {expandable && (
          <button onClick={() => setOpen(o => !o)} className="mt-4 text-xs font-medium text-[var(--accent)] inline-flex items-center gap-1 transition-colors hover:text-[var(--accent-muted)]">
            View Buyer Psychology <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}

        {open && expandable && (
          <div className="mt-5 grid sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--border-warm)]">
            <Detail label="What buyers see" text={buyerSees!} />
            <Detail label="What buyers fear" text={buyerFears!} />
            <Detail label="What buyers do" text={buyerDoes!} />
            <Detail label="Recommendation" text={recommendation!} accent />
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  return (
    <div>
      <div className="label-caps" style={{ fontSize: 10 }}>{label}</div>
      <p className={`mt-1.5 text-sm ${accent ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}`}>{text}</p>
    </div>
  );
}
