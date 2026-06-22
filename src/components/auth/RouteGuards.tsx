import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Full-screen loading state shown while auth is being resolved or a redirect is
 * in flight. Protected content must never render until the check resolves, so
 * every guard falls back to this instead of leaking the page underneath.
 */
function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <RefreshCw
        className="w-8 h-8 text-[var(--accent)] animate-spin"
        strokeWidth={1.5}
        aria-label="Checking your session"
      />
    </div>
  );
}

/**
 * Only internal (same-origin, path-relative) destinations are accepted as a
 * post-login redirect target. This blocks open-redirect attempts via a crafted
 * `?redirect=` value (e.g. `//evil.com` or `https://evil.com`).
 */
export function isSafeRedirect(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\")
  );
}

/**
 * Decides where a freshly-authenticated user should land:
 * - a returning user (already has a business profile) → `preferred` (their saved
 *   redirect target or the dashboard);
 * - a brand-new user (no profile yet — e.g. a first-time "Continue with Google"
 *   sign-up) → `/onboarding`.
 *
 * Shared by every entry point a session can appear at (the OAuth callback and
 * the guest-page guard) so the choice is consistent no matter where the OAuth
 * round-trip happens to drop the user. Falls back to `preferred` if the profile
 * lookup can't run, so a transient error never traps the user on a loader.
 */
export async function resolvePostAuthDestination(
  userId: string,
  preferred: string,
): Promise<string> {
  if (!isSupabaseConfigured) return preferred;
  try {
    // Superadmins use an admin-only console — send them straight to /admin,
    // bypassing onboarding and the user dashboard entirely.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role === "superadmin") return "/admin";

    const { data } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    return data ? preferred : "/onboarding";
  } catch {
    return preferred;
  }
}

/**
 * Guards protected pages. Renders children only once a session is confirmed.
 *
 * - While auth is resolving (`loading`) → loader, never the page.
 * - No user → redirect to `/login`, remembering where they were headed via the
 *   `redirect` search param so login can send them back.
 * - Runs on mount AND reacts to later auth changes, so a session that expires
 *   (or a logout in another tab) while the page is open kicks the user out.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, sessionExpired, acknowledgeExpiry } = useAuth();
  const router = useRouter();
  const location = useLocation();
  // Prevents re-running the redirect when location.href updates as a side-effect
  // of the navigation we already initiated (which would re-encode the URL infinitely).
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (loading || user) {
      redirectingRef.current = false;
      return;
    }
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    const expired = sessionExpired;
    if (expired) acknowledgeExpiry();

    router.navigate({
      to: "/login",
      search: {
        redirect: location.href,
        ...(expired ? { reason: "expired" } : {}),
      },
      replace: true,
    });
  }, [user, loading, sessionExpired, acknowledgeExpiry, location.href, router]);

  if (loading || !user) return <AuthLoading />;
  return <>{children}</>;
}

/**
 * Guards public-only pages (login / signup / forgot-password).
 *
 * If the visitor is ALREADY authenticated when they land here, bounce them to
 * the app (honouring any `redirect` target). We decide this once, on the first
 * resolved auth state — so that signing in/up *from* these pages doesn't get
 * hijacked mid-flow (those handlers do their own navigation, e.g. to
 * `/onboarding`).
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const decided = useRef(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || decided.current) return;
    decided.current = true;

    if (user) {
      setRedirecting(true);
      const preferred = isSafeRedirect(search.redirect)
        ? search.redirect
        : "/dashboard";
      // Route new users (no profile) to onboarding, returning users to the app.
      // This is the fallback for OAuth round-trips that land on a guest page
      // (e.g. the index → /signup bounce) rather than the dedicated callback.
      resolvePostAuthDestination(user.id, preferred).then((target) => {
        router.history.replace(target);
      });
    }
  }, [loading, user, search.redirect, router]);

  if (loading || redirecting) return <AuthLoading />;
  return <>{children}</>;
}

/**
 * Guards the Super Admin dashboard. Sits INSIDE `RequireAuth` (so a session is
 * already guaranteed), and additionally requires the resolved role to be
 * `superadmin`.
 *
 * - While auth or the role is still resolving (`loading` or `role === null`) →
 *   loader, never the page.
 * - A signed-in non-superadmin is bounced to `/dashboard` (not `/login` — they
 *   are authenticated, just not authorized).
 */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const redirectingRef = useRef(false);

  const unauthorized =
    !loading && role !== null && (!user || role !== "superadmin");

  useEffect(() => {
    if (!unauthorized) {
      redirectingRef.current = false;
      return;
    }
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    router.navigate({ to: "/dashboard", replace: true });
  }, [unauthorized, router]);

  if (loading || role === null || role !== "superadmin") return <AuthLoading />;
  return <>{children}</>;
}
