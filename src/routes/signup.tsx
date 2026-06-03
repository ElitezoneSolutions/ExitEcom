import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  return <SplitAuth mode="signup" />;
}

export function SplitAuth({ mode }: { mode: "signup" | "login" }) {
  const { signUp, signIn, signInWithGoogle, verifyEmailOtp, resendSignupOtp } =
    useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // "form" = collect details, "otp" = enter the emailed 6-digit code.
  const [step, setStep] = useState<"form" | "otp">("form");
  const [otp, setOtp] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === "signup" && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    const loadingToast = toast.loading(
      mode === "signup" ? "Creating your account..." : "Signing in...",
    );

    try {
      if (mode === "signup") {
        const { error, data } = await signUp(email, password, fullName);
        toast.dismiss(loadingToast);
        if (error) {
          toast.error(error.message || "Failed to create account");
        } else {
          const hasSession = Boolean(
            (data as { session?: unknown } | null)?.session,
          );
          if (hasSession) {
            // Email confirmation disabled — session already active.
            toast.success("Account created successfully!");
            navigate({ to: "/onboarding" });
          } else {
            // Email confirmation on — verify with the emailed OTP code.
            toast.success("We emailed you a 6-digit verification code.");
            setStep("otp");
          }
        }
      } else {
        const { error } = await signIn(email, password);
        toast.dismiss(loadingToast);
        if (error) {
          toast.error(error.message || "Failed to sign in");
        } else {
          toast.success("Signed in successfully!");
          navigate({ to: "/app/dashboard" });
        }
      }
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (otp.length < 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    const loadingToast = toast.loading("Verifying code...");
    try {
      const { error } = await verifyEmailOtp(email, otp);
      toast.dismiss(loadingToast);
      if (error) {
        toast.error(error.message || "Invalid or expired code");
      } else {
        toast.success("Email verified!");
        navigate({ to: "/onboarding" });
      }
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      toast.error(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const { error } = await resendSignupOtp(email);
    if (error) toast.error(error.message || "Could not resend code");
    else toast.success("A new code is on its way.");
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error.message || "Google Sign-in failed");
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
          {mode === "signup" && step === "otp" ? (
            <OtpStep
              email={email}
              otp={otp}
              setOtp={setOtp}
              loading={loading}
              onVerify={handleVerify}
              onResend={handleResend}
              onBack={() => setStep("form")}
            />
          ) : (
            <>
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
              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                {mode === "signup" && (
                  <Field
                    label="Full Name"
                    type="text"
                    value={fullName}
                    onChange={setFullName}
                    disabled={loading}
                  />
                )}
                <Field
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  disabled={loading}
                />
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  disabled={loading}
                />
                {mode === "signup" && (
                  <Field
                    label="Confirm Password"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    disabled={loading}
                  />
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
                  disabled={loading}
                  className="btn-primary w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? mode === "signup"
                      ? "Creating Account..."
                      : "Signing In..."
                    : mode === "signup"
                      ? "Create Account"
                      : "Sign In"}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <span className="flex-1 h-px bg-[var(--border-warm)]" /> OR{" "}
                <span className="flex-1 h-px bg-[var(--border-warm)]" />
              </div>
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="btn-ghost-light w-full justify-center disabled:opacity-50"
              >
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function OtpStep({
  email,
  otp,
  setOtp,
  loading,
  onVerify,
  onResend,
  onBack,
}: {
  email: string;
  otp: string;
  setOtp: (val: string) => void;
  loading: boolean;
  onVerify: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <h1
        className="text-2xl text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
      >
        Verify your email
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        We sent a 6-digit code to{" "}
        <span className="text-[var(--text-primary)] font-medium">{email}</span>.
        Enter it below to finish creating your account.
      </p>
      <form className="mt-8 space-y-6" onSubmit={onVerify}>
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={setOtp}
            disabled={loading}
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <button
          type="submit"
          disabled={loading || otp.length < 6}
          className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Verifying..." : "Verify & Continue"}
        </button>
      </form>
      <p className="mt-6 text-sm text-center text-[var(--text-secondary)]">
        Didn't get a code?{" "}
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className="text-[var(--accent)] hover:text-[var(--accent-muted)] disabled:opacity-50"
        >
          Resend
        </button>
      </p>
      <p className="mt-2 text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          Use a different email
        </button>
      </p>
    </>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  disabled,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
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
        disabled={disabled}
        className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
      />
    </label>
  );
}
