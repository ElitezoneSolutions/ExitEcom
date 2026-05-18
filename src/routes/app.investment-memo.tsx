import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { mockBusiness, fmtGBP } from "@/lib/mock";

export const Route = createFileRoute("/app/investment-memo")({
  component: Memo,
});

function Memo() {
  const [tone, setTone] = useState("Institutional");
  return (
    <>
      <PageHeader
        title="Investment Memo"
        subtitle="Buyer-ready summary document, generated from your live data."
      />
      <div className="grid lg:grid-cols-[35%_65%] gap-6">
        <aside className="card-light p-6 h-fit lg:sticky lg:top-6">
          <SectionLabel>Memo Settings</SectionLabel>
          <div className="mt-5 space-y-5">
            <div>
              <div className="label-caps" style={{ fontSize: 10 }}>
                Business Name
              </div>
              <input
                defaultValue={mockBusiness.name}
                className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="label-caps" style={{ fontSize: 10 }}>
                Tone
              </div>
              <div className="mt-2 flex gap-2">
                {["Institutional", "Balanced", "Growth-Focused"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className="px-3 py-1.5 rounded-sm text-xs border transition-colors"
                    style={{
                      backgroundColor:
                        tone === t ? "var(--accent)" : "transparent",
                      borderColor:
                        tone === t ? "var(--accent)" : "var(--border-warm)",
                      color:
                        tone === t
                          ? "var(--accent-foreground)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {[
                "Financial data",
                "Risk section",
                "Growth opportunities",
                "Asking price",
              ].map((opt) => (
                <label key={opt} className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked />
                  {opt}
                </label>
              ))}
            </div>
            <button className="btn-primary w-full justify-center">
              Regenerate Memo
            </button>
            <div className="flex gap-2">
              <button className="btn-ghost-light flex-1 justify-center text-xs">
                Download PDF
              </button>
              <button className="btn-ghost-light flex-1 justify-center text-xs">
                Copy
              </button>
            </div>
          </div>
        </aside>

        <article className="bg-white border border-[var(--border-warm)] rounded-lg p-10 lg:p-12 shadow-sm">
          <div className="border-b border-[var(--border-warm)] pb-6">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Confidential Investment Memorandum
            </div>
            <h2 className="font-display text-3xl mt-3">{mockBusiness.name}</h2>
            <div className="text-xs text-[var(--text-muted)] mt-2">
              Prepared {new Date().toLocaleDateString("en-GB")}
            </div>
          </div>
          {[
            [
              "1. Executive Summary",
              `${mockBusiness.name} is a ${mockBusiness.age} ${mockBusiness.industry.toLowerCase()} brand operating across ${mockBusiness.channel}, generating ${fmtGBP(mockBusiness.revenueTTM)} in trailing revenue at a 26% net margin. The business demonstrates a strong growth trajectory with diversified channels but presents concentration and dependency risks that compress acquirer multiples.`,
            ],
            [
              "2. Business Overview",
              `Headquartered in ${mockBusiness.country}, the company operates a direct-to-consumer model with a hero SKU representing 72% of revenue. Customer acquisition is largely paid social, supplemented by a developing email channel.`,
            ],
            [
              "3. Financial Performance",
              `Trailing twelve-month revenue of ${fmtGBP(mockBusiness.revenueTTM)}, EBITDA of ${fmtGBP(mockBusiness.ebitda)}, and SDE of ${fmtGBP(mockBusiness.sde)} after add-backs.`,
            ],
            [
              "4. Growth Drivers",
              `Category tailwinds, expanding repeat-buyer base (24%), and a roadmap to launch two adjacent SKUs that materially expand TAM.`,
            ],
            [
              "5. Risk Factors",
              `Product concentration, founder dependency, and paid-acquisition reliance. Management has begun documenting SOPs and diversifying channels to address these.`,
            ],
            [
              "6. Investment Thesis",
              `Acquire a profitable, growing brand with a clear roadmap to a 2.4x multiple at ${fmtGBP(mockBusiness.optimised)} once concentration risks are addressed.`,
            ],
          ].map(([h, b]) => (
            <section
              key={h}
              className="py-6 border-b border-[var(--border-warm)] last:border-0"
            >
              <h3 className="font-display text-xl">{h}</h3>
              <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                {b}
              </p>
            </section>
          ))}
          <div className="mt-6 text-[10px] text-[var(--text-muted)] tracking-[0.18em] uppercase text-center">
            Confidential — ExitEcom — Generated for internal distribution only
          </div>
        </article>
      </div>
    </>
  );
}
