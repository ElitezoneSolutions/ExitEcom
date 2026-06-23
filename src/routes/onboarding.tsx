import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCw, ChevronDown } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { RequireAuth } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  ),
});

// Full list of countries for the "Country of Operation" dropdown.
const COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo (Brazzaville)",
  "Congo (Kinshasa)",
  "Costa Rica",
  "Côte d'Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

interface OnboardingData {
  businessName: string;
  industry: string;
  primaryChannel: string;
  country: string;
  monthlyRevenue: string;
  businessAge: string;
  paidAdManager: string;
  supplierRelationshipManager: string;
  hasDocumentedSops: string;
  exitTimeframe: string;
}

function Onboarding() {
  const [step, setStep] = useState(1);
  const total = 3;

  const [formData, setFormData] = useState<OnboardingData>({
    businessName: "",
    industry: "Beauty & Skincare",
    primaryChannel: "Shopify",
    country: "",
    monthlyRevenue: "< $10k",
    businessAge: "Under 12 months",
    paidAdManager: "Me",
    supplierRelationshipManager: "Me",
    hasDocumentedSops: "Yes, fully documented",
    exitTimeframe: "3 months",
  });

  const updateFields = (fields: Partial<OnboardingData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="border-b border-[var(--border-warm)]">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Logo />
          <div className="text-xs text-[var(--text-muted)]">
            Step {step} of {total}
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-8">
        <Stepper step={step} total={total} />
      </div>

      <main className="max-w-[680px] mx-auto px-6 lg:px-0 py-12 lg:py-16">
        {step === 1 && (
          <Step1
            data={formData}
            onChange={updateFields}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step3
            data={formData}
            onChange={updateFields}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && <Step4 data={formData} />}
      </main>
    </div>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  const labels = ["Business Basics", "Founder Context", "Finish Setup"];
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const active = idx <= step;
        return (
          <div key={i} className="flex-1 flex items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: active ? "var(--accent)" : "transparent",
                  color: active
                    ? "var(--accent-foreground)"
                    : "var(--text-muted)",
                  borderColor: active ? "var(--accent)" : "var(--border-warm)",
                }}
              >
                {idx}
              </div>
              <div className="hidden md:block text-xs text-[var(--text-secondary)]">
                {labels[i]}
              </div>
            </div>
            {i < total - 1 && (
              <div className="flex-1 h-px bg-[var(--border-warm)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card-light p-8 md:p-10"
    >
      {children}
    </motion.div>
  );
}

interface StepProps {
  data: OnboardingData;
  onChange: (fields: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const REVENUE_BRACKETS = [
  "< $10k",
  "$10k–$25k",
  "$25k–$50k",
  "$50k–$100k",
  "$100k+",
];
const REVENUE_CUSTOM = "Type a custom amount";

function Step1({ data, onChange, onNext }: StepProps) {
  // The Monthly Revenue field is either one of the preset brackets or a custom
  // typed amount. We're in "type" mode when the stored value isn't a bracket.
  const [revenueMode, setRevenueMode] = useState<"select" | "type">(
    REVENUE_BRACKETS.includes(data.monthlyRevenue) ? "select" : "type",
  );

  return (
    <StepCard>
      <SectionLabel>Step 01</SectionLabel>
      <h2 className="font-display mt-3 text-3xl">
        Tell us about your business
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        A few baseline details so we can benchmark against comparable
        acquisitions.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
        className="mt-8 grid md:grid-cols-2 gap-5"
      >
        <Input
          label="Business Name"
          value={data.businessName}
          onChange={(val) => onChange({ businessName: val })}
        />
        <Select
          label="Industry"
          value={data.industry}
          onChange={(val) => onChange({ industry: val })}
          options={[
            "Beauty & Skincare",
            "Fashion",
            "Health",
            "Electronics",
            "Home",
            "Food",
            "Other",
          ]}
        />
        <Select
          label="Primary Sales Channel"
          value={data.primaryChannel}
          onChange={(val) => onChange({ primaryChannel: val })}
          options={[
            { value: "Shopify", label: "Shopify" },
            { value: "Amazon", label: "Amazon (Coming soon)", disabled: true },
            {
              value: "WooCommerce",
              label: "WooCommerce (Coming soon)",
              disabled: true,
            },
            { value: "Etsy", label: "Etsy (Coming soon)", disabled: true },
            {
              value: "Multi-channel",
              label: "Multi-channel (Coming soon)",
              disabled: true,
            },
          ]}
        />
        <Select
          label="Country of Operation"
          value={data.country}
          onChange={(val) => onChange({ country: val })}
          placeholder="Select a country"
          options={COUNTRIES}
        />
        <div>
          <Select
            label="Monthly Revenue (USD)"
            value={
              revenueMode === "type" ? REVENUE_CUSTOM : data.monthlyRevenue
            }
            onChange={(val) => {
              if (val === REVENUE_CUSTOM) {
                setRevenueMode("type");
                onChange({ monthlyRevenue: "" });
              } else {
                setRevenueMode("select");
                onChange({ monthlyRevenue: val });
              }
            }}
            options={[...REVENUE_BRACKETS, REVENUE_CUSTOM]}
          />
          {revenueMode === "type" && (
            <div className="mt-3">
              <Input
                type="number"
                min={0}
                prefix="$"
                placeholder="Enter exact monthly revenue, e.g. 42000"
                value={data.monthlyRevenue}
                onChange={(val) => onChange({ monthlyRevenue: val })}
              />
            </div>
          )}
        </div>
        <Select
          label="Business Age"
          value={data.businessAge}
          onChange={(val) => onChange({ businessAge: val })}
          options={[
            "Under 12 months",
            "1–2 years",
            "2–3 years",
            "3–5 years",
            "5+ years",
          ]}
        />
        <div className="md:col-span-2 flex justify-end mt-2">
          <button className="btn-primary" type="submit">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </StepCard>
  );
}

function Step3({ data, onChange, onNext }: StepProps) {
  return (
    <StepCard>
      <SectionLabel>Step 02</SectionLabel>
      <h2 className="font-display mt-3 text-3xl">A few final questions</h2>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        These help our AI assess founder dependency — a key buyer concern.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
        className="mt-8 space-y-5"
      >
        <Select
          label="Who currently manages your paid advertising?"
          value={data.paidAdManager}
          onChange={(val) => onChange({ paidAdManager: val })}
          options={["Me", "A team member", "An agency", "No paid ads"]}
        />
        <Select
          label="Who handles supplier relationships?"
          value={data.supplierRelationshipManager}
          onChange={(val) => onChange({ supplierRelationshipManager: val })}
          options={["Me", "A team member", "Automated", "Not applicable"]}
        />
        <Select
          label="Do you have documented SOPs?"
          value={data.hasDocumentedSops}
          onChange={(val) => onChange({ hasDocumentedSops: val })}
          options={["Yes, fully documented", "Partially", "No"]}
        />
        <Select
          label="Are you looking to exit within:"
          value={data.exitTimeframe}
          onChange={(val) => onChange({ exitTimeframe: val })}
          options={["3 months", "6 months", "12 months", "Just exploring"]}
        />
        <div className="flex justify-end pt-2">
          <button className="btn-primary" type="submit">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </StepCard>
  );
}

function Step4({ data }: { data: OnboardingData }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messages = [
    "Saving your business profile...",
    "Setting up your workspace...",
    "Almost there...",
  ];
  const messageCount = messages.length;
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % messageCount), 1500);
    return () => clearInterval(t);
  }, [messageCount]);

  // Persist the onboarding answers to Supabase. This is the source of truth for
  // the business profile. Results (Exit Score, valuation, risks) come later from
  // Shopify, so we store ONLY the qualitative profile here — no fabricated or
  // placeholder numbers.
  useEffect(() => {
    let cancelled = false;

    const save = async () => {
      const minDelay = new Promise((r) => setTimeout(r, 2500));

      if (!isSupabaseConfigured || !user) {
        await minDelay;
        if (!cancelled) setDone(true);
        return;
      }

      try {
        const profileFields = {
          owner_id: user.id,
          name: data.businessName || "My Business",
          industry: data.industry,
          primary_channel: data.primaryChannel,
          country: data.country,
          monthly_revenue: data.monthlyRevenue,
          age: data.businessAge,
          paid_ad_manager: data.paidAdManager,
          supplier_relationship_manager: data.supplierRelationshipManager,
          has_documented_sops: data.hasDocumentedSops,
          exit_timeframe: data.exitTimeframe,
        };

        // Reuse an existing business for this user if present, else insert one.
        const { data: existing } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let businessId: string | undefined = existing?.id;

        if (businessId) {
          const { error } = await supabase
            .from("businesses")
            .update(profileFields)
            .eq("id", businessId);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase
            .from("businesses")
            .insert(profileFields)
            .select("id")
            .single();
          if (error) throw error;
          businessId = inserted.id;
        }

        // Ensure a zeroed valuation row exists for this business so Shopify can
        // populate it later. No placeholder values are written.
        const { error: valErr } = await supabase.from("valuation_data").upsert(
          {
            business_id: businessId,
            connected_sources: [],
            missing_sources: [],
          },
          { onConflict: "business_id" },
        );
        if (valErr) throw valErr;

        if (!cancelled) toast.success("Business profile saved.");
      } catch (err) {
        console.error("Failed to save onboarding to Supabase:", err);
        toast.error("We couldn't save your details. Please try again.");
      } finally {
        await minDelay;
        if (!cancelled) setDone(true);
      }
    };

    save();
    return () => {
      cancelled = true;
    };
  }, [user, data]);

  return (
    <div className="card-dark p-12 md:p-16 text-center">
      {!done ? (
        <>
          <div className="flex justify-center">
            <RefreshCw className="w-12 h-12 text-[var(--accent)] animate-spin" />
          </div>
          <p className="mt-10 text-[var(--text-on-dark)] text-lg font-display">
            {messages[i]}
          </p>
          <p className="mt-3 text-xs text-[var(--text-on-dark-secondary)] tracking-[0.18em] uppercase">
            This only takes a moment
          </p>
        </>
      ) : (
        <>
          <h3 className="font-display text-3xl text-[var(--text-on-dark)]">
            You're all set.
          </h3>
          <p className="mt-3 text-sm text-[var(--text-on-dark-secondary)]">
            Connect your data sources to generate your Exit Score, valuation and
            risk report. We can't calculate anything until your real store data
            is connected.
          </p>
          <button
            onClick={() => navigate({ to: "/data-sources" })}
            className="btn-primary mt-8"
          >
            Connect Data Sources <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  prefix,
  placeholder,
  min,
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  prefix?: string;
  placeholder?: string;
  min?: number;
}) {
  return (
    <label className="block">
      {label && (
        <span className="label-caps" style={{ fontSize: 10 }}>
          {label}
        </span>
      )}
      <div
        className={`${label ? "mt-2 " : ""}flex items-center w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 focus-within:border-[var(--accent)]`}
      >
        {prefix && (
          <span className="text-sm text-[var(--text-muted)] mr-1.5 select-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          required
          min={min}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full !border-0 !bg-transparent !px-0 !py-2.5 !shadow-none text-sm focus:outline-none text-[var(--text-primary)]"
        />
      </div>
    </label>
  );
}

type SelectOption =
  | string
  | { value: string; label?: string; disabled?: boolean };

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o, disabled: false } : o,
  );
  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <div className="relative mt-2">
        <select
          value={value}
          required={!!placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none !bg-transparent border border-[var(--border-warm)] rounded-md pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
        >
          {placeholder && (
            <option value="" disabled className="bg-[var(--bg-primary)]">
              {placeholder}
            </option>
          )}
          {normalized.map((o) => (
            <option
              key={o.value}
              value={o.value}
              disabled={o.disabled}
              className="bg-[var(--bg-primary)]"
            >
              {o.label ?? o.value}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </label>
  );
}
