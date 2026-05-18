import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { mockBusiness } from "@/lib/mock";

export const Route = createFileRoute("/app/profile")({ component: Profile });

function Profile() {
  const fields = [
    ["Business Name", mockBusiness.name],
    ["Trading Name", mockBusiness.name],
    ["Industry", mockBusiness.industry],
    ["Country", mockBusiness.country],
    ["Business Age", mockBusiness.age],
    ["Primary URL", mockBusiness.url],
  ];
  return (
    <>
      <PageHeader title="Business Profile" subtitle="Core information used to benchmark and value your business." />
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card-light p-8 space-y-5">
          {fields.map(([l, v]) => (
            <div key={l} className="grid grid-cols-3 gap-4 items-center">
              <div className="label-caps" style={{ fontSize: 10 }}>{l}</div>
              <input defaultValue={v} className="col-span-2 bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" />
            </div>
          ))}
          <textarea placeholder="Description" className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" rows={4} />
          <div className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-warm)]">Last updated: 2 hours ago</div>
        </div>
        <div className="card-dark p-7 h-fit">
          <SectionLabel dark>Store Snapshot</SectionLabel>
          <div className="mt-5 space-y-4 text-sm text-[var(--text-on-dark)]">
            <Row l="Shopify" v="Connected" ok />
            <Row l="Meta Ads" v="Connected" ok />
            <Row l="Monthly Revenue" v="£35k–£45k" />
            <Row l="Channel" v={mockBusiness.channel} />
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ l, v, ok }: { l: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-dark)] pb-3">
      <span className="text-xs text-[var(--text-on-dark-secondary)]">{l}</span>
      <span className="inline-flex items-center gap-2">
        {ok && <span className="w-1.5 h-1.5 rounded-full bg-[var(--positive)]" />}
        {v}
      </span>
    </div>
  );
}
