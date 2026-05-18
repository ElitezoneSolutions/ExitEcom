import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { fmtGBPk } from "@/lib/mock";

export function ActionCard({
  title,
  priority,
  uplift,
  time,
  problem,
  steps,
}: {
  title: string;
  priority: "high" | "medium" | "low";
  uplift: number;
  time: string;
  problem: string;
  steps: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-light overflow-hidden" style={{ borderLeft: priority === "high" ? "3px solid var(--accent)" : "3px solid var(--border-warm)" }}>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={priority}>{priority === "high" ? "HIGH PRIORITY" : priority === "medium" ? "MEDIUM" : "LOW"}</StatusBadge>
            <span className="text-xs text-[var(--text-muted)]">{time}</span>
          </div>
          <div className="font-display text-2xl text-[var(--accent)]">+{fmtGBPk(uplift)}</div>
        </div>
        <h3 className="font-display mt-3 text-[22px] text-[var(--text-primary)] leading-tight">{title}</h3>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{problem}</p>

        <button onClick={() => setOpen(o => !o)} className="mt-4 text-xs font-medium text-[var(--accent)] inline-flex items-center gap-1 hover:text-[var(--accent-muted)]">
          View Action Steps <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <ol className="mt-4 pt-4 border-t border-[var(--border-warm)] space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-[var(--text-secondary)]">
                <span className="font-display text-[var(--accent)] w-5 shrink-0">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
