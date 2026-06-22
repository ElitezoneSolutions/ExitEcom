import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { RequireSuperAdmin } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/_app/admin")({ component: AdminShell });

const TABS = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/documents", label: "Documents" },
  { to: "/admin/audit", label: "Audit Log" },
] as const;

// Admin layout. Nests under `_app`, so RequireAuth + BusinessDataProvider already
// wrap it; RequireSuperAdmin adds the role check on top. A horizontal sub-nav
// switches between the admin modules; each module renders through <Outlet/>.
function AdminShell() {
  const { pathname } = useLocation();
  return (
    <RequireSuperAdmin>
      <div>
        <nav className="flex items-center gap-1 mb-10 border-b border-[var(--border-warm)]">
          {TABS.map((t) => {
            // Exact match for the index tab; prefix match for the rest so a
            // sub-page keeps its parent tab highlighted.
            const active =
              t.to === "/admin"
                ? pathname === "/admin"
                : pathname === t.to || pathname.startsWith(`${t.to}/`);
            return (
              <Link
                key={t.to}
                to={t.to}
                className="relative px-4 py-3 text-sm transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {t.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--accent)]" />
                )}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </div>
    </RequireSuperAdmin>
  );
}
