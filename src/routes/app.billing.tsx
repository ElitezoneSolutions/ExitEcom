import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";

export const Route = createFileRoute("/app/billing")({ component: Billing });

function Billing() {
  return (
    <>
      <PageHeader title="Billing" />
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card-dark p-7 lg:col-span-2">
          <div className="label-caps-dark" style={{ fontSize: 10 }}>Current Plan</div>
          <div className="font-display text-3xl text-[var(--accent)] mt-3">Professional · £199/mo</div>
          <div className="text-xs text-[var(--text-on-dark-secondary)] mt-2">Next billing date: 14 Jun 2026</div>
          <ul className="mt-6 space-y-2 text-sm text-[var(--text-on-dark)]">
            <li>· Full ExitOS dashboard</li>
            <li>· Risk Scanner & Valuation Engine</li>
            <li>· Optimization Plan, Investment Memo, Data Room</li>
            <li>· AI recommendations</li>
          </ul>
        </div>
        <div className="card-light p-7">
          <SectionLabel>Payment Method</SectionLabel>
          <div className="font-display text-xl mt-3">•••• 4242</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Expires 12/27</div>
          <button className="btn-ghost-light mt-5 text-sm">Update</button>
        </div>
      </div>

      <div className="mt-10">
        <SectionLabel>Invoice History</SectionLabel>
        <div className="card-light mt-4 divide-y divide-[var(--border-warm)]">
          {[
            ["14 May 2026", "£199.00"],
            ["14 Apr 2026", "£199.00"],
            ["14 Mar 2026", "£199.00"],
          ].map(([d, a]) => (
            <div key={d} className="px-6 py-3 flex items-center text-sm">
              <span className="flex-1">{d}</span>
              <span className="font-display w-32">{a}</span>
              <StatusBadge status="ready">Paid</StatusBadge>
              <button className="ml-4 text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] inline-flex items-center gap-1"><Download className="w-3 h-3" /> PDF</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
