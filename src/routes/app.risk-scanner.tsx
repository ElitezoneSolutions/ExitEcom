import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { RiskCard } from "@/components/ex/RiskCard";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { mockBusiness, topRisks, additionalRisks, fmtGBP, fmtGBPk } from "@/lib/mock";

export const Route = createFileRoute("/app/risk-scanner")({ component: RiskScanner });

function RiskScanner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Risk Scanner" subtitle="Buyer-grade risk intelligence — focused, not a firehose." />

      <div className="grid md:grid-cols-3 gap-5">
        <Hero label="Risk Score" value={`${mockBusiness.riskScore} / 100`} sub="Moderate Risk" />
        <Hero label="Estimated Value Lost" value={fmtGBP(mockBusiness.totalValueLost)} sub="Across all identified risks" />
        <Hero label="Risks Identified" value="6 total" sub="2 High · 3 Medium · 1 Low" />
      </div>

      <div className="mt-12">
        <SectionLabel>Critical Buyer Concerns</SectionLabel>
        <div className="mt-4 space-y-4">
          {topRisks.map((r) => <RiskCard key={r.title} {...r} />)}
        </div>
      </div>

      <div className="mt-10">
        <button onClick={() => setOpen(o => !o)} className="card-light w-full px-6 py-4 flex items-center justify-between hover:border-[var(--accent)] transition-colors">
          <span className="text-sm font-medium">{additionalRisks.length} Additional Risks</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-3 card-light divide-y divide-[var(--border-warm)]">
            {additionalRisks.map((r) => (
              <div key={r.title} className="px-6 py-4 flex items-center gap-4">
                <StatusBadge status={r.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{r.description}</div>
                </div>
                <div className="font-display text-[var(--accent)]">{fmtGBPk(r.impact)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Valuation impact summary */}
      <div className="mt-12 card-light p-8">
        <SectionLabel>Valuation Impact Summary</SectionLabel>
        <div className="mt-6 grid md:grid-cols-3 gap-6 items-center">
          <div className="text-center">
            <div className="label-caps" style={{ fontSize: 10 }}>Current Value</div>
            <div className="font-display text-3xl mt-2 text-[var(--text-muted)]">{fmtGBP(220000)}</div>
          </div>
          <div className="text-center text-[var(--text-muted)]">
            <div>→</div>
            <div className="text-xs mt-2">If risks addressed</div>
          </div>
          <div className="text-center">
            <div className="label-caps" style={{ fontSize: 10 }}>Potential Value</div>
            <div className="font-display text-3xl mt-2 text-[var(--accent)]">{fmtGBP(340000)}</div>
          </div>
        </div>
        <div className="mt-6 h-2 bg-[var(--bg-secondary)] rounded-sm relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-[var(--text-muted)]" style={{ width: "65%" }} />
          <div className="absolute inset-y-0 right-0 bg-[var(--accent)]" style={{ width: "35%" }} />
        </div>
        <div className="mt-3 text-center text-xs text-[var(--text-muted)] tracking-[0.12em] uppercase">£120k Opportunity</div>
      </div>

      <div className="mt-8 px-6 py-4 flex items-center justify-between flex-wrap gap-3 border-t border-[var(--border-warm)]">
        <span className="text-sm text-[var(--text-secondary)]">Address these risks to unlock {fmtGBP(120000)} in exit value.</span>
        <Link to="/app/optimization" className="text-sm text-[var(--accent)] hover:text-[var(--accent-muted)] inline-flex items-center gap-1">
          Open Optimization Plan <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </>
  );
}

function Hero({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card-dark p-7">
      <div className="label-caps-dark" style={{ fontSize: 10 }}>{label}</div>
      <div className="font-display text-[var(--accent)] text-4xl mt-4 leading-none">{value}</div>
      <div className="mt-3 text-xs text-[var(--text-on-dark-secondary)]">{sub}</div>
    </div>
  );
}
