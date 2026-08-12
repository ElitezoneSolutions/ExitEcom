import type { FullReport } from "@/lib/analytics";
import type { ReportTypeId } from "@/lib/reportSections";

// ---------------------------------------------------------------------------
// Report approval requests.
//
// Running a tool no longer publishes its result. It creates a `report_requests`
// row in 'pending'; the team reviews it in /admin/requests and, on approval, the
// (possibly edited) result is written to valuation_data / risks / actions and
// the founder is emailed. Until then the founder sees a processing state.
//
// This module holds everything BOTH sides need — the shared types and the pure
// override logic — so the founder-facing pages, the admin server functions and
// the tests all agree on what "approved with edits" means. No I/O here.
// ---------------------------------------------------------------------------

/**
 * The tools that are approved independently. Deliberately not `ReportTypeId`:
 * the Full Report isn't a tool the founder runs, it's a view over the four, so
 * it is never itself submitted for approval.
 */
export const REQUEST_TOOLS = [
  "exit-score",
  "risk",
  "valuation",
  "optimization",
] as const;

export type RequestTool = (typeof REQUEST_TOOLS)[number];
export type RequestStatus = "pending" | "approved" | "rejected";

export const TOOL_NAMES: Record<RequestTool, string> = {
  "exit-score": "Exit Readiness Score",
  risk: "Risk Scanner",
  valuation: "Valuation Engine",
  optimization: "Optimization Plan",
};

/** The route a founder reads each result on, used in the approval email. */
export const TOOL_PATHS: Record<RequestTool, string> = {
  "exit-score": "/exit-score",
  risk: "/risk-scanner",
  valuation: "/valuation",
  optimization: "/optimization",
};

export function isRequestTool(value: unknown): value is RequestTool {
  return (
    typeof value === "string" && REQUEST_TOOLS.includes(value as RequestTool)
  );
}

/**
 * Which approvals a report document depends on. The four tool reports need
 * their own tool signed off; the Full Report contains all four, so it stays
 * locked until every one of them is approved — otherwise it would hand a buyer
 * a document containing an unreviewed risk register.
 */
export function toolsForReport(id: ReportTypeId): RequestTool[] {
  return id === "full" ? [...REQUEST_TOOLS] : [id as RequestTool];
}

// --- The override layer -----------------------------------------------------
//
// An admin may edit anything before approving. Rather than mutating the frozen
// payload, edits are stored as a sparse patch: only fields the admin actually
// changed appear. That keeps three things true at once —
//
//   1. the engine's original output is always recoverable for audit,
//   2. a diff of "what the engine said" vs "what was published" is trivial,
//   3. an untouched request publishes byte-identical deterministic output.
//
// Arrays are patched by INDEX against the payload's array, so a risk can be
// edited without restating the others. Overriding an array item's fields never
// reorders, adds or removes items; only `hidden` suppresses one.

export interface RiskOverride {
  title?: string;
  description?: string;
  severity?: "high" | "medium" | "low";
  impact?: number;
  buyerSees?: string;
  buyerFears?: string;
  buyerDoes?: string;
  recommendation?: string;
  /** Drop this risk from the published result entirely. */
  hidden?: boolean;
}

export interface ActionOverride {
  title?: string;
  problem?: string;
  priority?: "high" | "medium" | "low";
  uplift?: number;
  time?: string;
  steps?: string[];
  hidden?: boolean;
}

export interface ScoreOverride {
  exitScore?: number;
  scoreTier?: string;
  dataConfidence?: number;
}

export interface ValuationOverride {
  adjustedEarnings?: number;
  currentMultiple?: number;
  optimisedMultiple?: number;
  valuationLow?: number;
  valuationMid?: number;
  valuationHigh?: number;
  valuationOptimised?: number;
  quickSale?: number;
  fairMarket?: number;
  optimised?: number;
  valueGap?: number;
}

export interface ReportOverrides {
  score?: ScoreOverride;
  valuation?: ValuationOverride;
  /** Keyed by the item's index in `payload.risks`. */
  risks?: Record<string, RiskOverride>;
  /** Keyed by the item's index in `payload.actions`. */
  actions?: Record<string, ActionOverride>;
}

/** One admin edit, for the audit log and the "what changed" view. */
export interface OverrideDiff {
  path: string;
  label: string;
  from: string;
  to: string;
}

export interface ReportRequest {
  id: string;
  businessId: string;
  ownerId: string;
  tool: RequestTool;
  status: RequestStatus;
  payload: FullReport;
  overrides: ReportOverrides;
  adminNote: string | null;
  reviewerId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  notifiedAt: string | null;
}

