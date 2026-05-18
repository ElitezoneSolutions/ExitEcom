import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/ex/PageHeader";

export const Route = createFileRoute("/app/settings")({ component: Settings });

const tabs = ["Profile", "Notifications", "Integrations", "Security"] as const;

function Settings() {
  const [tab, setTab] = useState<typeof tabs[number]>("Profile");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="border-b border-[var(--border-warm)] flex gap-6">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="pb-3 text-sm relative transition-colors" style={{ color: tab === t ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t}
            {tab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[var(--accent)]" />}
          </button>
        ))}
      </div>

      <div className="mt-8 card-light p-8 max-w-2xl">
        {tab === "Profile" && (
          <div className="space-y-4">
            {["Full name", "Email", "Password", "Timezone", "Currency"].map((l) => (
              <label key={l} className="block">
                <span className="label-caps" style={{ fontSize: 10 }}>{l}</span>
                <input className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm" />
              </label>
            ))}
            <button className="btn-primary mt-4">Save Changes</button>
          </div>
        )}
        {tab === "Notifications" && (
          <div className="space-y-4">
            {["Exit Score updates", "New risk detected", "Valuation changes", "Weekly summary"].map((l) => (
              <label key={l} className="flex items-center justify-between border-b border-[var(--border-warm)] py-3 text-sm">
                {l}
                <input type="checkbox" defaultChecked className="accent-[var(--accent)]" />
              </label>
            ))}
          </div>
        )}
        {tab === "Integrations" && <p className="text-sm text-[var(--text-secondary)]">Manage integrations from the Data Sources page for full controls.</p>}
        {tab === "Security" && (
          <div className="space-y-4 text-sm">
            <button className="btn-ghost-light">Change Password</button>
            <label className="flex items-center justify-between border-b border-[var(--border-warm)] py-3">Two-factor authentication <input type="checkbox" className="accent-[var(--accent)]" /></label>
            <div className="text-[var(--text-muted)] text-xs">No active sessions other than this device.</div>
          </div>
        )}
      </div>
    </>
  );
}
