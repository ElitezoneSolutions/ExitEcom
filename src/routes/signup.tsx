import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { RequireGuest, isSafeRedirect } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  return (
    <RequireGuest>
      <SplitAuth mode="signup" />
    </RequireGuest>
  );
}

export function SplitAuth({ mode }: { mode: "signup" | "login" }) {
  const {
    signUp,
    signIn,
    signInWithGoogle,
    verifyEmailOtp,
    resendSignupOtp,
    isDemoMode,
  } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as {
    redirect?: string;
    reason?: string;
  };
  const [loading, setLoading] = useState(false);
  // Dedicated to the Google button so it shows its own connecting state without
  // being conflated with the email form's submit.
  const [googleLoading, setGoogleLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Inline, field-level error for an email that already has an account.
  const [emailExists, setEmailExists] = useState(false);

  // "form" = collect details, "otp" = enter the emailed 6-digit code.
  const [step, setStep] = useState<"form" | "otp">("form");
  const [otp, setOtp] = useState("");

  // Where to land once authenticated: the page the user was bounced from, or
  // the dashboard by default.
  const goToApp = () =>
    router.history.push(
      isSafeRedirect(search.redirect) ? search.redirect : "/dashboard",
    );

  // Surface the "session expired" notice once, when redirected here for it.
  const expiredShown = useRef(false);
  useEffect(() => {
    if (
      mode === "login" &&
      search.reason === "expired" &&
      !expiredShown.current
    ) {
      expiredShown.current = true;
      toast.error("Your session has expired, please log in again.");
    }
  }, [mode, search.reason]);

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
        const {
          error,
          data,
          emailExists: exists,
        } = await signUp(email, password, fullName);
        toast.dismiss(loadingToast);
        if (exists) {
          // Specific, inline handling — keep the email populated, don't show a
          // generic toast.
          setEmailExists(true);
        } else if (error) {
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
          goToApp();
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
    if (loading || googleLoading) return;
    try {
      setGoogleLoading(true);
      // Carry the user's intended destination through Google → our callback,
      // which decides onboarding vs. app on return.
      const redirectParam =
        isSafeRedirect(search.redirect) && search.redirect
          ? `?redirect=${encodeURIComponent(search.redirect)}`
          : "";
      const callbackUrl = `${window.location.origin}/auth-callback${redirectParam}`;
      const { error } = await signInWithGoogle(callbackUrl);
      if (error) {
        toast.error(error.message || "Google Sign-in failed");
      } else if (isDemoMode) {
        // Real Supabase OAuth full-page-redirects to Google here; demo mode
        // signs in synchronously instead, so route through the callback
        // ourselves to land on onboarding/dashboard.
        navigate({
          to: "/auth-callback",
          search: { redirect: search.redirect },
        });
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      toast.error(errorMessage);
    } finally {
      setGoogleLoading(false);
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
                <div>
                  <Field
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(val) => {
                      setEmail(val);
                      if (emailExists) setEmailExists(false);
                    }}
                    disabled={loading}
                    invalid={emailExists}
                  />
                  {emailExists && (
                    <p className="mt-1.5 text-xs text-[var(--danger,#dc2626)]">
                      An account with this email already exists.{" "}
                      <Link
                        to="/login"
                        search={
                          isSafeRedirect(search.redirect)
                            ? { redirect: search.redirect }
                            : undefined
                        }
                        className="text-[var(--accent)] hover:text-[var(--accent-muted)] underline"
                      >
                        Log in instead
                      </Link>
                    </p>
                  )}
                </div>
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
                    <Link
                      to="/forgot-password"
                      className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || googleLoading}
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
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading || googleLoading}
                aria-busy={googleLoading}
                className="btn-ghost-light w-full justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" />
                    Connecting to Google…
                  </>
                ) : (
                  <>
                    <GoogleIcon className="w-[18px] h-[18px]" />
                    Continue with Google
                  </>
                )}
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

/** The official multi-colour Google "G" mark, for the OAuth button. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  disabled,
  invalid,
  required = true,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <label className="block">
      <span className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </span>
      <div className="relative mt-2">
        <input
          type={inputType}
          required={required}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full bg-transparent border rounded-md px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none transition-colors disabled:opacity-50 ${
            isPassword ? "pr-10" : ""
          } ${
            invalid
              ? "border-[var(--danger,#dc2626)] focus:border-[var(--danger,#dc2626)]"
              : "border-[var(--border-warm)] focus:border-[var(--accent)]"
          }`}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-muted)] hover:text-[var(--text-secondary)] focus:outline-none"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </label>
  );
}