/** Drop keys whose value is undefined so a patch stays genuinely sparse. */
function defined<T extends object>(patch: T | undefined): Partial<T> {
  if (!patch) return {};
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * The published result: the frozen engine payload with the admin's edits laid
 * over it. Pure — same inputs, same output — and never mutates either argument.
 *
 * Hidden risks/actions are removed rather than blanked, so a suppressed item
 * can't leak as an empty row in a document that goes to a buyer.
 */
export function applyOverrides(
  payload: FullReport,
  overrides: ReportOverrides | null | undefined,
): FullReport {
  const o = overrides ?? {};

  const score = { ...payload.score, ...defined(o.score) };
  const valuation = { ...payload.valuation, ...defined(o.valuation) };

  const risks = payload.risks
    .map((risk, i) => ({ ...risk, ...defined(o.risks?.[String(i)]) }))
    .filter((r) => !("hidden" in r && r.hidden))
    .map(({ ...rest }) => {
      delete (rest as { hidden?: boolean }).hidden;
      return rest;
    });

  const actions = payload.actions
    .map((action, i) => ({ ...action, ...defined(o.actions?.[String(i)]) }))
    .filter((a) => !("hidden" in a && a.hidden))
    .map(({ ...rest }) => {
      delete (rest as { hidden?: boolean }).hidden;
      return rest;
    });

  // businessUpdate is what gets persisted to valuation_data and read back by
  // every page, so score/valuation edits have to flow into it too — otherwise
  // an admin could correct the exit score and the dashboard would keep showing
  // the engine's original.
  const businessUpdate = {
    ...payload.businessUpdate,
    ...(o.score?.exitScore !== undefined ? { exitScore: score.exitScore } : {}),
    ...(o.score?.scoreTier !== undefined ? { scoreTier: score.scoreTier } : {}),
    ...(o.valuation
      ? {
          adjustedEarnings: valuation.adjustedEarnings,
          currentMultiple: valuation.currentMultiple,
          optimisedMultiple: valuation.optimisedMultiple,
          valuationLow: valuation.valuationLow,
          valuationMid: valuation.valuationMid,
          valuationHigh: valuation.valuationHigh,
          valuationOptimised: valuation.valuationOptimised,
          quickSale: valuation.quickSale,
          fairMarket: valuation.fairMarket,
          optimised: valuation.optimised,
          valueGap: valuation.valueGap,
        }
      : {}),
  };

  return { ...payload, score, valuation, risks, actions, businessUpdate };
}

/**
 * True when an edit layer carries anything at all. This is a cheap structural
 * check for callers that have no payload to hand; use `overrideDiff` when you
 * need to know whether the edits actually changed any value.
 */
export function hasOverrides(overrides: ReportOverrides | null | undefined) {
  const o = overrides ?? {};
  return (
    Object.keys(o.score ?? {}).length > 0 ||
    Object.keys(o.valuation ?? {}).length > 0 ||
    Object.values(o.risks ?? {}).some((p) => Object.keys(p).length > 0) ||
    Object.values(o.actions ?? {}).some((p) => Object.keys(p).length > 0)
  );
}

const SCORE_LABELS: Record<string, string> = {
  exitScore: "Exit score",
  scoreTier: "Score tier",
  dataConfidence: "Data confidence",
};

const VALUATION_LABELS: Record<string, string> = {
  adjustedEarnings: "Adjusted earnings",
  currentMultiple: "Current multiple",
  optimisedMultiple: "Achievable multiple",
  valuationLow: "Valuation low",
  valuationMid: "Valuation mid",
  valuationHigh: "Valuation high",
  valuationOptimised: "Optimised valuation",
  quickSale: "Quick sale",
  fairMarket: "Fair market",
  optimised: "Optimised",
  valueGap: "Value gap",
};

const show = (v: unknown) =>
  v === undefined || v === null
    ? "—"
    : Array.isArray(v)
      ? `${v.length} item(s)`
      : String(v);

/**
 * Every field the admin changed, as before/after pairs. Drives the "what
 * changed" panel in the admin UI and the metadata written to admin_audit_log,
 * so an approval is never a black box.
 *
 * A patch value equal to the payload's value is not a change and is skipped —
 * touching a field and typing the same thing back shouldn't read as an edit.
 */
export function overrideDiff(
  payload: FullReport,
  overrides: ReportOverrides | null | undefined,
): OverrideDiff[] {
  const o = overrides ?? {};
  const out: OverrideDiff[] = [];

  const push = (
    path: string,
    label: string,
    from: unknown,
    to: unknown,
  ): void => {
    if (to === undefined) return;
    if (show(from) === show(to)) return;
    out.push({ path, label, from: show(from), to: show(to) });
  };

  for (const [key, value] of Object.entries(o.score ?? {})) {
    push(
      `score.${key}`,
      SCORE_LABELS[key] ?? key,
      payload.score?.[key as keyof typeof payload.score],
      value,
    );
  }

  for (const [key, value] of Object.entries(o.valuation ?? {})) {
    push(
      `valuation.${key}`,
      VALUATION_LABELS[key] ?? key,
      payload.valuation?.[key as keyof typeof payload.valuation],
      value,
    );
  }

  for (const [index, patch] of Object.entries(o.risks ?? {})) {
    const original = payload.risks?.[Number(index)];
    const name = original?.title ?? `Risk ${Number(index) + 1}`;
    for (const [key, value] of Object.entries(patch)) {
      if (key === "hidden") {
        if (value)
          out.push({
            path: `risks.${index}.hidden`,
            label: `${name} — removed`,
            from: "shown",
            to: "hidden",
          });
        continue;
      }
      push(
        `risks.${index}.${key}`,
        `${name} — ${key}`,
        original?.[key as keyof typeof original],
        value,
      );
    }
  }

  for (const [index, patch] of Object.entries(o.actions ?? {})) {
    const original = payload.actions?.[Number(index)];
    const name = original?.title ?? `Action ${Number(index) + 1}`;
    for (const [key, value] of Object.entries(patch)) {
      if (key === "hidden") {
        if (value)
          out.push({
            path: `actions.${index}.hidden`,
            label: `${name} — removed`,
            from: "shown",
            to: "hidden",
          });
        continue;
      }
      push(
        `actions.${index}.${key}`,
        `${name} — ${key}`,
        original?.[key as keyof typeof original],
        value,
      );
    }
  }

  return out;
}
