// Review queue for computed results, Super Admin only.
//
// Founders submit a run; nothing is published until someone here approves it.
// Every function below calls requireSuperadmin() first and then uses the
// service-role client, because the queue spans users and the review columns are
// deliberately not writable by the owner (see the migration's RLS notes).

import { createServerFn } from "@tanstack/react-start";
import {
  getServiceClient,
  logAdminAction,
  requireSuperadmin,
  type JsonObject,
} from "./server";
import {
  applyOverrides,
  isRequestTool,
  overrideDiff,
  TOOL_NAMES,
  TOOL_PATHS,
  type ReportOverrides,
  type RequestStatus,
  type RequestTool,
} from "@/lib/reportRequests";
import type { FullReport } from "@/lib/analytics";

interface AuthInput {
  accessToken: string;
}

/**
 * Emails live on the auth user, not on `profiles`, so they come from the admin
 * auth API rather than a join. One page of users covers the whole account base
 * at present; the map is keyed by id so a missing user simply reads as null.
 */
async function lookupEmails(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const db = getServiceClient();
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const wanted = new Set(ids);
  return new Map(
    (data?.users ?? [])
      .filter((u) => wanted.has(u.id) && u.email)
      .map((u) => [u.id, u.email as string]),
  );
}

export interface AdminRequestRow {
  id: string;
  tool: RequestTool;
  toolName: string;
  status: RequestStatus;
  businessId: string;
  businessName: string | null;
  ownerId: string;
  ownerEmail: string | null;
  createdAt: string;
  reviewedAt: string | null;
  notifiedAt: string | null;
  adminNote: string | null;
  // Carried as plain JSON: TanStack Start validates server-function returns as
  // serializable, and FullReport contains `unknown[]` members it can't prove.
  // The admin UI casts these back with `asReport` / `asOverrides` below.
  /** Present only on the detail fetch — the queue list omits it (it's large). */
  payload?: JsonObject;
  overrides?: JsonObject;
  /** Number of fields the current edit layer actually changes. */
  editCount: number;
}

// --- Queue ------------------------------------------------------------------

export const listReportRequestsFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput) => input)
  .handler(async ({ data }): Promise<AdminRequestRow[]> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: rows, error } = await db
      .from("report_requests")
      .select(
        "id, tool, status, business_id, owner_id, created_at, reviewed_at, notified_at, admin_note, payload, overrides",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const businessIds = [...new Set((rows ?? []).map((r) => r.business_id))];
    const ownerIds = [...new Set((rows ?? []).map((r) => r.owner_id))];

    const [{ data: businesses }, emailById] = await Promise.all([
      businessIds.length
        ? db.from("businesses").select("id, name").in("id", businessIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      lookupEmails(ownerIds),
    ]);

    const nameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));

    return (rows ?? [])
      .filter((r) => isRequestTool(r.tool))
      .map((r) => {
        const tool = r.tool as RequestTool;
        const payload = r.payload as FullReport;
        const overrides = (r.overrides ?? {}) as ReportOverrides;
        return {
          id: r.id,
          tool,
          toolName: TOOL_NAMES[tool],
          status: r.status as RequestStatus,
          businessId: r.business_id,
          businessName: nameById.get(r.business_id) ?? null,
          ownerId: r.owner_id,
          ownerEmail: emailById.get(r.owner_id) ?? null,
          createdAt: r.created_at,
          reviewedAt: r.reviewed_at,
          notifiedAt: r.notified_at,
          adminNote: r.admin_note,
          editCount: overrideDiff(payload, overrides).length,
        };
      });
  });

// --- One request, in full ---------------------------------------------------

export const getReportRequestFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput & { id: string }) => input)
  .handler(async ({ data }): Promise<AdminRequestRow> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: row, error } = await db
      .from("report_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || !isRequestTool(row.tool)) throw new Error("Request not found.");

    const [{ data: business }, emailById] = await Promise.all([
      db
        .from("businesses")
        .select("name")
        .eq("id", row.business_id)
        .maybeSingle(),
      lookupEmails([row.owner_id]),
    ]);

    const tool = row.tool as RequestTool;
    const payload = row.payload as FullReport;
    const overrides = (row.overrides ?? {}) as ReportOverrides;

    return {
      id: row.id,
      tool,
      toolName: TOOL_NAMES[tool],
      status: row.status as RequestStatus,
      businessId: row.business_id,
      businessName: business?.name ?? null,
      ownerId: row.owner_id,
      ownerEmail: emailById.get(row.owner_id) ?? null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      notifiedAt: row.notified_at,
      adminNote: row.admin_note,
      payload: payload as unknown as JsonObject,
      overrides: overrides as unknown as JsonObject,
      editCount: overrideDiff(payload, overrides).length,
    };
  });

