import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isSafeRedirect } from "@/components/auth/RouteGuards";

// Google (via Supabase OAuth) redirects here after the user approves or denies
// the "Continue with Google" consent. This is a PUBLIC route — the visitor is
// mid-login and has no app session yet. Supabase's client parses the tokens from
// the URL on load (detectSessionInUrl) and fires SIGNED_IN, which populates the
// user. We then route them on:
//   - new user (no business profile yet) → /onboarding
//   - returning user                     → their saved `redirect`, else /dashboard
//   - denied / failed                    → /login with an explanatory toast.

interface CallbackSearch {
  /** Same-origin path to land on after a successful returning-user sign-in. */
  redirect?: string;
  /** Set by Google/Supabase when the user denies consent or auth fails. */
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/auth-callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_description:
      typeof search.error_description === "string"
        ? search.error_description
        : undefined,
  }),
  component: AuthCallback,
});

// How long to wait for Supabase to surface a session before giving up. Token
// parsing is near-instant, but allow generous headroom for a slow cold start.
const SESSION_TIMEOUT_MS = 10_000;

function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth-callback" });
  // The whole flow is one-shot: once we decide where to send the user, never
  // re-run (auth state keeps changing as the session settles).
  const handled = useRef(false);

  const bailToLogin = (message: string) => {
    if (handled.current) return;
    handled.current = true;
    toast.error(message);
    navigate({ to: "/login", replace: true });
  };

  // Google/Supabase reported an explicit failure (e.g. user denied access).
  useEffect(() => {
    if (search.error) {
      bailToLogin(
        search.error_description || "Google sign-in was cancelled or failed.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.error, search.error_description]);

  // Once authenticated, decide between onboarding and the app.
  useEffect(() => {
    if (loading || !user || handled.current || search.error) return;
    handled.current = true;

    (async () => {
      const target =
        isSafeRedirect(search.redirect) && search.redirect
          ? search.redirect
          : "/dashboard";

      // Demo mode (no Supabase) has no profile table — just go to the app.
      if (!isSupabaseConfigured) {
        navigate({ to: target as string, replace: true });
        return;
      }

      // First-time Google users have no business profile yet → onboarding.
      // Returning users go to their intended destination (or the dashboard).
      try {
        const { data } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        navigate({
          to: (data ? target : "/onboarding") as string,
          replace: true,
        });
      } catch {
        // If the profile lookup fails, don't trap the user — send them into the
        // app, where the empty/gated states handle a missing profile.
        navigate({ to: target as string, replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, search.error, search.redirect]);

  // No session showed up in time — the token round-trip likely failed.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!handled.current) {
        bailToLogin(
          "We couldn't complete your Google sign-in. Please try again.",
        );
      }
    }, SESSION_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)]">
      <RefreshCw
        className="w-8 h-8 text-[var(--accent)] animate-spin"
        strokeWidth={1.5}
        aria-label="Finishing sign-in"
      />
      <p className="text-sm text-[var(--text-secondary)]">
        Finishing your sign-in…
      </p>
    </div>
  );
}
