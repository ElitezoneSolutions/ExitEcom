import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, Check } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { Input, Select } from "@/components/ex/FormField";
import { useBusinessData } from "@/hooks/useBusinessData";
import {
  BUSINESS_AGES,
  CHANNELS,
  COUNTRIES,
  EXIT_TIMEFRAMES,
  INDUSTRIES,
  PAID_AD_MANAGERS,
  REVENUE_BRACKETS,
  SOP_STATES,
  SUPPLIER_MANAGERS,
  businessAgeYears,
  withCurrentValue,
  type SelectOption,
} from "@/lib/profileOptions";

export const Route = createFileRoute("/_app/profile")({ component: Profile });

type ProfileForm = {
  name: string;
  industry: string;
  channel: string;
  country: string;
  age: string;
  monthlyRevenue: string;
  exitTimeframe: string;
  paidAdManager: string;
  supplierManager: string;
  hasDocumentedSops: string;
};

const EMPTY_FORM: ProfileForm = {
  name: "",
  industry: "",
  channel: "",
  country: "",
  age: "",
  monthlyRevenue: "",
  exitTimeframe: "",
  paidAdManager: "",
  supplierManager: "",
  hasDocumentedSops: "",
};

const KEYS = Object.keys(EMPTY_FORM) as (keyof ProfileForm)[];

// Every editable field, grouped the way a buyer reads them. `options` present
// means a dropdown; absent means free text. All the lists come from
// profileOptions.ts, which onboarding uses too — so a value chosen at signup is
// always one of the choices here.
type Field = {
  key: keyof ProfileForm;
  label: string;
  options?: readonly SelectOption[];
  placeholder?: string;
};

const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: "Business Basics",
    blurb: "What you sell, where you sell it, and how long you've traded.",
    fields: [
      { key: "name", label: "Business Name", placeholder: "Your business" },
      { key: "industry", label: "Industry", options: INDUSTRIES },
      { key: "channel", label: "Primary Channel", options: CHANNELS },
      {
        key: "country",
        label: "Country",
        options: COUNTRIES,
        placeholder: "Select a country",
      },
      { key: "age", label: "Business Age", options: BUSINESS_AGES },
      {
        key: "monthlyRevenue",
        label: "Monthly Revenue",
        options: REVENUE_BRACKETS,
        placeholder: "Select a range",
      },
    ],
  },
  {
    title: "Exit Intent",
    blurb: "How soon you want to sell shapes which optimizations are worth it.",
    fields: [
      {
        key: "exitTimeframe",
        label: "Exit Timeframe",
        options: EXIT_TIMEFRAMES,
      },
    ],
  },
  {
    title: "Founder Dependency",
    blurb:
      "How much of the business runs through you personally. Buyers probe this early — a store that only works because you're in it every day sells for less.",
    fields: [
      {
        key: "paidAdManager",
        label: "Paid Ads Managed By",
        options: PAID_AD_MANAGERS,
      },
      {
        key: "supplierManager",
        label: "Suppliers Managed By",
        options: SUPPLIER_MANAGERS,
      },
      {
        key: "hasDocumentedSops",
        label: "Documented SOPs",
        options: SOP_STATES,
      },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);

function Profile() {
  const { business, loading, isShopifyConnected, updateBusiness } =
    useBusinessData();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);

  // Sync local form when the business loads/changes from Supabase.
  useEffect(() => {
    setForm(
      KEYS.reduce((acc, key) => {
        acc[key] = business[key] ?? "";
        return acc;
      }, {} as ProfileForm),
    );
  }, [business]);

  const set = (key: keyof ProfileForm) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const dirty = useMemo(
    () => KEYS.some((key) => (business[key] ?? "") !== form[key]),
    [business, form],
  );

  const missing = ALL_FIELDS.filter((f) => !form[f.key]);

  const handleSave = async () => {
    setSaving(true);
    await updateBusiness(form);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw
          className="w-8 h-8 text-[var(--accent)] animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Loading profile…
        </p>
      </div>
    );
  }

  // "Under 12 months" and "1–2 years" are labels, not numbers — parse the
  // conservative end of the band. Unknown stays silent rather than warning.
  const years = businessAgeYears(form.age);
  const isYoungBusiness = years !== null && years < 3;

  return (
    <>
      <PageHeader
        title="Business Profile"
        subtitle="Core information used to benchmark and value your business."
        right={
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
          </button>
        }
      />
      <div className="grid lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="card-light p-8">
              <SectionLabel>{group.title}</SectionLabel>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                {group.blurb}
              </p>
              <div className="mt-6 grid md:grid-cols-2 gap-5">
                {group.fields.map((f) => {
                  const id = `profile-field-${f.key}`;
                  return (
                    <div key={f.key}>
                      {f.options ? (
                        <Select
                          id={id}
                          label={f.label}
                          value={form[f.key]}
                          onChange={set(f.key)}
                          disabled={saving}
                          required={false}
                          placeholder={
                            f.placeholder ?? `Select ${f.label.toLowerCase()}`
                          }
                          // A value stored before this list existed (or typed
                          // during onboarding) stays selectable rather than
                          // being silently swapped for something else.
                          options={withCurrentValue(f.options, form[f.key])}
                        />
                      ) : (
                        <Input
                          id={id}
                          label={f.label}
                          value={form[f.key]}
                          onChange={set(f.key)}
                          disabled={saving}
                          required={false}
                          placeholder={f.placeholder}
                        />
                      )}
                      {f.key === "age" && isYoungBusiness && (
                        <p className="mt-1.5 text-xs text-[var(--risk-medium)] flex items-start gap-1.5">
                          <AlertTriangle
                            className="w-3.5 h-3.5 shrink-0 mt-px"
                            strokeWidth={1.5}
                          />
                          Under 3 years of trading history may compress your
                          multiple. See Risk Scanner.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-xs text-[var(--text-muted)]">
            Buyers verify every one of these during due diligence. Your answers
            are used for benchmarking and context only — your Exit Score,
            valuation and risks are computed from your connected store data, not
            from this page.
          </p>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <div className="card-dark p-7">
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

          {/* Blank fields are the ones a buyer will ask about, so name them
              rather than leaving the founder to spot the dashes themselves. */}
          <div className="card-light p-7">
            <SectionLabel>Profile Completeness</SectionLabel>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-3xl">
                {Math.round(
                  ((ALL_FIELDS.length - missing.length) / ALL_FIELDS.length) *
                    100,
                )}
                %
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {ALL_FIELDS.length - missing.length} of {ALL_FIELDS.length}{" "}
                fields
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-[var(--border-warm)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)]"
                style={{
                  width: `${((ALL_FIELDS.length - missing.length) / ALL_FIELDS.length) * 100}%`,
                }}
              />
            </div>
            {missing.length === 0 ? (
              <p className="mt-4 text-xs text-[var(--positive)] flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" strokeWidth={2} /> Everything's
                filled in.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs text-[var(--text-muted)]">
                  Still missing:
                </p>
                <ul className="mt-2 space-y-1">
                  {missing.map((f) => (
                    <li
                      key={f.key}
                      className="text-xs text-[var(--text-secondary)]"
                    >
                      · {f.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
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
