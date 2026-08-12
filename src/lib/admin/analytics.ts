// Platform-analytics and audit-log server functions for the Super Admin
// Dashboard. All figures are computed by deterministic aggregation here — never
// routed through an LLM (per the project's deterministic-numbers rule). Every
// function is superadmin-gated and uses the service-role client.

import { createServerFn } from "@tanstack/react-start";
import { getServiceClient, requireSuperadmin, type JsonObject } from "./server";

interface AuthInput {
  accessToken: string;
}

export interface PlatformStats {
  totalUsers: number;
  usersWithBusiness: number;
  totalBusinesses: number;
  totalDocuments: number;
  signupTrend: { month: string; count: number }[];
  connectorAdoption: { source: string; count: number }[];
  scoreDistribution: { band: string; count: number }[];
  /**
   * The work actually waiting on the team. Results now sit unpublished until
   * someone approves them, so a queue nobody is watching is a founder staring
   * at "we're processing your request" indefinitely — that belongs at the top of
   * the overview, not behind a tab.
   */
  queue: QueueStats;
}

export interface QueueStats {
  pendingRequests: number;
  /** Hours the longest-waiting request has been pending; null when none are. */
  oldestPendingHours: number | null;
  pendingByTool: { tool: string; label: string; count: number }[];
  approvedLast7Days: number;
  rejectedLast7Days: number;
  /** Approved but the notification email never sent — needs a manual nudge. */
  notifyFailures: number;
  /** Uploaded documents still awaiting a verification decision. */
  pendingDocuments: number;
}

const SOURCE_LABEL: Record<string, string> = {
  shopify: "Shopify",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  tiktok_ads: "TikTok Ads",
  snapchat_ads: "Snapchat Ads",
  ga4: "Google Analytics 4",
};

// Mirrors TOOL_NAMES in src/lib/reportRequests.ts. Duplicated rather than
// imported so this server module stays free of client-side imports.
const TOOL_LABEL: Record<string, string> = {
  "exit-score": "Exit Readiness Score",
  risk: "Risk Scanner",
  valuation: "Valuation Engine",
  optimization: "Optimization Plan",
};

const SCORE_BANDS = [
  { band: "0–39", min: 0, max: 39 },
  { band: "40–59", min: 40, max: 59 },
  { band: "60–74", min: 60, max: 74 },
  { band: "75–89", min: 75, max: 89 },
  { band: "90–100", min: 90, max: 100 },
];

export const getPlatformStatsFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput) => input)
  .handler(async ({ data }): Promise<PlatformStats> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: authData } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const users = authData?.users ?? [];

    const [
      { data: businesses },
      { data: valuations },
      { count: bankCount },
      { count: plCount },
      { data: requests },
      { data: reviews },
    ] = await Promise.all([
      db.from("businesses").select("owner_id"),
      db.from("valuation_data").select("exit_score, connected_sources"),
      db
        .from("bank_statement_files")
        .select("id", { count: "exact", head: true }),
      db.from("pl_files").select("id", { count: "exact", head: true }),
      db
        .from("report_requests")
        .select("tool, status, created_at, reviewed_at, notified_at"),
      db.from("document_reviews").select("status"),
    ]);

    const ownersWithBusiness = new Set(
      (businesses ?? []).map((b) => b.owner_id as string),
    );

    // Signup trend: count users per YYYY-MM of created_at.
    const trendMap = new Map<string, number>();
    for (const u of users) {
      if (!u.created_at) continue;
      const month = u.created_at.slice(0, 7);
      trendMap.set(month, (trendMap.get(month) ?? 0) + 1);
    }
    const signupTrend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // Connector adoption: count businesses listing each source as connected.
    const adoptionMap = new Map<string, number>();
    for (const v of valuations ?? []) {
      for (const s of (v.connected_sources as string[]) ?? []) {
        adoptionMap.set(s, (adoptionMap.get(s) ?? 0) + 1);
      }
    }
    const connectorAdoption = [...adoptionMap.entries()]
      .map(([source, count]) => ({
        source: SOURCE_LABEL[source] ?? source,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Exit-score distribution into fixed bands.
    const scoreDistribution = SCORE_BANDS.map((b) => ({
      band: b.band,
      count: (valuations ?? []).filter((v) => {
        const s = Number(v.exit_score ?? 0);
        return s >= b.min && s <= b.max;
      }).length,
    }));

    // --- Queue ---------------------------------------------------------------
    const rows = requests ?? [];
    const pending = rows.filter((r) => r.status === "pending");

    const pendingToolMap = new Map<string, number>();
    for (const r of pending) {
      const tool = r.tool as string;
      pendingToolMap.set(tool, (pendingToolMap.get(tool) ?? 0) + 1);
    }

    const now = Date.now();
    const oldest = pending.reduce<number | null>((acc, r) => {
      const at = new Date(r.created_at as string).getTime();
      return acc === null || at < acc ? at : acc;
    }, null);

    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const reviewedSince = (status: string) =>
      rows.filter(
        (r) =>
          r.status === status &&
          r.reviewed_at &&
          new Date(r.reviewed_at as string).getTime() >= sevenDaysAgo,
      ).length;

    const queue: QueueStats = {
      pendingRequests: pending.length,
      oldestPendingHours:
        oldest === null ? null : Math.floor((now - oldest) / 3_600_000),
      pendingByTool: [...pendingToolMap.entries()]
        .map(([tool, count]) => ({
          tool,
          label: TOOL_LABEL[tool] ?? tool,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      approvedLast7Days: reviewedSince("approved"),
      rejectedLast7Days: reviewedSince("rejected"),
      notifyFailures: rows.filter(
        (r) => r.status === "approved" && !r.notified_at,
      ).length,
      pendingDocuments: (reviews ?? []).filter((r) => r.status === "pending")
        .length,
    };

    return {
      queue,
      totalUsers: users.length,
      usersWithBusiness: ownersWithBusiness.size,
      totalBusinesses: businesses?.length ?? 0,
      totalDocuments: (bankCount ?? 0) + (plCount ?? 0),
      signupTrend,
      connectorAdoption,
      scoreDistribution,
    };
  });

// --- Pending count ---------------------------------------------------------
// Deliberately its own tiny query rather than reusing getPlatformStatsFn: the
// admin shell renders it on every admin page, and the full stats call scans
// users, businesses, valuations and documents.

export const getPendingCountFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput) => input)
  .handler(async ({ data }): Promise<{ pending: number }> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();
    const { count } = await db
      .from("report_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return { pending: count ?? 0 };
  });

// --- Audit log -------------------------------------------------------------
export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: JsonObject;
  createdAt: string;
}

export const getAuditLogFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput) => input)
  .handler(async ({ data }): Promise<AuditLogRow[]> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: log, error } = await db
      .from("admin_audit_log")
      .select(
        "id, actor_id, action, target_type, target_id, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Could not load the audit log.");

    const { data: authData } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const emailById = new Map(
      (authData?.users ?? []).map((u) => [u.id, u.email ?? null]),
    );

    return (log ?? []).map((r) => ({
      id: r.id as string,
      actorId: (r.actor_id as string) ?? null,
      actorEmail: r.actor_id
        ? (emailById.get(r.actor_id as string) ?? null)
        : null,
      action: r.action as string,
      targetType: (r.target_type as string) ?? null,
      targetId: (r.target_id as string) ?? null,
      metadata: (r.metadata as JsonObject) ?? {},
      createdAt: r.created_at as string,
    }));
  });
