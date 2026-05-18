import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Upload, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { ProgressBar } from "@/components/ex/ProgressBar";
import { dataRoomCategories } from "@/lib/mock";

export const Route = createFileRoute("/app/data-room")({ component: DataRoom });

function DataRoom() {
  const total = dataRoomCategories.flatMap((c) => c.items).length;
  const done = dataRoomCategories.flatMap((c) => c.items).filter((i) => i.uploaded).length;
  const pct = Math.round((done / total) * 100);
  return (
    <>
      <PageHeader
        title="Data Room"
        subtitle="A buyer-grade document repository for due diligence."
        right={
          <div className="flex items-center gap-4">
            <div className="text-xs text-[var(--text-muted)]"><span className="font-display text-[var(--accent)] text-lg">{pct}%</span> complete</div>
            <button disabled className="btn-ghost-light text-sm opacity-60 cursor-not-allowed" title="Complete setup before sharing">Share with Buyer</button>
          </div>
        }
      />

      <div className="card-light p-6 mb-8 flex items-start gap-4" style={{ borderLeft: "3px solid var(--accent)" }}>
        <Sparkles className="w-5 h-5 text-[var(--accent)] mt-0.5" />
        <div className="flex-1">
          <div className="font-medium">ExitEcom can auto-generate your SOP documentation and due diligence Q&A</div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Pull from your connected data sources to draft buyer-ready documents in minutes.</p>
        </div>
        <button className="btn-primary text-sm">Generate with AI</button>
      </div>

      <div className="space-y-6">
        {dataRoomCategories.map((c) => {
          const compl = c.items.filter((i) => i.uploaded).length;
          return (
            <div key={c.name} className="card-light p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="font-display text-xl">{c.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{compl}/{c.items.length} complete</div>
              </div>
              <ProgressBar value={(compl / c.items.length) * 100} />
              <ul className="mt-5 divide-y divide-[var(--border-warm)]">
                {c.items.map((it) => (
                  <li key={it.name} className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-3 text-sm">
                      {it.uploaded
                        ? <CheckCircle2 className="w-4 h-4 text-[var(--positive)]" />
                        : <span className="w-4 h-4 inline-flex items-center justify-center text-[var(--risk-critical)]">✗</span>}
                      {it.name}
                    </span>
                    {!it.uploaded && (
                      <button className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)] inline-flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Upload
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
