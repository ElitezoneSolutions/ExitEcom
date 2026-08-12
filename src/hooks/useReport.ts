import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useBusinessData } from "./useBusinessData";
import { useReportRequests } from "./useReportRequests";
import {
  computeFullReport,
  type AnalyticsInput,
  type FullReport,
} from "@/lib/analytics";
import {
  applyOverrides,
  type ReportRequest,
  type RequestTool,
} from "@/lib/reportRequests";

// Shared logic for the on-demand tool pages (Exit Score, Risk Scanner,
// Valuation, Optimization).
//
// Results go through admin approval. Clicking "Run" computes the report and
// submits it for review — it does NOT publish anything. What the founder sees
// afterwards is the APPROVED snapshot (the engine's payload with any admin
// edits applied), not a fresh computation, so the page shows exactly what was
// signed off rather than something that may have moved since.
//
// Pass the tool this page represents; the four are approved independently.
// Called with no argument (the Reports page) it exposes the per-tool helpers
// instead of a single report.

export type RunState = "none" | "pending" | "approved" | "rejected";

export function useReport(tool?: RequestTool) {
  const bd = useBusinessData();
  const {
    store,
    orders,
    products,
    customers,
    business,
    metaMonthly,
    metaCampaigns,
    googleMonthly,
    googleCampaigns,
    tikTokMonthly,
    tikTokCampaigns,
    snapchatMonthly,
    snapchatCampaigns,
    ga4Monthly,
    ga4Channels,
    bankStatementFiles,
    plFiles,
  } = bd;

  const requests = useReportRequests(business.id);
  const [computing, setComputing] = useState(false);

  const input: AnalyticsInput = useMemo(
    () => ({
      store: store
        ? {
            name: store.name,
            currency: store.currency,
            country: store.country,
            shopCreatedAt: store.shopCreatedAt,
          }
        : null,
      orders,
      products,
      customers,
      industry: business.industry || "E-commerce",
      // Raw Meta/Google arrays are structurally compatible with AnalyticsAdsFeed.
      // Only supply a feed when that platform is connected.
      meta:
        metaMonthly.length > 0
          ? { monthly: metaMonthly, campaigns: metaCampaigns }
          : null,
      google:
        googleMonthly.length > 0
          ? { monthly: googleMonthly, campaigns: googleCampaigns }
          : null,
      tiktok:
        tikTokMonthly.length > 0
          ? { monthly: tikTokMonthly, campaigns: tikTokCampaigns }
          : null,
      // Snapchat exposes conversion value only at campaign level (never per
      // month), so pass the campaign-summed total as conversionValueTotal —
      // otherwise the engine's ROAS would read 0 against real spend. Mirrors the
      // wiring on the Snapchat data page.
      snapchat:
        snapchatMonthly.length > 0
          ? {
              monthly: snapchatMonthly,
              campaigns: snapchatCampaigns,
              conversionValueTotal: snapchatCampaigns.reduce(
                (s, c) => s + c.conversionValue,
                0,
              ),
            }
          : null,
      // GA4 is web analytics, not an ad feed — passed in its own field so the
      // traffic signal (session growth + channel concentration) reaches the
      // persisted Exit Score, never the adSpend/ROAS sum.
      ga4:
        ga4Monthly.length > 0
          ? { monthly: ga4Monthly, channels: ga4Channels }
          : null,
      // Uploaded financial documents raise data confidence (they verify cash
      // deposits and earnings against the Shopify feed). Only the count matters.
      bankStatements:
        bankStatementFiles.length > 0
          ? { fileCount: bankStatementFiles.length }
          : null,
      pl: plFiles.length > 0 ? { fileCount: plFiles.length } : null,
    }),
    [
      store,
      orders,
      products,
      customers,
      business.industry,
      metaMonthly,
      metaCampaigns,
      googleMonthly,
      googleCampaigns,
      tikTokMonthly,
      tikTokCampaigns,
      snapchatMonthly,
      snapchatCampaigns,
      ga4Monthly,
      ga4Channels,
      bankStatementFiles,
      plFiles,
    ],
  );

  const hasData = orders.length > 0;

  const requestFor = useCallback(
    (t: RequestTool): ReportRequest | null => requests.latest[t],
    [requests.latest],
  );

  const statusFor = useCallback(
    (t: RequestTool): RunState => requestFor(t)?.status ?? "none",
    [requestFor],
  );

  /**
   * The approved result for a tool: the frozen engine payload with the
   * reviewer's edits applied. Null until an approval exists.
   */
  const approvedFor = useCallback(
    (t: RequestTool): FullReport | null => {
      const request = requestFor(t);
      if (!request || request.status !== "approved") return null;
      return applyOverrides(request.payload, request.overrides);
    },
    [requestFor],
  );

  /** Compute now and submit for review. Publishes nothing. */
  const submitRun = useCallback(
    async (t: RequestTool) => {
      if (!hasData) {
        toast.error("No store data yet — sync your store first.");
        return;
      }
      setComputing(true);
      try {
        await requests.submit(t, computeFullReport(input));
        toast.success(
          "Submitted for review — we'll email you when it's ready.",
        );
      } catch (err) {
        console.error("Failed to submit report request:", err);
        toast.error("Could not submit your request. Please try again.");
      } finally {
        setComputing(false);
      }
    },
    [hasData, input, requests],
  );

  /** One computation, all four tools queued (the Reports page). */
  const submitAllRuns = useCallback(async () => {
    if (!hasData) {
      toast.error("No store data yet — sync your store first.");
      return;
    }
    setComputing(true);
    try {
      await requests.submitAll(computeFullReport(input));
      toast.success(
        "Submitted for review — we'll email you when they're ready.",
      );
    } catch (err) {
      console.error("Failed to submit report requests:", err);
      toast.error("Could not submit your request. Please try again.");
    } finally {
      setComputing(false);
    }
  }, [hasData, input, requests]);

  const report = tool ? approvedFor(tool) : null;
  const status: RunState = tool ? statusFor(tool) : "none";
  const request = tool ? requestFor(tool) : null;

  return {
    ...bd,
    input,
    hasData,
    computing,
    requestsLoading: requests.loading,
    refreshRequests: requests.refresh,
    // Per-tool (when a tool was passed).
    report,
    status,
    request,
    run: () => (tool ? submitRun(tool) : submitAllRuns()),
    // Cross-tool helpers (the Reports page).
    statusFor,
    approvedFor,
    requestFor,
    submitRun,
    submitAllRuns,
  };
}
