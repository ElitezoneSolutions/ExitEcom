import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { listUsersFn, type AdminUserRow } from "@/lib/admin/users";

export const Route = createFileRoute("/_app/admin/users")({
  component: AdminUsers,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function AdminUsers() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";
  const navigate = useNavigate();

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listUsersFn({ data: { accessToken } }));
    } catch {
      setError("Could not load users. Check that admin access is configured.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: AdminColumn<AdminUserRow>[] = [
    {
      key: "email",
      header: "Email",
      sortValue: (r) => r.email,
      search: (r) => `${r.email} ${r.fullName ?? ""} ${r.businessName ?? ""}`,
      csv: (r) => r.email,
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{r.email}</div>
          {r.fullName && (
            <div className="text-xs text-[var(--text-muted)]">{r.fullName}</div>
          )}
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (r) => r.role,
      render: (r) =>
        r.role === "superadmin" ? (
          <StatusBadge status="premium">SUPERADMIN</StatusBadge>
        ) : (
          <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
            user
          </span>
        ),
    },
    {
      key: "business",
      header: "Business",
      sortValue: (r) => r.businessName ?? "",
      csv: (r) => r.businessName ?? "",
      render: (r) =>
        r.businessName ? (
          r.businessName
        ) : (
          <span className="text-[var(--text-muted)]">No profile</span>
        ),
    },
    {
      key: "exitScore",
      header: "Exit Score",
      sortValue: (r) => r.exitScore ?? -1,
      csv: (r) => r.exitScore ?? "",
      render: (r) => (r.exitScore != null ? r.exitScore : "—"),
    },
    {
      key: "sources",
      header: "Connectors",
      sortValue: (r) => r.connectedSources.length,
      csv: (r) => r.connectedSources.join("; "),
      render: (r) => r.connectedSources.length,
    },
    {
      key: "createdAt",
      header: "Joined",
      sortValue: (r) => r.createdAt ?? "",
      csv: (r) => r.createdAt ?? "",
      render: (r) => fmtDate(r.createdAt),
    },
    {
      key: "lastSignInAt",
      header: "Last sign-in",
      sortValue: (r) => r.lastSignInAt ?? "",
      csv: (r) => r.lastSignInAt ?? "",
      render: (r) => fmtDate(r.lastSignInAt),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Every registered account, their business profile, and exit-readiness snapshot. Select a user to see their full profile."
        right={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[var(--border-warm)] text-[var(--text-secondary)] hover:text-[var(--accent)]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="border border-[var(--border-warm)] rounded-lg px-4 py-10 text-center text-[var(--text-muted)]">
          {error}
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="border border-[var(--border-warm)] rounded-lg px-4 py-10 text-center text-[var(--text-muted)]">
          Loading users…
        </div>
      ) : (
        <AdminTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          exportName="exitecom-users"
          searchPlaceholder="Search by email, name, or business…"
          onRowClick={(r) =>
            navigate({
              to: "/admin-user/$userId",
              params: { userId: r.id },
            })
          }
        />
      )}
    </>
  );
}
