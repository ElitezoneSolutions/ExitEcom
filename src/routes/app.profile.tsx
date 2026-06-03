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

  const isYoungBusiness = parseFloat(mockBusiness.age) < 3;
  return (
    <>
      <PageHeader
        title="Business Profile"
        subtitle="Core information used to benchmark and value your business."
      />
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card-light p-8 space-y-5">
          {fields.map(([l, v]) => (
            <div key={l} className="grid grid-cols-3 gap-4 items-center">
              <div className="label-caps" style={{ fontSize: 10 }}>
                {l}
              </div>
              <div className="col-span-2 space-y-1">
                <input
                  defaultValue={v}
                  className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
                {l === "Business Age" && isYoungBusiness && (
                  <p className="text-xs text-[var(--risk-medium)]">
                    ⚠️ Business age below 3 years may compress your multiple.
                    See Risk Scanner.
                  </p>
                )}
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Description
            </div>
            <textarea
              placeholder="Tell buyers what makes this business unique. What is the brand story? What would a new owner be acquiring?"
              className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Seller Intent
            </div>
            <select className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] appearance-none">
              <option value="" disabled selected>
                What is your timeline for exit?
              </option>
              <option value="0-6">0–6 months</option>
              <option value="6-12">6–12 months</option>
              <option value="12-24">12–24 months</option>
              <option value="exploring">Just exploring</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Target Asking Price
            </div>
            <input
              placeholder="Do you have a target price in mind?"
              type="text"
              className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-2">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Seller Strengths
            </div>
            <textarea
              placeholder="What are the 3 strongest things about this business?"
              className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
              rows={3}
            />
          </div>

          <div className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-warm)] flex items-center justify-between">
            <span>Last updated: 2 hours ago</span>
            <span className="text-[var(--accent)]">
              Buyers verify your profile details during due diligence. Keep this
              up to date.
            </span>
          </div>
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
        {ok && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--positive)]" />
        )}
        {v}
      </span>
    </div>
  );
}
