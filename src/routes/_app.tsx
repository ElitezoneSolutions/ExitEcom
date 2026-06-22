import { useEffect } from "react";
import {
  createFileRoute,
  Outlet,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/ex/Sidebar";
import { RequireAuth } from "@/components/auth/RouteGuards";
import { BusinessDataProvider } from "@/hooks/useBusinessData";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app")({ component: AppShell });

// Every internal page nests under this pathless `_app` layout, so guarding this
// shared layout protects them all. The guard re-checks on each mount (direct URL, refresh,
// back button) and reacts to mid-session auth changes before anything renders.
//
// BusinessDataProvider sits inside the auth guard (so it only hydrates once a
// user is confirmed) and above both the Sidebar and the routed page, giving the
// whole subtree one shared business-data instance instead of one per consumer.
function AppShell() {
  return (
    <RequireAuth>
      <BusinessDataProvider>
        <AppBody />
      </BusinessDataProvider>
    </RequireAuth>
  );
}

function AppLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <RefreshCw
        className="w-8 h-8 text-[var(--accent)] animate-spin"
        strokeWidth={1.5}
        aria-label="Loading"
      />
    </div>
  );
}

// Superadmins use an admin-only console: any non-`/admin` route bounces to
// `/admin`. We also hold rendering until the role is resolved so a superadmin
// never sees the user app flash before the redirect fires.
function AppBody() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const router = useRouter();

  const onAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const redirectAdmin = role === "superadmin" && !onAdminRoute;

  useEffect(() => {
    if (redirectAdmin) router.navigate({ to: "/admin", replace: true });
  }, [redirectAdmin, router]);

  if (role === null || redirectAdmin) return <AppLoading />;

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="max-w-[1200px] mx-auto px-6 md:px-8 lg:px-10 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
