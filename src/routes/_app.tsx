import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/ex/Sidebar";
import { RequireAuth } from "@/components/auth/RouteGuards";
import { BusinessDataProvider } from "@/hooks/useBusinessData";

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
        <div className="min-h-screen flex bg-[var(--bg-primary)]">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <div className="max-w-[1200px] mx-auto px-6 md:px-8 lg:px-10 py-10">
              <Outlet />
            </div>
          </main>
        </div>
      </BusinessDataProvider>
    </RequireAuth>
  );
}
