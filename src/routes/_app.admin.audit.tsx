import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { useAuth } from "@/hooks/useAuth";
import { getAuditLogFn, type AuditLogRow } from "@/lib/admin/analytics";

export const Route = createFileRoute("/_app/admin/audit")({
  component: AdminAudit,
});

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// Metadata is free-form jsonb, and report approvals put a full change list in
// it — so `String(value)` turned every approval's detail into
// "changes: [object Object],[object Object]". Objects and arrays are rendered
// structurally instead, with the override diff spelled out as before → after.
function Detail({ metadata }: { metadata: AuditLogRow["metadata"] }) {
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0)
    return <span className="text-[var(--text-muted)]">—</span>;

  return (
    <div className="space-y-1 text-xs">
      {entries.map(([key, value]) => {
        if (key === "changes" && Array.isArray(value)) {
          if (value.length === 0) {
            return (
              <div key={key} className="text-[var(--text-muted)]">
                published as computed — no edits
              </div>
            );
          }
          return (
            <details key={key}>
              <summary className="cursor-pointer text-[var(--accent)]">
                {value.length} edit{value.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 space-y-0.5 text-[var(--text-muted)]">
                {value.map((change, i) => {
                  const c = change as Record<string, unknown>;
                  return (
                    <li key={i}>
                      {String(c.label ?? c.path ?? "field")}:{" "}
                      <span className="line-through">
                        {String(c.from ?? "—")}
                      </span>{" "}
                      → {String(c.to ?? "—")}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        }
        return (
          <div key={key} className="text-[var(--text-muted)]">
            <span className="text-[var(--text-secondary)]">{key}:</span>{" "}
            {renderValue(value)}
          </div>
        );
      })}
    </div>
  );
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AdminAudit() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await getAuditLogFn({ data: { accessToken } }));
    } catch {
      setError(
        "Could not load the audit log. Check that admin access is configured.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows],
  );
  const visible =
    actionFilter === "all"
      ? rows
      : rows.filter((r) => r.action === actionFilter);

  const columns: AdminColumn<AuditLogRow>[] = [
    {
      key: "createdAt",
      header: "When",
      sortValue: (r) => r.createdAt,
      csv: (r) => r.createdAt,
      render: (r) => fmtDateTime(r.createdAt),
    },
    {
      key: "actor",
      header: "Admin",
      sortValue: (r) => r.actorEmail ?? "",
      search: (r) => `${r.actorEmail ?? ""} ${r.action} ${r.targetId ?? ""}`,
      csv: (r) => r.actorEmail ?? r.actorId ?? "",
      render: (r) => r.actorEmail ?? "—",
    },
    {
      key: "action",
      header: "Action",
      sortValue: (r) => r.action,
      csv: (r) => r.action,
    },
    {
      key: "target",
      header: "Target",
      sortValue: (r) => r.targetType ?? "",
      csv: (r) => `${r.targetType ?? ""} ${r.targetId ?? ""}`.trim(),
      render: (r) =>
        r.targetType ? (
          <span>
            {r.targetType}
            {r.targetId && (
              <span className="text-[var(--text-muted)]">
                {" "}
                · {r.targetId.slice(0, 8)}…
              </span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "metadata",
      header: "Detail",
      csv: (r) => JSON.stringify(r.metadata),
      render: (r) => <Detail metadata={r.metadata} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every administrative action, newest first."
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
          Loading audit log…
        </div>
      ) : (
        <AdminTable
          rows={visible}
          columns={columns}
          rowKey={(r) => r.id}
          exportName="exitecom-audit-log"
          searchPlaceholder="Search by admin, action, or target…"
          emptyMessage="No admin actions recorded yet."
          toolbar={
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Filter by action"
              className="px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded-md text-[var(--text-primary)]"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          }
        />
      )}
    </>
  );
}
