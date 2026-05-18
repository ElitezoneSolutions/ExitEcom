import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/ex/Sidebar";

export const Route = createFileRoute("/app")({ component: AppShell });

function AppShell() {
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
