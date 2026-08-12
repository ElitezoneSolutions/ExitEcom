import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, RefreshCw, Check } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { Input, Select } from "@/components/ex/FormField";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { RequireAuth } from "@/components/auth/RouteGuards";
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
} from "@/lib/profileOptions";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  ),
});

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

// Every field starts blank. Pre-selecting "Beauty & Skincare" or "Under 12
// months" would mean a founder who skims the form saves a guess we made on
// their behalf — and it would look identical to a deliberate answer.
const EMPTY: OnboardingData = {
  businessName: "",
  industry: "",
  primaryChannel: "Shopify", // The only connector we support, so not a guess.
  country: "",
  monthlyRevenue: "",
  businessAge: "",
  paidAdManager: "",
  supplierRelationshipManager: "",
  hasDocumentedSops: "",
  exitTimeframe: "",
};

// Answers are kept in localStorage as the founder moves through the steps, so
// a refresh, an accidental back-navigation or a dropped connection doesn't
// throw away everything they've typed. Cleared once the profile is saved.
const DRAFT_KEY = "exitecom_onboarding_draft";

function readDraft(): OnboardingData {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw
      ? { ...EMPTY, ...(JSON.parse(raw) as Partial<OnboardingData>) }
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

const STEPS = ["Business Basics", "Founder Context", "Finish Setup"];

function Onboarding() {
  const [step, setStep] = useState(1);
  const total = STEPS.length;
  const [formData, setFormData] = useState<OnboardingData>(EMPTY);

  // Restore after mount rather than in useState, so the server-rendered markup
  // matches the first client render.
  useEffect(() => setFormData(readDraft()), []);

  const updateFields = (fields: Partial<OnboardingData>) => {
    setFormData((prev) => {
      const next = { ...prev, ...fields };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        // Private browsing / quota — the draft is a convenience, not required.
      }
      return next;
    });
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
          <StepBasics
            data={formData}
            onChange={updateFields}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepFounder
            data={formData}
            onChange={updateFields}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && <StepSave data={formData} onBack={() => setStep(2)} />}
      </main>
    </div>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const active = idx <= step;
        const done = idx < step;
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
                {done ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                ) : (
                  idx
                )}
              </div>
              <div className="hidden md:block text-xs text-[var(--text-secondary)]">
                {STEPS[i]}
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

// Back / Continue. Step 1 has nothing to go back to, so `onBack` is optional.
function StepNav({ onBack }: { onBack?: () => void }) {
  return (
    <div className="md:col-span-2 flex items-center justify-between pt-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="btn-ghost-light text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      ) : (
        <span />
      )}
      <button className="btn-primary" type="submit">
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

