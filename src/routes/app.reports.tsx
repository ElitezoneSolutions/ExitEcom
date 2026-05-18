import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";

export const Route = createFileRoute("/app/reports")({ component: Reports });

const generated = [
  ["Exit Readiness Report", "Today", "Full Report"],
  ["Valuation Report", "Yesterday", "Valuation"],
  ["Optimization Plan", "3 days ago", "Action Plan"],
];
const types = [
  ["Exit Readiness Report", "Complete buyer-grade assessment across all 9 dimensions"],
  ["Valuation Report", "Realistic buyer-grade valuation with full methodology"],
  ["Optimization Roadmap", "Prioritised action plan with £ uplift per action"],
];

function Reports() {
  return (
    <>
      <PageHeader title="Reports & Downloads" subtitle="Generate and download buyer-ready intelligence." />
      <SectionLabel>Generated Reports</SectionLabel>
      <div className="card-light mt-4 divide-y divide-[var(--border-warm)]">
        {generated.map(([n, d, t]) => (
          <div key={n} className="px-6 py-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium text-sm">{n}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">{d} · {t}</div>
            </div>
            <StatusBadge status="ready" />
            <button className="btn-ghost-light text-xs"><Download className="w-3 h-3" /> PDF</button>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <SectionLabel>Available Report Types</SectionLabel>
        <div className="mt-4 grid md:grid-cols-3 gap-5">
          {types.map(([n, d]) => (
            <div key={n} className="card-light p-6">
              <div className="font-display text-xl">{n}</div>
              <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">{d}</p>
              <button className="btn-primary mt-5 text-sm">Generate Now</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
