import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireSuperAdmin } from "@/components/auth/RouteGuards";
import { useAuth } from "@/hooks/useAuth";
import { getPendingCountFn } from "@/lib/admin/analytics";

export const Route = createFileRoute("/_app/admin")({ component: AdminShell });

const TABS = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/requests", label: "Review Queue" },
  { to: "/admin/documents", label: "Documents" },
  { to: "/admin/audit", label: "Audit Log" },
] as const;

// Admin layout. Nests under `_app`, so RequireAuth + BusinessDataProvider already
// wrap it; RequireSuperAdmin adds the role check on top. A horizontal sub-nav
// switches between the admin modules; each module renders through <Outlet/>.
function AdminShell() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";
  // Results stay unpublished until someone approves them, so the count belongs
  // on every admin page — not only on the one you have to remember to open.
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getPendingCountFn({ data: { accessToken } })
      .then((r) => !cancelled && setPending(r.pending))
      .catch(() => {
        // A badge is not worth an error state; the queue page reports failures.
      });
    return () => {
      cancelled = true;
    };
    // Re-checked on navigation so approving something updates the badge.
  }, [accessToken, pathname]);

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
                {t.to === "/admin/requests" && pending > 0 && (
                  <span
                    className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-medium align-middle"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-foreground)",
                    }}
                  >
                    {pending}
                  </span>
                )}
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
