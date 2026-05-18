import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  return <SplitAuth mode="signup" />;
}

export function SplitAuth({ mode }: { mode: "signup" | "login" }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[40%_60%]">
      <aside className="surface-dark p-10 lg:p-14 flex flex-col">
        <Logo onDark />
        <div className="my-auto py-16 max-w-md">
          <SectionLabel gold>Why join ExitEcom</SectionLabel>
          <h2 className="font-display surface-dark-heading mt-6 text-4xl md:text-5xl leading-tight">
            {mode === "signup"
              ? "Know exactly what your business is worth to a buyer."
              : "Welcome back."}
          </h2>
          <ul className="mt-10 space-y-5">
            {[
              "Exit Score across 9 buyer dimensions",
              "Realistic valuation, not broker inflation",
              "Roadmap to increase your exit by £80k+",
            ].map((b) => (
              <li
                key={b}
                className="flex items-start gap-4 text-[var(--text-on-dark)]"
              >
                <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full border border-[var(--accent)]">
                  <Check
                    className="w-3 h-3 text-[var(--accent)]"
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[15px]">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-[var(--text-on-dark-secondary)]">
          Bank-grade encryption · SOC 2 aligned · Your data stays yours
        </div>
      </aside>

      <main className="bg-[var(--bg-primary)] p-8 lg:p-14 flex items-center justify-center">
        <div className="w-full max-w-[420px]">
          <h1
            className="text-2xl text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
          >
            {mode === "signup" ? "Create your account" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {mode === "signup"
              ? "It takes 90 seconds."
              : "Continue your exit prep."}
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href =
                mode === "signup" ? "/onboarding" : "/app/dashboard";
            }}
          >
            {mode === "signup" && <Field label="Full Name" type="text" />}
            <Field label="Email Address" type="email" />
            <Field label="Password" type="password" />
            {mode === "signup" && (
              <Field label="Confirm Password" type="password" />
            )}
            {mode === "login" && (
              <div className="text-right">
                <a
                  className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]"
                  href="#"
                >
                  Forgot password?
                </a>
              </div>
            )}
            <button
              type="submit"
              className="btn-primary w-full justify-center mt-2"
            >
              {mode === "signup" ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span className="flex-1 h-px bg-[var(--border-warm)]" /> OR{" "}
            <span className="flex-1 h-px bg-[var(--border-warm)]" />
          </div>
          <button className="btn-ghost-light w-full justify-center">
            Continue with Google
          </button>

          <p className="mt-8 text-sm text-[var(--text-secondary)] text-center">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="text-[var(--accent)] hover:text-[var(--accent-muted)]"
                >
                  Log in
                </Link>
              </>
            ) : (
              <>
                New to ExitEcom?{" "}
                <Link
                  to="/signup"
                  className="text-[var(--accent)] hover:text-[var(--accent-muted)]"
                >
                  Create account
                </Link>
              </>
            )}
          </p>
          <p className="mt-6 text-[11px] text-[var(--text-muted)] text-center max-w-sm mx-auto">
            ExitEcom uses bank-grade encryption. Your business data is never
            shared.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, type }: { label: string; type: string }) {
  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <input
        type={type}
        required
        className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </label>
  );
}
