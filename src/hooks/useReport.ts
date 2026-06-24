import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useBusinessData } from "./useBusinessData";
import {
  computeFullReport,
  type AnalyticsInput,
  type FullReport,
} from "@/lib/analytics";

// Shared logic for the on-demand report pages (Exit Score, Risk Scanner,
// Valuation, Optimization). A report is only produced when the user clicks
// "Run". Once run, it is recomputed deterministically from the stored raw data
// for display (identical inputs → identical numbers) and re-persisted on demand.
export function useReport() {
  const bd = useBusinessData();
  const {
    store,
    orders,
    products,
    customers,
    business,
    risks,
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
    saveComputedReport,
  } = bd;
  const [computing, setComputing] = useState(false);
  const [justRan, setJustRan] = useState<FullReport | null>(null);

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
  const hasRun = business.exitScore > 0 || risks.length > 0;

  const report: FullReport | null = useMemo(() => {
    if (justRan) return justRan;
    if (hasRun && hasData) {
      try {
        return computeFullReport(input);
      } catch (err) {
        console.error("Failed to compute report:", err);
        return null;
      }
    }
    return null;
  }, [justRan, hasRun, hasData, input]);

  const run = async () => {
    if (!hasData) {
      toast.error("No store data yet — sync your store first.");
      return;
    }
    setComputing(true);
    try {
      const r = computeFullReport(input);
      setJustRan(r);
      await saveComputedReport({
        businessUpdate: r.businessUpdate,
        risks: r.risks,
        actions: r.actions,
      });
      toast.success("Report computed from your store data.");
    } finally {
      setComputing(false);
    }
  };

  return { ...bd, input, hasData, hasRun, report, computing, run };
}
