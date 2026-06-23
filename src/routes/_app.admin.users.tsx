import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  RefreshCw,
  ShieldCheck,
  KeyRound,
  Trash2,
  Check,
  Circle,
} from "lucide-react";
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

  const acct = detail?.account;

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{acct?.email ?? user.email}</DialogTitle>
          <p className="text-xs text-[var(--text-muted)] font-mono pt-0.5">
            {user.id}
          </p>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Account ---------------------------------------------------- */}
          <Section title="Account">
            <KeyValueGrid
              data={{
                Name: acct?.fullName ?? user.fullName ?? "—",
                Role: acct?.role ?? user.role,
                Joined: fmtDate(acct?.createdAt ?? user.createdAt),
                "Last sign-in": fmtDate(
                  acct?.lastSignInAt ?? user.lastSignInAt,
                ),
                "Email confirmed": acct
                  ? acct.emailConfirmedAt
                    ? fmtDate(acct.emailConfirmedAt)
                    : "Not confirmed"
                  : "—",
                Phone: acct?.phone || "—",
                "Sign-in providers": acct?.providers.length
                  ? acct.providers.join(", ")
                  : "Email / password",
              }}
            />
          </Section>

          {loading ? (
            <p className="text-[var(--text-muted)]">Loading full profile…</p>
          ) : detail ? (
            <>
              {/* Settings ---------------------------------------------- */}
              <Section title="Preferences">
                <KeyValueGrid
                  data={{
                    Timezone: detail.settings.timezone || "—",
                    Currency: detail.settings.currency || "—",
                    Notifications: notifSummary(
                      detail.settings.notificationPrefs,
                    ),
                  }}
                />
              </Section>

              {detail.business ? (
                <>
                  {/* Business profile -------------------------------- */}
                  <Section title="Business profile">
                    <KeyValueGrid
                      data={detail.business}
                      exclude={["id", "owner_id"]}
                    />
                  </Section>

                  {/* Valuation & metrics ----------------------------- */}
                  {detail.valuation && (
                    <Section title="Valuation & deterministic metrics">
                      <KeyValueGrid
                        data={detail.valuation}
                        exclude={[
                          "business_id",
                          "score_breakdown",
                          "revenue_monthly",
                        ]}
                      />
                    </Section>
                  )}

                  {/* Connectors -------------------------------------- */}
                  <Section title={`Connectors (${detail.connectors.length})`}>
                    {detail.connectors.length === 0 ? (
                      <p className="text-[var(--text-muted)]">
                        None connected.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {detail.connectors.map((c) => (
                          <div
                            key={c.source}
                            className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-warm)] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-[var(--text-primary)]">
                                {c.source}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] truncate">
                                {c.label ?? "—"}
                                {c.platform ? ` · ${c.platform}` : ""}
                                {c.currency ? ` · ${c.currency}` : ""}
                              </div>
                            </div>
                            <div className="text-right text-xs shrink-0">
                              <div className="text-[var(--text-secondary)]">
                                {c.lastSyncedAt
                                  ? `Synced ${fmtDate(c.lastSyncedAt)}`
                                  : (c.status ?? "connected")}
                              </div>
                              {c.monthsOfData != null && (
                                <div className="text-[var(--text-muted)]">
                                  {c.monthsOfData} mo of data
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  {/* Risks ------------------------------------------- */}
                  {detail.risks.length > 0 && (
                    <Section title={`Risks (${detail.risks.length})`}>
                      <div className="space-y-2">
                        {detail.risks.map((r, i) => (
                          <div
                            key={String(r.id ?? i)}
                            className="rounded-md border border-[var(--border-warm)] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[var(--text-primary)]">
                                {String(r.title ?? "Risk")}
                              </span>
                              <SeverityPill value={String(r.severity ?? "")} />
                            </div>
                            {r.description != null && (
                              <p className="text-xs text-[var(--text-muted)] mt-1">
                                {String(r.description)}
                              </p>
                            )}
                            {r.impact != null && Number(r.impact) !== 0 && (
                              <p className="text-xs text-[#DC2626] mt-1">
                                Impact:{" "}
                                {Number(r.impact).toLocaleString("en-GB")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Actions ----------------------------------------- */}
                  {detail.actions.length > 0 && (
                    <Section
                      title={`Optimization actions (${detail.actions.length})`}
                    >
                      <div className="space-y-2">
                        {detail.actions.map((a, i) => (
                          <div
                            key={String(a.id ?? i)}
                            className="rounded-md border border-[var(--border-warm)] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[var(--text-primary)]">
                                {String(a.title ?? "Action")}
                              </span>
                              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                                {String(a.priority ?? "")}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] mt-1 flex gap-3">
                              {a.uplift != null && Number(a.uplift) !== 0 && (
                                <span className="text-[var(--positive)]">
                                  +{Number(a.uplift).toLocaleString("en-GB")}
                                </span>
                              )}
                              {a.time != null && <span>{String(a.time)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Document checklist ------------------------------ */}
                  {detail.documents.length > 0 && (
                    <Section title="Due-diligence checklist">
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                        {detail.documents.map((d, i) => (
                          <li
                            key={`${d.name}-${i}`}
                            className="flex items-center gap-2"
                          >
                            {d.uploaded ? (
                              <Check className="w-3.5 h-3.5 text-[var(--positive)] shrink-0" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                            )}
                            <span
                              className={
                                d.uploaded
                                  ? "text-[var(--text-secondary)]"
                                  : "text-[var(--text-muted)]"
                              }
                            >
                              {d.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Uploaded files ---------------------------------- */}
                  {(detail.bankFiles.length > 0 ||
                    detail.plFiles.length > 0) && (
                    <Section title="Uploaded files">
                      <FileList
                        label="Bank statements"
                        files={detail.bankFiles}
                      />
                      <FileList label="P&L statements" files={detail.plFiles} />
                    </Section>
                  )}
                </>
              ) : (
                <p className="text-[var(--text-muted)] border-t border-[var(--border-warm)] pt-4">
                  No business profile yet.
                </p>
              )}
            </>
          ) : null}

          {/* Admin actions ------------------------------------------- */}
          <Section title="Admin actions">
            <div className="flex flex-col gap-2">
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
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Detail presentation helpers ------------------------------------------

const humanize = (k: string) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-GB");
  if (typeof v === "string" && /\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const fmtSize = (b: number | null) =>
  b == null
    ? "—"
    : b < 1024
      ? `${b} B`
      : b < 1_048_576
        ? `${Math.round(b / 1024)} KB`
        : `${(b / 1_048_576).toFixed(1)} MB`;

const notifSummary = (prefs: Record<string, unknown>) => {
  const on = Object.entries(prefs)
    .filter(([, v]) => v === true)
    .map(([k]) => humanize(k));
  return on.length ? on.join(", ") : "All off";
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--border-warm)] pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function KeyValueGrid({
  data,
  exclude = [],
}: {
  data: Record<string, unknown>;
  exclude?: string[];
}) {
  const entries = Object.entries(data).filter(([k]) => !exclude.includes(k));
  if (entries.length === 0)
    return <p className="text-[var(--text-muted)]">—</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
      {entries.map(([k, v]) => (
        <Field key={k} label={humanize(k)} value={fmtVal(v)} />
      ))}
    </div>
  );
}

function SeverityPill({ value }: { value: string }) {
  const v = value.toLowerCase();
  const color =
    v === "high"
      ? "text-[#DC2626] border-[#DC2626]/40"
      : v === "medium"
        ? "text-[var(--accent)] border-[var(--accent)]/40"
        : "text-[var(--text-muted)] border-[var(--border-warm)]";
  if (!value) return null;
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${color}`}
    >
      {value}
    </span>
  );
}

function FileList({
  label,
  files,
}: {
  label: string;
  files: {
    id: string;
    fileName: string;
    fileSize: number | null;
    uploadedAt: string | null;
    stored: boolean;
  }[];
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <ul className="space-y-1">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-[var(--text-secondary)] truncate">
              {f.fileName}
            </span>
            <span className="text-[var(--text-muted)] shrink-0">
              {fmtSize(f.fileSize)} · {fmtDate(f.uploadedAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-[var(--text-primary)] break-words">{value}</div>
    </div>
  );
}
