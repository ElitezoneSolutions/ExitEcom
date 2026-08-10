import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  RequireGuest,
  resolvePostAuthDestination,
} from "@/components/auth/RouteGuards";
import { Field } from "./signup";

export const Route = createFileRoute("/forgot-password")({
  component: () => (
    <RequireGuest>
      <ForgotPassword />
    </RequireGuest>
  ),
});

/**
 * Three-step recovery, all on one page:
 *   "email"    → request a 6-digit code (Supabase "Reset Password" template),
 *   "otp"      → exchange the code for a short-lived session,
 *   "password" → set the new password with that session.
 */
function ForgotPassword() {
  const { sendPasswordResetOtp, verifyPasswordResetOtp, updatePassword, user } =
    useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await sendPasswordResetOtp(email);
    setLoading(false);
    if (error) {
      toast.error(error.message || "Could not send reset code");
      return;
    }
    // Move on regardless of whether the address exists — the copy on the next
    // step is deliberately non-committal so we don't leak which emails are real.
    setStep("otp");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || otp.length < 6) return;
    setLoading(true);
    const { error } = await verifyPasswordResetOtp(email, otp);
    setLoading(false);
    if (error) {
      toast.error(error.message || "Invalid or expired code");
      return;
    }
    setStep("password");
  };

  const handleResend = async () => {
    const { error } = await sendPasswordResetOtp(email);
    if (error) toast.error(error.message || "Could not resend code");
    else toast.success("A new code is on its way.");
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      toast.error(error.message || "Could not update your password");
      return;
    }
    toast.success("Password updated. You're signed in.");
    // The recovery code already authenticated the user, so send them into the
    // app rather than back to the login form.
    const target = user
      ? await resolvePostAuthDestination(user.id, "/dashboard")
      : "/login";
    router.history.replace(target);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      <header className="border-b border-[var(--border-warm)]">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 h-16 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[420px]">
          <SectionLabel gold>Account recovery</SectionLabel>
          <h1
            className="mt-4 text-2xl text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
          >
            {step === "password" ? "Set a new password" : "Reset your password"}
          </h1>

          {step === "email" && (
            <>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Enter your email and we'll send you a 6-digit code.
              </p>
              <form className="mt-8 space-y-4" onSubmit={handleSendCode}>
                <Field
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Sending..." : "Send code"}
                </button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                If an account exists for{" "}
                <span className="text-[var(--text-primary)] font-medium">
                  {email}
                </span>
                , we've sent a 6-digit code. Enter it below.
              </p>
              <form className="mt-8 space-y-6" onSubmit={handleVerify}>
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
                  {loading ? "Verifying..." : "Verify code"}
                </button>
              </form>
              <p className="mt-6 text-sm text-center text-[var(--text-secondary)]">
                Didn't get a code?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-[var(--accent)] hover:text-[var(--accent-muted)] disabled:opacity-50"
                >
                  Resend
                </button>
              </p>
              <p className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setOtp("");
                    setStep("email");
                  }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  Use a different email
                </button>
              </p>
            </>
          )}

          {step === "password" && (
            <>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Code verified. Choose a new password for your account.
              </p>
              <form className="mt-8 space-y-4" onSubmit={handleSetPassword}>
                <Field
                  label="New Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  disabled={loading}
                />
                <Field
                  label="Confirm New Password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Updating..." : "Update password"}
                </button>
              </form>
            </>
          )}

          <p className="mt-8 text-sm text-[var(--text-secondary)] text-center">
            Remembered it?{" "}
            <Link
              to="/login"
              className="text-[var(--accent)] hover:text-[var(--accent-muted)]"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
