import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, ShieldCheck, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/ex/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  listUsersFn,
  getUserDetailFn,
  setUserRoleFn,
  sendPasswordResetFn,
  deleteUserFn,
  type AdminUserRow,
  type AdminUserDetail,
} from "@/lib/admin/users";

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

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

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
        subtitle="Every registered account, their business profile, and exit-readiness snapshot."
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
          onRowClick={setSelected}
        />
      )}

      <UserDetailDialog
        user={selected}
        accessToken={accessToken}
        onClose={() => setSelected(null)}
        onChanged={() => void load()}
      />
    </>
  );
}

function UserDetailDialog({
  user,
  accessToken,
  onClose,
  onChanged,
}: {
  user: AdminUserRow | null;
  accessToken: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user) {
      setDetail(null);
      setConfirmDelete(false);
      return;
    }
    setLoading(true);
    getUserDetailFn({ data: { accessToken, userId: user.id } })
      .then(setDetail)
      .catch(() => toast.error("Could not load user detail."))
      .finally(() => setLoading(false));
  }, [user, accessToken]);

  if (!user) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleRole = () =>
    run(
      () =>
        setUserRoleFn({
          data: {
            accessToken,
            userId: user.id,
            role: user.role === "superadmin" ? "user" : "superadmin",
          },
        }),
      `Role updated to ${user.role === "superadmin" ? "user" : "superadmin"}.`,
    ).then((ok) => ok && onClose());

  const resetPassword = () =>
    run(
      () =>
        sendPasswordResetFn({
          data: { accessToken, userId: user.id, email: user.email },
        }),
      "Password-reset email sent.",
    );

  const remove = () =>
    run(
      () => deleteUserFn({ data: { accessToken, userId: user.id } }),
      "User deleted.",
    ).then((ok) => ok && onClose());

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{user.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={user.fullName ?? "—"} />
            <Field label="Role" value={user.role} />
            <Field label="Joined" value={fmtDate(user.createdAt)} />
            <Field label="Last sign-in" value={fmtDate(user.lastSignInAt)} />
          </div>

          {loading ? (
            <p className="text-[var(--text-muted)]">Loading business detail…</p>
          ) : detail?.business ? (
            <div className="border-t border-[var(--border-warm)] pt-4 space-y-2">
              <Field
                label="Business"
                value={String(detail.business.name ?? "—")}
              />
              {detail.valuation && (
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Exit score"
                    value={String(detail.valuation.exit_score ?? "—")}
                  />
                  <Field
                    label="Risk score"
                    value={String(detail.valuation.risk_score ?? "—")}
                  />
                </div>
              )}
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">
                  Connectors
                </div>
                {detail.connectors.length === 0 ? (
                  <span className="text-[var(--text-muted)]">
                    None connected
                  </span>
                ) : (
                  <ul className="space-y-1">
                    {detail.connectors.map((c) => (
                      <li key={c.source} className="flex justify-between">
                        <span>{c.source}</span>
                        <span className="text-[var(--text-muted)]">
                          {c.lastSyncedAt ? fmtDate(c.lastSyncedAt) : c.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[var(--text-muted)] border-t border-[var(--border-warm)] pt-4">
              No business profile yet.
            </p>
          )}

          <div className="border-t border-[var(--border-warm)] pt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={toggleRole}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-warm)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {user.role === "superadmin"
                ? "Demote to user"
                : "Promote to superadmin"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetPassword}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-warm)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              Send password-reset email
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={remove}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-[#DC2626] text-white disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Confirm delete
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 rounded-md border border-[var(--border-warm)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Delete user
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