interface StepProps {
  data: OnboardingData;
  onChange: (fields: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack?: () => void;
}

function StepBasics({ data, onChange, onNext }: StepProps) {
  return (
    <StepCard>
      <SectionLabel>Step 01</SectionLabel>
      <h2 className="font-display mt-3 text-3xl">
        Tell us about your business
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        A few baseline details so we can benchmark you against comparable
        acquisitions. You can change any of this later in Business Profile.
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
          placeholder="e.g. Northgate Skincare"
        />
        <Select
          label="Industry"
          value={data.industry}
          onChange={(val) => onChange({ industry: val })}
          placeholder="Select an industry"
          options={INDUSTRIES}
        />
        <Select
          label="Primary Sales Channel"
          value={data.primaryChannel}
          onChange={(val) => onChange({ primaryChannel: val })}
          placeholder="Select a channel"
          options={CHANNELS}
          hint="Shopify is the only platform we can read data from today."
        />
        <Select
          label="Country of Operation"
          value={data.country}
          onChange={(val) => onChange({ country: val })}
          placeholder="Select a country"
          options={COUNTRIES}
        />
        <Select
          label="Monthly Revenue (USD)"
          value={data.monthlyRevenue}
          onChange={(val) => onChange({ monthlyRevenue: val })}
          placeholder="Select a range"
          options={REVENUE_BRACKETS}
          hint="A rough range is fine — we use your real Shopify figures for every calculation."
        />
        <Select
          label="Business Age"
          value={data.businessAge}
          onChange={(val) => onChange({ businessAge: val })}
          placeholder="Select how long you've traded"
          options={BUSINESS_AGES}
        />
        <StepNav />
      </form>
    </StepCard>
  );
}

function StepFounder({ data, onChange, onNext, onBack }: StepProps) {
  return (
    <StepCard>
      <SectionLabel>Step 02</SectionLabel>
      <h2 className="font-display mt-3 text-3xl">How much runs through you?</h2>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        Founder dependency is one of the first things an acquirer probes. A
        store that only works because you're in it every day sells for less than
        the same store someone else could step into.
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
          placeholder="Select an answer"
          options={PAID_AD_MANAGERS}
        />
        <Select
          label="Who handles supplier relationships?"
          value={data.supplierRelationshipManager}
          onChange={(val) => onChange({ supplierRelationshipManager: val })}
          placeholder="Select an answer"
          options={SUPPLIER_MANAGERS}
        />
        <Select
          label="Do you have documented SOPs?"
          value={data.hasDocumentedSops}
          onChange={(val) => onChange({ hasDocumentedSops: val })}
          placeholder="Select an answer"
          options={SOP_STATES}
          hint="Written processes a new owner could follow without asking you."
        />
        <Select
          label="Are you looking to exit within:"
          value={data.exitTimeframe}
          onChange={(val) => onChange({ exitTimeframe: val })}
          placeholder="Select a timeframe"
          options={EXIT_TIMEFRAMES}
        />
        <StepNav onBack={onBack} />
      </form>
    </StepCard>
  );
}

function StepSave({
  data,
  onBack,
}: {
  data: OnboardingData;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messages = [
    "Saving your business profile...",
    "Setting up your workspace...",
    "Almost there...",
  ];
  const messageCount = messages.length;
  const [i, setI] = useState(0);
  const [status, setStatus] = useState<"saving" | "done" | "error">("saving");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % messageCount), 1500);
    return () => clearInterval(t);
  }, [messageCount]);

  // Persist the onboarding answers to Supabase. This is the source of truth for
  // the business profile. Results (Exit Score, valuation, risks) come later from
  // Shopify, so we store ONLY the qualitative profile here — no fabricated or
  // placeholder numbers.
  const save = useCallback(async () => {
    const minDelay = new Promise((r) => setTimeout(r, 2500));

    if (!isSupabaseConfigured || !user) {
      await minDelay;
      return "done" as const;
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

      await minDelay;
      return "done" as const;
    } catch (err) {
      console.error("Failed to save onboarding to Supabase:", err);
      await minDelay;
      return "error" as const;
    }
  }, [user, data]);

  useEffect(() => {
    let cancelled = false;
    setStatus("saving");

    save().then((result) => {
      if (cancelled) return;
      setStatus(result);
      if (result === "done") {
        toast.success("Business profile saved.");
        // The draft has served its purpose; keeping it would repopulate the
        // form if the founder ever revisits /onboarding.
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* nothing to clean up */
        }
      } else {
        toast.error("We couldn't save your details.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [save, attempt]);

  // A failed save used to still show "You're all set" — the founder would land
  // on an empty dashboard with no idea their answers were lost.
  if (status === "error") {
    return (
      <div className="card-light p-12 md:p-16 text-center">
        <h3 className="font-display text-3xl">We couldn't save that.</h3>
        <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-md mx-auto">
          Your answers are still here — nothing was lost. This is usually a
          connection problem, so trying again normally works.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button onClick={onBack} className="btn-ghost-light">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="btn-primary"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-dark p-12 md:p-16 text-center">
      {status === "saving" ? (
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
