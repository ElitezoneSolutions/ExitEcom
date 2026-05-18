import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { ScoreRing } from "@/components/ex/ScoreRing";
import { ProgressBar } from "@/components/ex/ProgressBar";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

function Onboarding() {
  const [step, setStep] = useState(1);
  const total = 4;

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
        {step === 1 && <Step1 onNext={() => setStep(2)} />}
        {step === 2 && <Step2 onNext={() => setStep(3)} />}
        {step === 3 && <Step3 onNext={() => setStep(4)} />}
        {step === 4 && <Step4 />}
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

function Step1({ onNext }: { onNext: () => void }) {
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
        <Input label="Business Name" />
        <Select
          label="Industry"
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
          options={[
            "Shopify",
            "Amazon",
            "WooCommerce",
            "Etsy",
            "Multi-channel",
          ]}
        />
        <Input label="Country of Operation" />
        <Select
          label="Monthly Revenue"
          options={["< £10k", "£10k–£25k", "£25k–£50k", "£50k–£100k", "£100k+"]}
        />
        <Select
          label="Business Age"
          options={[
            "Under 12 months",
            "1–2 years",
            "2–3 years",
            "3–5 years",
            "5+ years",
          ]}
        />
        <div className="md:col-span-2 flex justify-end mt-2">
          <button className="btn-primary">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </StepCard>
  );
}

function Step2({ onNext }: { onNext: () => void }) {
  return (
    <StepCard>
      <SectionLabel>Step 02</SectionLabel>
      <h2 className="font-display mt-3 text-3xl">Connect your data sources</h2>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        The more data you connect, the more accurate your Exit Score.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <SectionLabel>Store Platform</SectionLabel>
          <div className="mt-3 flex items-center justify-between border border-[var(--border-warm)] rounded-lg px-5 py-4">
            <div>
              <div className="font-medium">Shopify</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Pulls revenue, orders, products, customers
              </div>
            </div>
            <button className="btn-ghost-light text-sm">Connect</button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Amazon, WooCommerce & others coming soon.
          </p>
        </div>

        <div>
          <SectionLabel>Marketing</SectionLabel>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {["Meta Ads", "Google Ads", "TikTok Ads", "Snapchat Ads"].map(
              (p) => (
                <div
                  key={p}
                  className="flex items-center justify-between border border-[var(--border-warm)] rounded-lg px-4 py-3"
                >
                  <span className="text-sm">{p}</span>
                  <button className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]">
                    Connect
                  </button>
                </div>
              ),
            )}
          </div>
        </div>

        <div>
          <SectionLabel>Financials</SectionLabel>
          <div className="mt-3 border border-dashed border-[var(--border-warm)] rounded-lg p-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Drop P&L (CSV / PDF) or{" "}
              <span className="text-[var(--accent)] cursor-pointer">
                browse
              </span>
            </p>
          </div>
        </div>

        <div>
          <SectionLabel>Data Completeness</SectionLabel>
          <div className="mt-3 flex items-center gap-4">
            <ProgressBar value={60} />
            <span className="font-display text-[var(--accent)] text-xl">
              60%
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            More connections = more accurate score.
          </p>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <button onClick={onNext} className="btn-ghost-light">
          Skip for Now
        </button>
        <button onClick={onNext} className="btn-primary">
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </StepCard>
  );
}

function Step3({ onNext }: { onNext: () => void }) {
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
          options={["Me", "A team member", "An agency", "No paid ads"]}
        />
        <Select
          label="Who handles supplier relationships?"
          options={["Me", "A team member", "Automated", "Not applicable"]}
        />
        <Select
          label="Do you have documented SOPs?"
          options={["Yes, fully documented", "Partially", "No"]}
        />
        <Select
          label="Are you looking to exit within:"
          options={["3 months", "6 months", "12 months", "Just exploring"]}
        />
        <div className="flex justify-end pt-2">
          <button className="btn-primary">
            Generate My Exit Score <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </StepCard>
  );
}

function Step4() {
  const messages = [
    "Analyzing revenue quality...",
    "Assessing buyer risk factors...",
    "Calculating valuation range...",
    "Building your Exit Score...",
  ];
  const messageCount = messages.length;
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % messageCount), 1500);
    const d = setTimeout(() => setDone(true), 5500);
    return () => {
      clearInterval(t);
      clearTimeout(d);
    };
  }, [messageCount]);

  return (
    <div className="card-dark p-12 md:p-16 text-center">
      {!done ? (
        <>
          <div className="flex justify-center">
            <ScoreRing score={62} size={160} />
          </div>
          <p className="mt-10 text-[var(--text-on-dark)] text-lg font-display">
            {messages[i]}
          </p>
          <p className="mt-3 text-xs text-[var(--text-on-dark-secondary)] tracking-[0.18em] uppercase">
            This usually takes 5–10 seconds
          </p>
        </>
      ) : (
        <>
          <h3 className="font-display text-3xl text-[var(--text-on-dark)]">
            Your Exit Score is ready.
          </h3>
          <p className="mt-3 text-sm text-[var(--text-on-dark-secondary)]">
            We've identified £80k of value left on the table.
          </p>
          <button
            onClick={() => navigate({ to: "/app/dashboard" })}
            className="btn-primary mt-8"
          >
            View My Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

function Input({ label, type = "text" }: { label: string; type?: string }) {
  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        type={type}
        className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <select className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)]">
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
