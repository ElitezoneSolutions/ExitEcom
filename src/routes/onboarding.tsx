import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

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
  const total = 4;

  const [formData, setFormData] = useState<OnboardingData>({
    businessName: "",
    industry: "Beauty & Skincare",
    primaryChannel: "Shopify",
    country: "",
    monthlyRevenue: "< £10k",
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
          <Step2
            data={formData}
            onChange={updateFields}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3
            data={formData}
            onChange={updateFields}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && <Step4 data={formData} />}
      </main>
    </div>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  const labels = [
    "Business Basics",
    "Connect Data",
    "Founder Context",
    "Generate Score",
  ];
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

function Step1({ data, onChange, onNext }: StepProps) {
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
            "Shopify",
            "Amazon",
            "WooCommerce",
            "Etsy",
            "Multi-channel",
          ]}
        />
        <Input
          label="Country of Operation"
          value={data.country}
          onChange={(val) => onChange({ country: val })}
        />
        <Select
          label="Monthly Revenue"
          value={data.monthlyRevenue}
          onChange={(val) => onChange({ monthlyRevenue: val })}
          options={["< £10k", "£10k–£25k", "£25k–£50k", "£50k–£100k", "£100k+"]}
        />
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

function Step2({ onNext }: StepProps) {
  const comingSoon = [
    "Meta Ads",
    "Google Ads",
    "TikTok Ads",
    "Snapchat Ads",
    "P&L Upload",
    "Google Analytics 4",
  ];

  return (
    <StepCard>
      <SectionLabel>Step 02</SectionLabel>
      <h2 className="font-display mt-3 text-3xl">Connect your store</h2>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        ExitEcom builds your Exit Score directly from your Shopify store. You'll
        connect it right after setup — nothing is analysed until you do.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <SectionLabel>Store Platform</SectionLabel>
          <div className="mt-3 flex items-center justify-between border border-[var(--border-warm)] rounded-lg px-5 py-4">
            <div>
              <div className="font-medium text-[var(--text-primary)]">
                Shopify
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Pulls revenue, orders, products and customers
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-sm bg-[var(--sidebar-active)] text-[var(--accent)] font-medium">
              Connect after setup
            </span>
          </div>
        </div>

        <div>
          <SectionLabel>More integrations — Coming soon</SectionLabel>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {comingSoon.map((label) => (
              <div
                key={label}
                className="flex items-center justify-between border border-[var(--border-warm)] rounded-lg px-4 py-3 opacity-60"
              >
                <span className="text-sm text-[var(--text-primary)]">
                  {label}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-end">
        <button onClick={onNext} className="btn-primary">
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </StepCard>
  );
}

function Step3({ data, onChange, onNext }: StepProps) {
  return (
    <StepCard>
      <SectionLabel>Step 03</SectionLabel>
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
            Generate My Exit Score <ArrowRight className="w-4 h-4" />
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
            Connect your Shopify store to generate your Exit Score, valuation
            and risk report.
          </p>
          <button
            onClick={() => navigate({ to: "/app/data-sources" })}
            className="btn-primary mt-8"
          >
            Connect Shopify <ArrowRight className="w-4 h-4" />
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
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[var(--bg-primary)]">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
