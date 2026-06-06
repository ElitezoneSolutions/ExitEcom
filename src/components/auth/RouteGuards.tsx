import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

  useEffect(() => {
    if (loading || user) return;

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
      const target = isSafeRedirect(search.redirect)
        ? search.redirect
        : "/dashboard";
      router.history.replace(target);
    }
  }, [loading, user, search.redirect, router]);

  if (loading || redirecting) return <AuthLoading />;
  return <>{children}</>;
}
