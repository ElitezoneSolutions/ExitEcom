import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { useBusinessData } from "@/hooks/useBusinessData";
import { normalizeBusinessProfileFn } from "@/lib/ai";

export const Route = createFileRoute("/_app/profile")({ component: Profile });

type ProfileForm = {
  name: string;
  industry: string;
  channel: string;
  country: string;
  age: string;
  monthlyRevenue: string;
  exitTimeframe: string;
};

const FIELDS: { key: keyof ProfileForm; label: string }[] = [
  { key: "name", label: "Business Name" },
  { key: "industry", label: "Industry" },
  { key: "channel", label: "Primary Channel" },
  { key: "country", label: "Country" },
  { key: "age", label: "Business Age" },
  { key: "monthlyRevenue", label: "Monthly Revenue" },
  { key: "exitTimeframe", label: "Exit Timeframe" },
];

function Profile() {
  const { business, loading, isShopifyConnected, updateBusiness } =
    useBusinessData();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    industry: "",
    channel: "",
    country: "",
    age: "",
    monthlyRevenue: "",
    exitTimeframe: "",
  });

  // Sync local form when the business loads/changes from Supabase.
  useEffect(() => {
    setForm({
      name: business.name,
      industry: business.industry,
      channel: business.channel,
      country: business.country,
      age: business.age,
      monthlyRevenue: business.monthlyRevenue,
      exitTimeframe: business.exitTimeframe,
    });
  }, [business]);

  const set =
    (key: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  // Track the latest form so the background tidy never clobbers edits the user
  // made while it was running.
  const formRef = useRef(form);
  formRef.current = form;

  // Saving is instant: persist exactly what was typed right away, then tidy the
  // wording in the background (Gemini — currency/ranges/casing, e.g.
  // "below 10k dollar" → "< $10k") and re-save SILENTLY only if it actually
  // changed something and the user hasn't kept editing. If AI is unavailable the
  // normalizer returns the trimmed values, so save always works either way.
  const handleSave = async () => {
    setSaving(true);
    const snapshot = form;
    await updateBusiness(snapshot);
    setSaving(false);

    try {
      const { fields, normalized } = await normalizeBusinessProfileFn({
        data: snapshot,
      });
      const changed = FIELDS.some(({ key }) => fields[key] !== snapshot[key]);
      const editedSince = FIELDS.some(
        ({ key }) => formRef.current[key] !== snapshot[key],
      );
      if (!changed || editedSince) return;
      setForm(fields);
      await updateBusiness(fields, { silent: true });
      if (normalized) toast.success("Tidied up your profile details.");
    } catch {
      // Normalizer unreachable — the typed values were already saved.
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
        <p className="text-sm text-[var(--text-muted)]">Loading profile...</p>
      </div>
    );
  }

  const ageParsed = parseFloat(business.age);
  const isYoungBusiness = !isNaN(ageParsed) && ageParsed < 3;

  return (
    <>
      <PageHeader
        title="Business Profile"
        subtitle="Core information used to benchmark and value your business."
        right={
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        }
      />
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card-light p-8 space-y-5">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-3 gap-4 items-center">
              <div className="label-caps" style={{ fontSize: 10 }}>
                {label}
              </div>
              <div className="col-span-2 space-y-1">
                <input
                  value={form[key]}
                  onChange={set(key)}
                  placeholder="—"
                  className="w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
                {key === "age" && isYoungBusiness && (
                  <p className="text-xs text-[var(--risk-medium)]">
                    ⚠️ Business age below 3 years may compress your multiple.
                    See Risk Scanner.
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-warm)]">
            Buyers verify your profile details during due diligence. Keep this
            up to date — we tidy your entries into a consistent format when you
            save (e.g. <span className="font-mono">below 10k dollar</span> →{" "}
            <span className="font-mono">&lt; $10k</span>), keeping your own
            currency.
          </div>
        </div>

        <div className="card-dark p-7 h-fit">
          <SectionLabel dark>Store Snapshot</SectionLabel>
          <div className="mt-5 space-y-4 text-sm text-[var(--text-on-dark)]">
            <Row
              l="Shopify"
              v={isShopifyConnected ? "Connected" : "Not connected"}
              ok={isShopifyConnected}
            />
            <Row l="Monthly Revenue" v={business.monthlyRevenue || "—"} />
            <Row l="Primary Channel" v={business.channel || "—"} />
            <Row l="Exit Timeframe" v={business.exitTimeframe || "—"} />
          </div>
          {!isShopifyConnected && (
            <p className="mt-5 text-xs text-[var(--text-on-dark-secondary)]">
              Connect Shopify from Data Sources to generate your valuation and
              results.
            </p>
          )}
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
