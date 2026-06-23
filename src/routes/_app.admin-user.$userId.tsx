import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  KeyRound,
  Trash2,
  Check,
  Circle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { ScoreRing } from "@/components/ex/ScoreRing";
import { RiskCard } from "@/components/ex/RiskCard";
import { ActionCard } from "@/components/ex/ActionCard";
import { RequireSuperAdmin } from "@/components/auth/RouteGuards";
import { useAuth } from "@/hooks/useAuth";
import { fmtGBP, fmtGBPk } from "@/lib/utils";
import {
  getUserDetailFn,
  setUserRoleFn,
  sendPasswordResetFn,
  deleteUserFn,
  type AdminUserDetail,
} from "@/lib/admin/users";

export const Route = createFileRoute("/_app/admin-user/$userId")({
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  return (
    <RequireSuperAdmin>
      <UserDetail />
    </RequireSuperAdmin>
  );
}

// --- Formatting helpers ----------------------------------------------------

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

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

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sev = (s: unknown): "high" | "medium" | "low" =>
  s === "high" || s === "medium" ? s : "low";

// Curated, properly-formatted headline metrics from the valuation row (money as
// £, ratios as %, multiples as ×) — far more readable than a raw column dump.
const metricTiles = (v: Record<string, unknown>) => {
  const pct = (x: unknown) => `${Math.round(num(x) * 100)}%`;
  const mult = (x: unknown) => `${num(x)}×`;
  return [
    { l: "Adjusted Earnings", v: fmtGBPk(num(v.adjusted_earnings)) },
    { l: "Revenue (TTM)", v: fmtGBPk(num(v.revenue_ttm)) },
    { l: "EBITDA", v: fmtGBPk(num(v.ebitda)) },
    { l: "Avg Order Value", v: fmtGBP(num(v.avg_order_value)) },
    { l: "ROAS", v: mult(v.roas) },
    { l: "Repeat Rate", v: pct(v.repeat_rate) },
    { l: "Top Product Share", v: pct(v.top_product_share) },
    { l: "Data Confidence", v: `${num(v.data_confidence)}%` },
    { l: "Quick Sale", v: fmtGBPk(num(v.quick_sale)) },
    { l: "Fair Market", v: fmtGBPk(num(v.fair_market)) },
    {
      l: "Optimised Value",
      v: fmtGBPk(num(v.valuation_optimised || v.optimised)),
    },
    { l: "Current Multiple", v: mult(v.current_multiple) },
    { l: "Optimised Multiple", v: mult(v.optimised_multiple) },
    { l: "Total Value Lost", v: fmtGBPk(num(v.total_value_lost)) },
  ];
};

// --- Page ------------------------------------------------------------------

function UserDetail() {
  const { userId } = Route.useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const accessToken = session?.access_token ?? "";

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await getUserDetailFn({ data: { accessToken, userId } }));
    } catch {
      setError(
        "Could not load this user. Check that admin access is configured.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const role = detail?.account.role ?? "user";

  const toggleRole = () =>
    run(
      () =>
        setUserRoleFn({
          data: {
            accessToken,
            userId,
            role: role === "superadmin" ? "user" : "superadmin",
          },
        }),
      `Role updated to ${role === "superadmin" ? "user" : "superadmin"}.`,
    ).then((okk) => {
      if (okk) void load();
    });

  const resetPassword = () =>
    run(
      () =>
        sendPasswordResetFn({
          data: { accessToken, userId, email: detail?.account.email ?? "" },
        }),
      "Password-reset email sent.",
    );

  const remove = () =>
    run(
      () => deleteUserFn({ data: { accessToken, userId } }),
      "User deleted.",
    ).then((okk) => {
      if (okk) void navigate({ to: "/admin/users" });
    });

  if (loading && !detail) {
    return (
      <FullScreen>
        <RefreshCw
          className="w-7 h-7 text-[var(--accent)] animate-spin"
          strokeWidth={1.5}
          aria-label="Loading"
        />
      </FullScreen>
    );
  }

  if (error || !detail) {
    return (
      <FullScreen>
        <div className="text-center">
          <p className="text-[var(--text-muted)]">
            {error ?? "User not found."}
          </p>
          <Link
            to="/admin/users"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--accent)]"
          >
            <ArrowLeft className="w-4 h-4" /> Back to users
          </Link>
        </div>
      </FullScreen>
    );
  }

  const { account, settings, business, valuation } = detail;
  const businessName = (business?.name as string) || null;
  const exitScore = valuation ? num(valuation.exit_score) : null;
  const riskScore = valuation ? num(valuation.risk_score) : null;
  const docsUploaded = detail.documents.filter((d) => d.uploaded).length;
  const missingSources = Array.isArray(valuation?.missing_sources)
    ? (valuation.missing_sources as string[])
    : [];

  // Which in-page sections exist (drives the aside nav + ordering).
  const sections: { id: string; label: string }[] = [
    business ? { id: "overview", label: "Overview" } : null,
    { id: "account", label: "Account & preferences" },
    business ? { id: "business", label: "Business profile" } : null,
    valuation ? { id: "valuation", label: "Valuation & metrics" } : null,
    detail.connectors.length ? { id: "connectors", label: "Connectors" } : null,
    detail.risks.length ? { id: "risks", label: "Risks" } : null,
    detail.actions.length ? { id: "actions", label: "Optimization" } : null,
    detail.documents.length ? { id: "documents", label: "Documents" } : null,
    detail.bankFiles.length || detail.plFiles.length
      ? { id: "files", label: "Uploaded files" }
      : null,
  ].filter((s): s is { id: string; label: string } => s !== null);

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      <UserAside
        detail={detail}
        role={role}
        sections={sections}
        busy={busy}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        onToggleRole={toggleRole}
        onReset={resetPassword}
        onDelete={remove}
        exitScore={exitScore}
        riskScore={riskScore}
        docsLabel={`${docsUploaded}/${detail.documents.length}`}
        businessName={businessName}
      />

      <main className="flex-1 min-w-0">
        <div className="max-w-[1100px] mx-auto px-6 md:px-8 lg:px-10 py-10 space-y-10">
          {/* Mobile header (aside is lg-only) */}
          <div className="lg:hidden">
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to users
            </Link>
          </div>

          <PageHeader
            title={businessName ?? account.email}
            subtitle={
              businessName
                ? `${account.email} · full account overview`
                : "Full account overview"
            }
          />

          {/* Overview hero ---------------------------------------------- */}
          {business && valuation && (
            <section id="overview" className="scroll-mt-6">
              <div className="grid md:grid-cols-3 gap-5">
                {/* Exit readiness */}
                <div className="card-dark p-7">
                  <SectionLabel dark>Exit Readiness Score</SectionLabel>
                  <div className="mt-6 flex items-center gap-5">
                    <ScoreRing
                      score={exitScore ?? 0}
                      size={120}
                      trackColor="var(--border-warm)"
                    />
                    <div>
                      {valuation.score_tier ? (
                        <div className="inline-flex items-center px-2.5 py-1 border border-[var(--accent)] rounded-sm">
                          <span className="text-[var(--accent)] text-[10px] tracking-[0.16em] uppercase">
                            {String(valuation.score_tier)}
                          </span>
                        </div>
                      ) : null}
                      <p className="mt-3 text-xs text-[var(--text-muted)] max-w-[150px]">
                        Deterministic score from connected data
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Risk score {riskScore ?? "—"} · {detail.risks.length}{" "}
                    flagged
                  </div>
                </div>

                {/* Value range */}
                <div className="card-dark p-7">
                  <SectionLabel dark>Estimated Value Range</SectionLabel>
                  <div className="font-display text-[var(--accent)] text-[34px] mt-5 leading-none">
                    {fmtGBPk(num(valuation.valuation_low))} —{" "}
                    {fmtGBPk(num(valuation.valuation_high))}
                  </div>
                  <div className="mt-3 text-sm text-[var(--text-primary)]">
                    Fair Market: {fmtGBP(num(valuation.fair_market))}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    Current Multiple: {num(valuation.current_multiple)}×
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Gauge className="w-3.5 h-3.5" /> Data confidence{" "}
                    {num(valuation.data_confidence)}%
                  </div>
                </div>

                {/* Value gap */}
                <div className="surface-accent p-7 rounded-lg">
                  <div className="text-[10px] tracking-[0.18em] uppercase font-medium surface-accent-muted">
                    Value Left on the Table
                  </div>
                  <div className="font-display text-[44px] leading-none mt-5">
                    {fmtGBP(num(valuation.value_gap))}
                  </div>
                  <p className="mt-3 text-sm leading-snug max-w-[220px] surface-accent-muted">
                    Unrealised value vs. the optimised valuation of{" "}
                    {fmtGBPk(num(valuation.valuation_optimised))}.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Account & preferences -------------------------------------- */}
          <Panel id="account" title="Account & preferences">
            <KeyValueGrid
              data={{
                Name: account.fullName ?? "—",
                Email: account.email,
                Role: account.role,
                Joined: fmtDate(account.createdAt),
                "Last sign-in": fmtDate(account.lastSignInAt),
                "Email confirmed": account.emailConfirmedAt
                  ? fmtDate(account.emailConfirmedAt)
                  : "Not confirmed",
                Phone: account.phone || "—",
                "Sign-in providers": account.providers.length
                  ? account.providers.join(", ")
                  : "Email / password",
                Timezone: settings.timezone || "—",
                Currency: settings.currency || "—",
                Notifications: notifSummary(settings.notificationPrefs),
              }}
            />
          </Panel>

          {/* Business profile ------------------------------------------- */}
          {business ? (
            <Panel id="business" title="Business profile">
              <KeyValueGrid data={business} exclude={["id", "owner_id"]} />
            </Panel>
          ) : (
            <Panel title="Business profile">
              <p className="text-[var(--text-muted)]">
                This account has no business profile yet.
              </p>
            </Panel>
          )}

          {/* Key metrics ------------------------------------------------ */}
          {valuation && (
            <section id="valuation" className="scroll-mt-6">
              <SectionLabel>Key metrics</SectionLabel>
              <div className="mt-4 card-light grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-[var(--border-warm)]">
                {metricTiles(valuation).map((t) => (
                  <div key={t.l} className="px-5 py-5">
                    <div className="label-caps" style={{ fontSize: 10 }}>
                      {t.l}
                    </div>
                    <div className="font-display text-2xl mt-2 text-[var(--text-primary)]">
                      {t.v}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Connectors ------------------------------------------------- */}
          {(detail.connectors.length > 0 || missingSources.length > 0) && (
            <section id="connectors" className="scroll-mt-6">
              <SectionLabel>
                Connected data sources ({detail.connectors.length})
              </SectionLabel>
              {detail.connectors.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {detail.connectors.map((c) => (
                    <div
                      key={c.source}
                      className="card-light flex items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-[var(--positive)] shrink-0" />
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
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right text-xs">
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
                        <StatusBadge status="connected" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  No data sources connected yet.
                </p>
              )}
              {missingSources.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--text-muted)]">
                    Not connected:
                  </span>
                  {missingSources.map((m) => (
                    <StatusBadge key={m} status="missing">
                      {m.replace(/_/g, " ").toUpperCase()}
                    </StatusBadge>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Risks ------------------------------------------------------ */}
          {detail.risks.length > 0 && (
            <section id="risks" className="scroll-mt-6">
              <SectionLabel>Risks ({detail.risks.length})</SectionLabel>
              <div className="mt-3 space-y-4">
                {detail.risks.map((r, i) => (
                  <RiskCard
                    key={String(r.id ?? i)}
                    title={String(r.title ?? "Risk")}
                    severity={sev(r.severity)}
                    description={String(r.description ?? "")}
                    impact={num(r.impact)}
                    buyerSees={r.buyer_sees ? String(r.buyer_sees) : undefined}
                    buyerFears={
                      r.buyer_fears ? String(r.buyer_fears) : undefined
                    }
                    buyerDoes={r.buyer_does ? String(r.buyer_does) : undefined}
                    recommendation={
                      r.recommendation ? String(r.recommendation) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Optimization actions --------------------------------------- */}
          {detail.actions.length > 0 && (
            <section id="actions" className="scroll-mt-6">
              <SectionLabel>
                Optimization actions ({detail.actions.length})
              </SectionLabel>
              <div className="mt-3 space-y-4">
                {detail.actions.map((a, i) => (
                  <ActionCard
                    key={String(a.id ?? i)}
                    title={String(a.title ?? "Action")}
                    priority={sev(a.priority)}
                    uplift={num(a.uplift)}
                    time={String(a.time ?? "—")}
                    problem={String(a.problem ?? "")}
                    steps={Array.isArray(a.steps) ? a.steps.map(String) : []}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Document checklist ----------------------------------------- */}
          {detail.documents.length > 0 && (
            <Panel id="documents" title="Due-diligence checklist">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {detail.documents.map((d, i) => (
                  <li
                    key={`${d.name}-${i}`}
                    className="flex items-center gap-2"
                  >
                    {d.uploaded ? (
                      <Check className="w-4 h-4 text-[var(--positive)] shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span
                      className={
                        d.uploaded
                          ? "text-sm text-[var(--text-secondary)]"
                          : "text-sm text-[var(--text-muted)]"
                      }
                    >
                      {d.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Uploaded files --------------------------------------------- */}
          {(detail.bankFiles.length > 0 || detail.plFiles.length > 0) && (
            <Panel id="files" title="Uploaded files">
              <FileList label="Bank statements" files={detail.bankFiles} />
              <FileList label="P&L statements" files={detail.plFiles} />
            </Panel>
          )}
        </div>
      </main>
    </div>
  );
}

// --- Left aside (replaces the global sidebar) ------------------------------

function UserAside({
  detail,
  role,
  sections,
  busy,
  confirmDelete,
  setConfirmDelete,
  onToggleRole,
  onReset,
  onDelete,
  exitScore,
  riskScore,
  docsLabel,
  businessName,
}: {
  detail: AdminUserDetail;
  role: "user" | "superadmin";
  sections: { id: string; label: string }[];
  busy: boolean;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  onToggleRole: () => void;
  onReset: () => void;
  onDelete: () => void;
  exitScore: number | null;
  riskScore: number | null;
  docsLabel: string;
  businessName: string | null;
}) {
  const { account } = detail;
  const initial = (
    account.fullName?.[0] ??
    account.email[0] ??
    "?"
  ).toUpperCase();

  return (
    <aside className="hidden lg:flex flex-col w-[280px] shrink-0 h-screen sticky top-0 bg-[var(--sidebar)] border-r border-[var(--border-warm)]">
      <div className="px-6 pt-7 pb-5 border-b border-[var(--border-warm)]">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to users
        </Link>

        <div className="mt-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)] font-display">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm text-[var(--text-primary)] truncate">
              {account.fullName ?? "—"}
            </div>
            <div className="text-xs text-[var(--text-muted)] truncate">
              {account.email}
            </div>
          </div>
        </div>

        <div className="mt-3">
          {role === "superadmin" ? (
            <StatusBadge status="premium">SUPERADMIN</StatusBadge>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              User
            </span>
          )}
        </div>

        {businessName && (
          <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-sm bg-[var(--sidebar-active)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span className="text-[11px] text-[var(--text-secondary)] truncate">
              {businessName}
            </span>
          </div>
        )}
      </div>

      {/* Quick facts */}
      <div className="px-6 py-4 border-b border-[var(--border-warm)] grid grid-cols-2 gap-y-3 gap-x-2">
        <Fact label="Exit score" value={exitScore ?? "—"} />
        <Fact label="Risk score" value={riskScore ?? "—"} />
        <Fact label="Connectors" value={detail.connectors.length} />
        <Fact label="Documents" value={docsLabel} />
        <Fact label="Joined" value={fmtDate(account.createdAt)} />
        <Fact label="Last seen" value={fmtDate(account.lastSignInAt)} />
      </div>

      {/* In-page section nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 mb-2 text-[10px] tracking-[0.08em] uppercase text-[var(--text-muted)] font-semibold">
          On this page
        </div>
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block px-3 py-2 text-sm rounded-sm text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--sidebar-active)] transition-colors"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Admin actions */}
      <div className="border-t border-[var(--border-warm)] px-4 py-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onToggleRole}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[var(--border-warm)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4" />
          {role === "superadmin" ? "Demote to user" : "Promote to superadmin"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReset}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[var(--border-warm)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" />
          Send password reset
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md bg-[#DC2626] text-white disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-2 text-sm rounded-md border border-[var(--border-warm)] text-[var(--text-secondary)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Delete user
          </button>
        )}
      </div>
    </aside>
  );
}

// --- Presentational helpers ------------------------------------------------

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-6">
      {children}
    </div>
  );
}

function Panel({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <SectionLabel>{title}</SectionLabel>
      <div className="card-light p-6 mt-3">{children}</div>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
      {entries.map(([k, v]) => (
        <Field key={k} label={humanize(k)} value={fmtVal(v)} />
      ))}
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

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-sm text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function FileList({
  label,
  files,
}: {
  label: string;
  files: AdminUserDetail["bankFiles"];
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-xs text-[var(--text-muted)] mb-1.5">{label}</div>
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-[var(--text-secondary)] truncate">
              {f.fileName}
            </span>
            <span className="text-xs text-[var(--text-muted)] shrink-0">
              {fmtSize(f.fileSize)} · {fmtDate(f.uploadedAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
