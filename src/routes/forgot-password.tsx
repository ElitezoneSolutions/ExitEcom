import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/ex/Logo";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import { RequireGuest } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/forgot-password")({
  component: () => (
    <RequireGuest>
      <ForgotPassword />
    </RequireGuest>
  ),
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw new Error(error.message);
      }
      // Always show the same confirmation to avoid leaking which emails exist.
      setSent(true);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Could not send reset email",
      );
    } finally {
      setLoading(false);
    }
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
            Reset your password
          </h1>

          {sent ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              If an account exists for{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {email}
              </span>
              , we've sent a link to reset your password. Check your inbox.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Enter your email and we'll send you a link to set a new one.
              </p>
              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="label-caps" style={{ fontSize: 10 }}>
                    Email Address
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Sending..." : "Send reset link"}
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