// --- Save edits without deciding -------------------------------------------
// Lets a reviewer park a half-finished edit layer and come back to it.

export const saveRequestOverridesFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: AuthInput & { id: string; overrides: JsonObject }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId } = await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: row, error: readErr } = await db
      .from("report_requests")
      .select("status, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Request not found.");
    if (row.status !== "pending") {
      throw new Error("This request has already been reviewed.");
    }

    const { error } = await db
      .from("report_requests")
      .update({ overrides: data.overrides })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAdminAction(
      userId,
      "report_request.edited",
      { type: "report_request", id: data.id },
      {
        changes: overrideDiff(
          row.payload as FullReport,
          data.overrides as unknown as ReportOverrides,
        ),
      },
    );
    return { ok: true };
  });

// --- Approve / reject -------------------------------------------------------

export interface ReviewResult {
  status: RequestStatus;
  /** False when approval succeeded but the notification email did not send. */
  emailed: boolean;
  emailError: string | null;
}

export const reviewReportRequestFn = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: AuthInput & {
        id: string;
        decision: "approved" | "rejected";
        overrides?: JsonObject;
        note?: string;
      },
    ) => input,
  )
  .handler(async ({ data }): Promise<ReviewResult> => {
    const { userId } = await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: row, error: readErr } = await db
      .from("report_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row || !isRequestTool(row.tool)) throw new Error("Request not found.");
    // Guards a double-click and a second reviewer racing the first — without
    // it, an already-approved result could be published twice or flipped to
    // rejected after the founder was emailed.
    if (row.status !== "pending") {
      throw new Error("This request has already been reviewed.");
    }

    const tool = row.tool as RequestTool;
    const payload = row.payload as FullReport;
    const overrides = (data.overrides ??
      row.overrides ??
      {}) as unknown as ReportOverrides;
    const changes = overrideDiff(payload, overrides);

    if (data.decision === "rejected") {
      const { error } = await db
        .from("report_requests")
        .update({
          status: "rejected",
          overrides,
          admin_note: data.note?.trim() || null,
          reviewer_id: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);

      await logAdminAction(
        userId,
        "report_request.rejected",
        { type: "report_request", id: data.id },
        { tool, ownerId: row.owner_id, note: data.note ?? null },
      );
      return { status: "rejected", emailed: false, emailError: null };
    }

    // Approve: publish this tool's slice, then mark reviewed, then notify.
    const published = applyOverrides(payload, overrides);
    await publishToolResult(row.business_id, tool, published);

    const { error } = await db
      .from("report_requests")
      .update({
        status: "approved",
        overrides,
        admin_note: data.note?.trim() || null,
        reviewer_id: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAdminAction(
      userId,
      "report_request.approved",
      { type: "report_request", id: data.id },
      { tool, ownerId: row.owner_id, editCount: changes.length, changes },
    );

    // Email is best-effort: a mail failure must not leave an approved result
    // looking unapproved. The founder can already see it in the app.
    const email = await notifyOwner(row.owner_id, tool);
    if (email.ok) {
      await db
        .from("report_requests")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", data.id);
    }

    return {
      status: "approved",
      emailed: email.ok,
      emailError: email.ok ? null : email.error,
    };
  });

// --- Publishing -------------------------------------------------------------

/**
 * Write the approved result into the tables the app reads.
 *
 * Scoped to the approving tool ON PURPOSE. The payload holds the whole
 * computeFullReport output, but the four tools are approved independently — so
 * approving a valuation must not also publish an unreviewed risk register.
 * Neutral base metrics (revenue, AOV, repeat rate…) are written with every
 * approval: they're measurements of the store, not the output of a tool.
 */
async function publishToolResult(
  businessId: string,
  tool: RequestTool,
  report: FullReport,
) {
  const db = getServiceClient();
  const b = report.businessUpdate as Record<string, number | string | unknown>;
  const n = (key: string) => Number(b[key] ?? 0);

  const base: Record<string, unknown> = {
    business_id: businessId,
    revenue_ttm: n("revenueTTM"),
    revenue_monthly: b.revenueMonthly ?? [],
    ebitda: n("ebitda"),
    repeat_rate: n("repeatRate"),
    avg_order_value: n("avgOrderValue"),
    roas: n("roas"),
    top_product_share: n("topProductShare"),
  };

  const slice: Record<RequestTool, Record<string, unknown>> = {
    "exit-score": {
      exit_score: n("exitScore"),
      score_tier: b.scoreTier ?? "",
      score_breakdown: b.scoreBreakdown ?? [],
      data_confidence: n("dataConfidence"),
    },
    valuation: {
      valuation_low: n("valuationLow"),
      valuation_mid: n("valuationMid"),
      valuation_high: n("valuationHigh"),
      valuation_optimised: n("valuationOptimised"),
      current_multiple: n("currentMultiple"),
      optimised_multiple: n("optimisedMultiple"),
      quick_sale: n("quickSale"),
      fair_market: n("fairMarket"),
      optimised: n("optimised"),
      adjusted_earnings: n("adjustedEarnings"),
      value_gap: n("valueGap"),
    },
    risk: {
      risk_score: n("riskScore"),
      total_value_lost: n("totalValueLost"),
    },
    optimization: {},
  };

  const { error } = await db
    .from("valuation_data")
    .upsert({ ...base, ...slice[tool] }, { onConflict: "business_id" });
  if (error) throw new Error(error.message);

  if (tool === "risk") {
    await db.from("risks").delete().eq("business_id", businessId);
    if (report.risks.length > 0) {
      const { error: riskErr } = await db.from("risks").insert(
        report.risks.map((r) => ({
          business_id: businessId,
          title: r.title,
          severity: r.severity,
          description: r.description,
          impact: r.impact,
          buyer_sees: r.buyerSees,
          buyer_fears: r.buyerFears,
          buyer_does: r.buyerDoes,
          recommendation: r.recommendation,
        })),
      );
      if (riskErr) throw new Error(riskErr.message);
    }
  }

  if (tool === "optimization") {
    await db.from("actions").delete().eq("business_id", businessId);
    if (report.actions.length > 0) {
      const { error: actErr } = await db.from("actions").insert(
        report.actions.map((a) => ({
          business_id: businessId,
          title: a.title,
          priority: a.priority,
          uplift: a.uplift,
          time: a.time,
          problem: a.problem,
          steps: a.steps,
        })),
      );
      if (actErr) throw new Error(actErr.message);
    }
  }
}

// --- Notification -----------------------------------------------------------

/**
 * Ask the `notify-report-ready` Supabase Edge Function to email the founder.
 * The function owns the SMTP credentials; nothing about mail delivery lives in
 * this app's environment. Never throws — see the caller.
 */
async function notifyOwner(
  ownerId: string,
  tool: RequestTool,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = getServiceClient();

    const [{ data: authUser }, { data: profile }] = await Promise.all([
      db.auth.admin.getUserById(ownerId),
      db.from("profiles").select("full_name").eq("id", ownerId).maybeSingle(),
    ]);

    const email = authUser?.user?.email;
    if (!email) return { ok: false, error: "No email address on file." };

    const appUrl = (process.env.APP_URL || "https://dash.exitecom.com").replace(
      /\/+$/,
      "",
    );

    const { error } = await db.functions.invoke("notify-report-ready", {
      body: {
        email,
        name: profile?.full_name ?? null,
        toolName: TOOL_NAMES[tool],
        url: `${appUrl}${TOOL_PATHS[tool]}`,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Client-side casts ------------------------------------------------------
// The transport types above are plain JSON; these put the shapes back for the
// admin UI. Safe because the same code wrote them on the way out.

export const asReport = (v: JsonObject | undefined): FullReport =>
  v as unknown as FullReport;

export const asOverrides = (v: JsonObject | undefined): ReportOverrides =>
  (v ?? {}) as unknown as ReportOverrides;

export const asJson = (v: ReportOverrides): JsonObject =>
  v as unknown as JsonObject;
