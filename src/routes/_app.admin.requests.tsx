import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Check, X, Pencil, Undo2, Mail, MailX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { StatusBadge } from "@/components/ex/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { fmtGBP } from "@/lib/utils";
import {
  listReportRequestsFn,
  getReportRequestFn,
  reviewReportRequestFn,
  saveRequestOverridesFn,
  asReport,
  asOverrides,
  asJson,
  type AdminRequestRow,
} from "@/lib/admin/reportRequests";
import {
  overrideDiff,
  type ReportOverrides,
  type RequestStatus,
} from "@/lib/reportRequests";

export const Route = createFileRoute("/_app/admin/requests")({
  component: AdminRequests,
});

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// Reuse the shared badge's vocabulary: amber pending, green approved, red
// rejected.
const STATUS_BADGE: Record<RequestStatus, "pending" | "connected" | "high"> = {
  pending: "pending",
  approved: "connected",
  rejected: "high",
};

function AdminRequests() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [rows, setRows] = useState<AdminRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestStatus | "all">("pending");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listReportRequestsFn({ data: { accessToken } }));
    } catch {
      setError(
        "Could not load the review queue. Check that admin access is configured.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  if (openId) {
    return (
      <RequestDetail
        id={openId}
        accessToken={accessToken}
        onClose={() => setOpenId(null)}
        onReviewed={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Review Queue"
        subtitle="Every computed result waits here until someone approves it. Nothing reaches the founder unreviewed."
        right={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="btn-ghost-light text-sm"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        }
      />

      <div className="flex items-center gap-1 mb-6">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 text-xs rounded-sm capitalize transition-colors"
            style={{
              backgroundColor:
                filter === f ? "var(--sidebar-active)" : "transparent",
              color: filter === f ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {f}
            {f === "pending" && pendingCount > 0 && ` (${pendingCount})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="card-light p-6 text-sm text-[var(--risk-critical)]">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="card-light p-10 text-center text-sm text-[var(--text-muted)]">
          Loading…
        </div>
      )}

      {!error && !loading && visible.length === 0 && (
        <div className="card-light p-10 text-center">
          <p className="font-display text-xl">Nothing to review.</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {filter === "pending"
              ? "Every submitted result has been reviewed."
              : `No ${filter} requests.`}
          </p>
        </div>
      )}

      {!error && !loading && visible.length > 0 && (
        <div className="card-light divide-y divide-[var(--border-warm)]">
          {visible.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="w-full text-left p-5 hover:bg-[var(--sidebar-active)] transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg">{r.toolName}</span>
                  <StatusBadge status={STATUS_BADGE[r.status]}>
                    {r.status}
                  </StatusBadge>
                  {r.editCount > 0 && (
                    <span className="text-[11px] text-[var(--accent)] inline-flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> {r.editCount} edit
                      {r.editCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)] truncate">
                  {r.businessName ?? "Unnamed business"} ·{" "}
                  {r.ownerEmail ?? "no email"} · submitted{" "}
                  {fmtDateTime(r.createdAt)}
                </div>
              </div>
              {r.status === "approved" && (
                <span
                  title={
                    r.notifiedAt
                      ? `Emailed ${fmtDateTime(r.notifiedAt)}`
                      : "Approved, but the email did not send"
                  }
                  className="shrink-0"
                >
                  {r.notifiedAt ? (
                    <Mail className="w-4 h-4 text-[var(--positive)]" />
                  ) : (
                    <MailX className="w-4 h-4 text-[var(--risk-medium)]" />
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// --- Detail / editor --------------------------------------------------------

function RequestDetail({
  id,
  accessToken,
  onClose,
  onReviewed,
}: {
  id: string;
  accessToken: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [row, setRow] = useState<AdminRequestRow | null>(null);
  const [overrides, setOverrides] = useState<ReportOverrides>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReportRequestFn({ data: { accessToken, id } })
      .then((r) => {
        if (cancelled) return;
        setRow(r);
        setOverrides(asOverrides(r.overrides));
        setNote(r.adminNote ?? "");
      })
      .catch(() => !cancelled && setError("Could not load this request."));
    return () => {
      cancelled = true;
    };
  }, [accessToken, id]);

  const report = row?.payload ? asReport(row.payload) : null;
  const diff = report ? overrideDiff(report, overrides) : [];
  const decided = row ? row.status !== "pending" : false;

  const patchScore = (key: string, value: number | string | undefined) =>
    setOverrides((o) => ({ ...o, score: { ...o.score, [key]: value } }));
  const patchValuation = (key: string, value: number | undefined) =>
    setOverrides((o) => ({
      ...o,
      valuation: { ...o.valuation, [key]: value },
    }));
  const patchRisk = (i: number, key: string, value: unknown) =>
    setOverrides((o) => ({
      ...o,
      risks: { ...o.risks, [i]: { ...o.risks?.[String(i)], [key]: value } },
    }));
  const patchAction = (i: number, key: string, value: unknown) =>
    setOverrides((o) => ({
      ...o,
      actions: {
        ...o.actions,
        [i]: { ...o.actions?.[String(i)], [key]: value },
      },
    }));

  const saveDraft = async () => {
    setBusy(true);
    try {
      await saveRequestOverridesFn({
        data: { accessToken, id, overrides: asJson(overrides) },
      });
      toast.success(
        "Edits saved. The founder still sees nothing until you approve.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save edits.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !note.trim()) {
      toast.error("Add a note — the founder sees this as the reason.");
      return;
    }
    setBusy(true);
    try {
      const result = await reviewReportRequestFn({
        data: { accessToken, id, decision, overrides: asJson(overrides), note },
      });
      if (decision === "approved") {
        toast.success(
          result.emailed
            ? "Approved and the founder has been emailed."
            : "Approved — but the email didn't send. They can still see it in the app.",
        );
        if (!result.emailed && result.emailError) {
          console.warn("[admin] notification failed:", result.emailError);
        }
      } else {
        toast.success("Rejected. The founder will see your note.");
      }
      onReviewed();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save decision.",
      );
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="card-light p-8">
        <p className="text-sm text-[var(--risk-critical)]">{error}</p>
        <button onClick={onClose} className="btn-ghost-light text-sm mt-4">
          Back to queue
        </button>
      </div>
    );
  }

  if (!row || !report) {
    return (
      <div className="card-light p-10 text-center text-sm text-[var(--text-muted)]">
        Loading request…
      </div>
    );
  }

  return (
    <>
      <button onClick={onClose} className="btn-ghost-light text-xs mb-5">
        ← Back to queue
      </button>

      <PageHeader
        title={row.toolName}
        subtitle={`${row.businessName ?? "Unnamed business"} · ${row.ownerEmail ?? "no email"} · submitted ${fmtDateTime(row.createdAt)}`}
        right={
          <StatusBadge status={STATUS_BADGE[row.status]}>
            {row.status}
          </StatusBadge>
        }
      />

      {decided && (
        <div className="card-light p-5 mb-6 text-sm">
          Reviewed {fmtDateTime(row.reviewedAt)}.{" "}
          {row.status === "approved"
            ? row.notifiedAt
              ? `Founder emailed ${fmtDateTime(row.notifiedAt)}.`
              : "The notification email did not send."
            : ""}
          {row.adminNote && (
            <div className="mt-2 text-[var(--text-secondary)]">
              Note: {row.adminNote}
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            A reviewed request is read-only. If this needs to change, ask the
            founder to run the tool again.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        <div className="space-y-6">
          <EditGroup title="Exit Score">
            <NumberField
              label="Exit score"
              original={report.score.exitScore}
              value={overrides.score?.exitScore}
              onChange={(v) => patchScore("exitScore", v)}
              disabled={decided}
            />
            <TextField
              label="Score tier"
              original={report.score.scoreTier}
              value={overrides.score?.scoreTier}
              onChange={(v) => patchScore("scoreTier", v)}
              disabled={decided}
            />
            <NumberField
              label="Data confidence"
              original={report.score.dataConfidence}
              value={overrides.score?.dataConfidence}
              onChange={(v) => patchScore("dataConfidence", v)}
              disabled={decided}
            />
          </EditGroup>

          <EditGroup title="Valuation">
            {(
              [
                ["adjustedEarnings", "Adjusted earnings"],
                ["currentMultiple", "Current multiple"],
                ["optimisedMultiple", "Achievable multiple"],
                ["valuationLow", "Valuation low"],
                ["valuationMid", "Valuation mid"],
                ["valuationHigh", "Valuation high"],
                ["quickSale", "Quick sale"],
                ["fairMarket", "Fair market"],
                ["optimised", "Optimised"],
                ["valueGap", "Value gap"],
              ] as const
            ).map(([key, label]) => (
              <NumberField
                key={key}
                label={label}
                original={report.valuation[key]}
                value={overrides.valuation?.[key]}
                onChange={(v) => patchValuation(key, v)}
                disabled={decided}
              />
            ))}
          </EditGroup>

          <EditGroup title={`Risks (${report.risks.length})`}>
            {report.risks.map((r, i) => {
              const patch = overrides.risks?.[String(i)] ?? {};
              return (
                <ItemEditor
                  key={i}
                  index={i}
                  title={patch.title ?? r.title}
                  hidden={!!patch.hidden}
                  onHiddenChange={(v) => patchRisk(i, "hidden", v)}
                  disabled={decided}
                  meta={`${patch.severity ?? r.severity} · ${fmtGBP(patch.impact ?? r.impact)} impact`}
                >
                  <TextField
                    label="Title"
                    original={r.title}
                    value={patch.title}
                    onChange={(v) => patchRisk(i, "title", v)}
                    disabled={decided}
                  />
                  <SelectField
                    label="Severity"
                    original={r.severity}
                    value={patch.severity}
                    options={["high", "medium", "low"]}
                    onChange={(v) => patchRisk(i, "severity", v)}
                    disabled={decided}
                  />
                  <NumberField
                    label="Impact"
                    original={r.impact}
                    value={patch.impact}
                    onChange={(v) => patchRisk(i, "impact", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="Description"
                    original={r.description}
                    value={patch.description}
                    onChange={(v) => patchRisk(i, "description", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="What a buyer sees"
                    original={r.buyerSees ?? ""}
                    value={patch.buyerSees}
                    onChange={(v) => patchRisk(i, "buyerSees", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="What they fear"
                    original={r.buyerFears ?? ""}
                    value={patch.buyerFears}
                    onChange={(v) => patchRisk(i, "buyerFears", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="What they do"
                    original={r.buyerDoes ?? ""}
                    value={patch.buyerDoes}
                    onChange={(v) => patchRisk(i, "buyerDoes", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="Recommendation"
                    original={r.recommendation ?? ""}
                    value={patch.recommendation}
                    onChange={(v) => patchRisk(i, "recommendation", v)}
                    disabled={decided}
                  />
                </ItemEditor>
              );
            })}
          </EditGroup>

          <EditGroup title={`Actions (${report.actions.length})`}>
            {report.actions.map((a, i) => {
              const patch = overrides.actions?.[String(i)] ?? {};
              return (
                <ItemEditor
                  key={i}
                  index={i}
                  title={patch.title ?? a.title}
                  hidden={!!patch.hidden}
                  onHiddenChange={(v) => patchAction(i, "hidden", v)}
                  disabled={decided}
                  meta={`${patch.priority ?? a.priority} · +${fmtGBP(patch.uplift ?? a.uplift)} · ${patch.time ?? a.time}`}
                >
                  <TextField
                    label="Title"
                    original={a.title}
                    value={patch.title}
                    onChange={(v) => patchAction(i, "title", v)}
                    disabled={decided}
                  />
                  <SelectField
                    label="Priority"
                    original={a.priority}
                    value={patch.priority}
                    options={["high", "medium", "low"]}
                    onChange={(v) => patchAction(i, "priority", v)}
                    disabled={decided}
                  />
                  <NumberField
                    label="Uplift"
                    original={a.uplift}
                    value={patch.uplift}
                    onChange={(v) => patchAction(i, "uplift", v)}
                    disabled={decided}
                  />
                  <TextField
                    label="Time"
                    original={a.time}
                    value={patch.time}
                    onChange={(v) => patchAction(i, "time", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="Problem"
                    original={a.problem}
                    value={patch.problem}
                    onChange={(v) => patchAction(i, "problem", v)}
                    disabled={decided}
                  />
                  <AreaField
                    label="Steps (one per line)"
                    original={a.steps.join("\n")}
                    value={patch.steps?.join("\n")}
                    onChange={(v) =>
                      patchAction(
                        i,
                        "steps",
                        v === undefined
                          ? undefined
                          : v
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                      )
                    }
                    disabled={decided}
                  />
                </ItemEditor>
              );
            })}
          </EditGroup>
        </div>

        {/* Decision panel */}
        <div className="space-y-6 lg:sticky lg:top-6">
          <div className="card-light p-6">
            <div className="label-caps" style={{ fontSize: 10 }}>
              Changes ({diff.length})
            </div>
            {diff.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Nothing edited — this publishes exactly what the engine
                computed.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {diff.map((d) => (
                  <li key={d.path} className="text-xs">
                    <div className="text-[var(--text-primary)]">{d.label}</div>
                    <div className="text-[var(--text-muted)]">
                      <span className="line-through">{d.from}</span> → {d.to}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!decided && (
            <div className="card-light p-6 space-y-4">
              <label className="block">
                <span className="label-caps" style={{ fontSize: 10 }}>
                  Note
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Required when rejecting — the founder reads this."
                  className="mt-2 w-full bg-transparent border border-[var(--border-warm)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </label>

              <button
                onClick={() => void decide("approved")}
                disabled={busy}
                className="btn-primary w-full justify-center text-sm disabled:opacity-60"
              >
                <Check className="w-4 h-4" /> Approve &amp; notify
              </button>
              <button
                onClick={() => void decide("rejected")}
                disabled={busy}
                className="w-full justify-center inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm border border-[var(--risk-critical)] text-[var(--risk-critical)] hover:bg-[var(--risk-critical)]/5 disabled:opacity-60"
              >
                <X className="w-4 h-4" /> Reject
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void saveDraft()}
                  disabled={busy}
                  className="btn-ghost-light text-xs flex-1 justify-center"
                >
                  Save edits
                </button>
                <button
                  onClick={() => setOverrides({})}
                  disabled={busy || diff.length === 0}
                  className="btn-ghost-light text-xs flex-1 justify-center disabled:opacity-40"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Approving publishes this result and emails the founder. Every
                edit is recorded in the audit log against the engine's original.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// --- Field primitives -------------------------------------------------------
//
// Each field shows the engine's value as the placeholder and holds the override
// only when the admin actually types something. Clearing a field clears the
// override rather than writing an empty value, so "unedited" and "edited to
// blank" stay distinguishable.

function EditGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-light p-6">
      <div className="label-caps" style={{ fontSize: 10 }}>
        {title}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function FieldShell({
  label,
  edited,
  onReset,
  children,
}: {
  label: string;
  edited: boolean;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2">
        <span className="label-caps" style={{ fontSize: 10 }}>
          {label}
        </span>
        {edited && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-[var(--accent)] hover:underline"
          >
            revert
          </button>
        )}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full bg-transparent border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-50";

function NumberField({
  label,
  original,
  value,
  onChange,
  disabled,
}: {
  label: string;
  original: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  disabled?: boolean;
}) {
  const edited = value !== undefined;
  return (
    <FieldShell
      label={label}
      edited={edited}
      onReset={() => onChange(undefined)}
    >
      <input
        type="number"
        disabled={disabled}
        value={value ?? ""}
        placeholder={String(original)}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        className={inputClass}
        style={{
          borderColor: edited ? "var(--accent)" : "var(--border-warm)",
        }}
      />
    </FieldShell>
  );
}

function TextField({
  label,
  original,
  value,
  onChange,
  disabled,
}: {
  label: string;
  original: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const edited = value !== undefined;
  return (
    <FieldShell
      label={label}
      edited={edited}
      onReset={() => onChange(undefined)}
    >
      <input
        disabled={disabled}
        value={value ?? ""}
        placeholder={original}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : e.target.value)
        }
        className={inputClass}
        style={{ borderColor: edited ? "var(--accent)" : "var(--border-warm)" }}
      />
    </FieldShell>
  );
}

function AreaField({
  label,
  original,
  value,
  onChange,
  disabled,
}: {
  label: string;
  original: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const edited = value !== undefined;
  return (
    <FieldShell
      label={label}
      edited={edited}
      onReset={() => onChange(undefined)}
    >
      <textarea
        disabled={disabled}
        rows={2}
        value={value ?? ""}
        placeholder={original || "—"}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : e.target.value)
        }
        className={inputClass}
        style={{ borderColor: edited ? "var(--accent)" : "var(--border-warm)" }}
      />
    </FieldShell>
  );
}

function SelectField({
  label,
  original,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  original: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const edited = value !== undefined;
  return (
    <FieldShell
      label={label}
      edited={edited}
      onReset={() => onChange(undefined)}
    >
      <select
        disabled={disabled}
        value={value ?? original}
        onChange={(e) =>
          onChange(e.target.value === original ? undefined : e.target.value)
        }
        className={inputClass}
        style={{ borderColor: edited ? "var(--accent)" : "var(--border-warm)" }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function ItemEditor({
  index,
  title,
  meta,
  hidden,
  onHiddenChange,
  disabled,
  children,
}: {
  index: number;
  title: string;
  meta: string;
  hidden: boolean;
  onHiddenChange: (v: boolean | undefined) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-[var(--border-warm)] rounded-md"
      style={{ opacity: hidden ? 0.5 : 1 }}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left min-w-0"
        >
          <div className="text-sm truncate">
            {index + 1}. {title}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">{meta}</div>
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] shrink-0">
          <input
            type="checkbox"
            disabled={disabled}
            checked={hidden}
            onChange={(e) => onHiddenChange(e.target.checked || undefined)}
          />
          Hide
        </label>
      </div>
      {open && <div className="p-3 pt-0 space-y-3">{children}</div>}
    </div>
  );
}
