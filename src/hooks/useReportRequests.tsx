import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { FullReport } from "@/lib/analytics";
import {
  REQUEST_TOOLS,
  isRequestTool,
  type ReportOverrides,
  type ReportRequest,
  type RequestStatus,
  type RequestTool,
} from "@/lib/reportRequests";

// Founder-side view of the approval queue.
//
// Reads `report_requests` with the ANON client — RLS restricts it to the
// caller's own rows, so no admin path is involved. Only two operations exist
// here: submit a run for review, and read the latest request per tool. Every
// review mutation (approve / reject / edit) is superadmin-only and lives in
// src/lib/admin/reportRequests.ts behind the service role.

type RequestRow = {
  id: string;
  business_id: string;
  owner_id: string;
  tool: string;
  status: string;
  payload: unknown;
  overrides: unknown;
  admin_note: string | null;
  reviewer_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  notified_at: string | null;
};

function mapRow(row: RequestRow): ReportRequest | null {
  if (!isRequestTool(row.tool)) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    ownerId: row.owner_id,
    tool: row.tool,
    status: (row.status as RequestStatus) ?? "pending",
    payload: row.payload as FullReport,
    overrides: (row.overrides as ReportOverrides) ?? {},
    adminNote: row.admin_note,
    reviewerId: row.reviewer_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    notifiedAt: row.notified_at,
  };
}

export type LatestByTool = Record<RequestTool, ReportRequest | null>;

const NONE: LatestByTool = {
  "exit-score": null,
  risk: null,
  valuation: null,
  optimization: null,
};

export function useReportRequests(businessId?: string) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReportRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("report_requests")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load report requests:", error);
      setRows([]);
    } else {
      setRows(
        ((data ?? []) as RequestRow[])
          .map(mapRow)
          .filter(Boolean) as ReportRequest[],
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Rows arrive newest-first, so the first hit per tool is the current one.
  const latest = useMemo(() => {
    const out: LatestByTool = { ...NONE };
    for (const row of rows) if (!out[row.tool]) out[row.tool] = row;
    return out;
  }, [rows]);

  /**
   * Submit a computed result for review. The payload is frozen at submit time
   * so the team approves exactly what they reviewed — a later Shopify sync
   * can't move the numbers under a pending request.
   */
  const submitTools = useCallback(
    async (tools: readonly RequestTool[], payload: FullReport) => {
      if (!isSupabaseConfigured || !user || !businessId) {
        throw new Error(
          "Connect your account before submitting a result for review.",
        );
      }
      const { error } = await supabase.from("report_requests").insert(
        tools.map((tool) => ({
          business_id: businessId,
          owner_id: user.id,
          tool,
          // status is left to the column default ('pending') — the insert
          // policy rejects anything else, so never send it from the client.
          payload,
        })),
      );
      if (error) throw error;
      await refresh();
    },
    [user, businessId, refresh],
  );

  const submit = useCallback(
    (tool: RequestTool, payload: FullReport) => submitTools([tool], payload),
    [submitTools],
  );

  /** One run, all four tools queued together (used by the Reports page). */
  const submitAll = useCallback(
    (payload: FullReport) => submitTools(REQUEST_TOOLS, payload),
    [submitTools],
  );

  return { requests: rows, latest, loading, refresh, submit, submitAll };
}
