import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/ex/Sidebar";
import { RequireAuth } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/app")({ component: AppShell });

// Every internal page lives under `/app`, so guarding this shared layout
// protects them all. The guard re-checks on each mount (direct URL, refresh,
// back button) and reacts to mid-session auth changes before anything renders.
function AppShell() {
  return (
    <RequireAuth>
      <div className="min-h-screen flex bg-[var(--bg-primary)]">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1200px] mx-auto px-6 md:px-8 lg:px-10 py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
