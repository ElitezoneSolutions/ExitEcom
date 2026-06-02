import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  mockBusiness,
  topRisks,
  additionalRisks,
  topActions,
  dataRoomCategories,
} from "@/lib/mock";
import { toast } from "sonner";

export interface BusinessData {
  id?: string;
  name: string;
  ownerName: string;
  industry: string;
  channel: string;
  age: string;
  country: string;
  url?: string;
  revenueTTM: number;
  revenueMonthly: { m: string; v: number }[];
  ebitda: number;
  sde: number;
  grossMargin: number;
  netMargin: number;
  adSpend: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  grossRevenue: number;
  netRevenue: number;
  exitScore: number;
  scoreTier: string;
  scoreBreakdown: unknown[];
  valuationLow: number;
  valuationMid: number;
  valuationHigh: number;
  valuationOptimised: number;
  currentMultiple: number;
  optimisedMultiple: number;
  quickSale: number;
  fairMarket: number;
  optimised: number;
  adjustedEarnings: number;
  valueGap: number;
  repeatRate: number;
  avgOrderValue: number;
  roas: number;
  topProductShare: number;
  riskScore: number;
  totalValueLost: number;
  dataConfidence: number;
  connectedSources: string[];
  missingSources: string[];
}

export interface RiskItem {
  id?: string;
  title: string;
  severity: "high" | "medium" | "low";
  description: string;
  impact: number;
  buyerSees?: string;
  buyerFears?: string;
  buyerDoes?: string;
  recommendation?: string;
}

export interface ActionItem {
  id?: string;
  title: string;
  priority: "high" | "medium" | "low";
  uplift: number;
  time: string;
  problem: string;
  steps: string[];
}

export interface DocumentItem {
  id?: string;
  category: string;
  name: string;
  uploaded: boolean;
}

export function useBusinessData() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // States
  const [business, setBusiness] = useState<BusinessData>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("exitecom_business");
      if (cached) return JSON.parse(cached);
    }
    return mockBusiness as unknown as BusinessData;
  });
  const [risks, setRisks] = useState<RiskItem[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("exitecom_risks");
      if (cached) return JSON.parse(cached);
    }
    return [...topRisks, ...additionalRisks];
  });
  const [actions, setActions] = useState<ActionItem[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("exitecom_actions");
      if (cached) return JSON.parse(cached);
    }
    return topActions;
  });
  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    const list: DocumentItem[] = [];
    dataRoomCategories.forEach((cat) => {
      cat.items.forEach((item) => {
        list.push({
          category: cat.name,
          name: item.name,
          uploaded: item.uploaded,
        });
      });
    });
    return list;
  });

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch business
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bizError) throw bizError;

      if (!bizData) {
        // No business found, we will stick to mockBusiness but clear loading
        setLoading(false);
        return;
      }

      // 2. Fetch valuation
      const { data: valData, error: valError } = await supabase
        .from("valuation_data")
        .select("*")
        .eq("business_id", bizData.id)
        .maybeSingle();

      if (valError) throw valError;

      // 3. Fetch risks
      const { data: risksData, error: risksError } = await supabase
        .from("risks")
        .select("*")
        .eq("business_id", bizData.id);

      if (risksError) throw risksError;

      // 4. Fetch actions
      const { data: actionsData, error: actionsError } = await supabase
        .from("actions")
        .select("*")
        .eq("business_id", bizData.id);

      if (actionsError) throw actionsError;

      // 5. Fetch documents
      const { data: docsData, error: docsError } = await supabase
        .from("documents")
        .select("*")
        .eq("business_id", bizData.id);

      if (docsError) throw docsError;

      // Map DB fields back to the front-end BusinessData shape
      const mappedBusiness: BusinessData = {
        id: bizData.id,
        name: bizData.name,
        ownerName: user.user_metadata?.full_name || "Founder",
        industry: bizData.industry || "Beauty & Skincare",
        channel: bizData.primary_channel || "Shopify",
        age: bizData.age || "2.4 years",
        country: bizData.country || "United Kingdom",
        url: bizData.url || "novaskin.co",
        revenueTTM: Number(valData?.revenue_low || mockBusiness.revenueTTM),
        revenueMonthly: mockBusiness.revenueMonthly, // Keep monthly chart mock for visual display
        ebitda: Number(valData?.ebitda ?? mockBusiness.ebitda),
        sde: Number(valData?.sde ?? mockBusiness.sde),
        grossMargin: Number(valData?.gross_margin ?? mockBusiness.grossMargin),
        netMargin: Number(valData?.net_margin ?? mockBusiness.netMargin),
        adSpend: Number(valData?.ad_spend ?? mockBusiness.adSpend),
        cogs: Number(valData?.cogs ?? mockBusiness.cogs),
        grossProfit: Number(valData?.gross_profit ?? mockBusiness.grossProfit),
        opex: Number(valData?.opex ?? mockBusiness.opex),
        grossRevenue: Number(
          valData?.gross_revenue ?? mockBusiness.grossRevenue,
        ),
        netRevenue: Number(valData?.net_revenue ?? mockBusiness.netRevenue),
        exitScore: Number(valData?.exit_score ?? mockBusiness.exitScore),
        scoreTier: mockBusiness.scoreTier,
        scoreBreakdown: mockBusiness.scoreBreakdown as unknown[],
        valuationLow: Number(
          valData?.valuation_low ?? mockBusiness.valuationLow,
        ),
        valuationMid: Number(
          valData?.valuation_mid ?? mockBusiness.valuationMid,
        ),
        valuationHigh: Number(
          valData?.valuation_high ?? mockBusiness.valuationHigh,
        ),
        valuationOptimised: Number(
          valData?.valuation_optimised ?? mockBusiness.valuationOptimised,
        ),
        currentMultiple: Number(
          valData?.current_multiple ?? mockBusiness.currentMultiple,
        ),
        optimisedMultiple: Number(
          valData?.optimised_multiple ?? mockBusiness.optimisedMultiple,
        ),
        quickSale: Number(valData?.quick_sale ?? mockBusiness.quickSale),
        fairMarket: Number(valData?.fair_market ?? mockBusiness.fairMarket),
        optimised: Number(valData?.optimised ?? mockBusiness.optimised),
        adjustedEarnings: Number(
          valData?.adjusted_earnings ?? mockBusiness.adjustedEarnings,
        ),
        valueGap: Number(valData?.value_gap ?? mockBusiness.valueGap),
        repeatRate: Number(valData?.repeat_rate ?? mockBusiness.repeatRate),
        avgOrderValue: Number(
          valData?.avg_order_value ?? mockBusiness.avgOrderValue,
        ),
        roas: Number(valData?.roas ?? mockBusiness.roas),
        topProductShare: Number(
          valData?.top_product_share ?? mockBusiness.topProductShare,
        ),
        riskScore: Number(valData?.risk_score ?? mockBusiness.riskScore),
        totalValueLost: Number(
          valData?.total_value_lost ?? mockBusiness.totalValueLost,
        ),
        dataConfidence: Number(
          valData?.data_confidence ?? mockBusiness.dataConfidence,
        ),
        connectedSources:
          valData?.connected_sources || mockBusiness.connectedSources,
        missingSources: valData?.missing_sources || mockBusiness.missingSources,
      };

      setBusiness(mappedBusiness);

      // Cache live DB fetch to localStorage too
      localStorage.setItem("exitecom_business", JSON.stringify(mappedBusiness));

      if (risksData && risksData.length > 0) {
        const mappedRisks = risksData as RiskItem[];
        setRisks(mappedRisks);
        localStorage.setItem("exitecom_risks", JSON.stringify(mappedRisks));
      }

      if (actionsData && actionsData.length > 0) {
        const mappedActions = actionsData as ActionItem[];
        setActions(mappedActions);
        localStorage.setItem("exitecom_actions", JSON.stringify(mappedActions));
      }

      if (docsData && docsData.length > 0) {
        setDocuments(docsData as DocumentItem[]);
      }
    } catch (err: unknown) {
      console.error("Error fetching business data from Supabase:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error(
        "Failed to load live backend data. Falling back to offline data.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateBusiness = async (updatedFields: Partial<BusinessData>) => {
    const updated = { ...business, ...updatedFields };
    setBusiness(updated);
    localStorage.setItem("exitecom_business", JSON.stringify(updated));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Updated business details (local state)");
      return true;
    }

    try {
      const { error: updateError } = await supabase
        .from("businesses")
        .update({
          name: updatedFields.name,
          industry: updatedFields.industry,
          primary_channel: updatedFields.channel,
          country: updatedFields.country,
          age: updatedFields.age,
        })
        .eq("id", business.id);

      if (updateError) throw updateError;

      if (
        updatedFields.exitScore !== undefined ||
        updatedFields.valuationMid !== undefined
      ) {
        const { error: valUpdateError } = await supabase
          .from("valuation_data")
          .update({
            exit_score: updatedFields.exitScore,
            valuation_low: updatedFields.valuationLow,
            valuation_mid: updatedFields.valuationMid,
            valuation_high: updatedFields.valuationHigh,
            valuation_optimised: updatedFields.valuationOptimised,
            current_multiple: updatedFields.currentMultiple,
            optimised_multiple: updatedFields.optimisedMultiple,
          })
          .eq("business_id", business.id);

        if (valUpdateError) throw valUpdateError;
      }

      toast.success("Successfully synced business details to database!");
      return true;
    } catch (err: unknown) {
      console.error("Failed to update business in Supabase:", err);
      toast.error("Failed to sync updates to the cloud database.");
      return false;
    }
  };

  const syncShopifyData = async (normalizedData: any) => {
    const { businessUpdate, risks: newRisks, actions: newActions } = normalizedData;

    const updatedBusiness: BusinessData = {
      ...business,
      ...businessUpdate,
      connectedSources: Array.from(new Set([...business.connectedSources, "shopify"])),
      missingSources: business.missingSources.filter((s) => s.toLowerCase() !== "shopify"),
    };

    setBusiness(updatedBusiness);

    const mappedRisks: RiskItem[] = newRisks.map((r: any) => ({
      title: r.title,
      severity: r.severity as "high" | "medium" | "low",
      description: r.description,
      impact: r.impact,
      buyerSees: r.buyerSees,
      buyerFears: r.buyerFears,
      buyerDoes: r.buyerDoes,
      recommendation: r.recommendation,
    }));
    setRisks(mappedRisks);

    const mappedActions: ActionItem[] = newActions.map((a: any) => ({
      title: a.title,
      priority: a.priority as "high" | "medium" | "low",
      uplift: a.uplift,
      time: a.time,
      problem: a.problem,
      steps: a.steps,
    }));
    setActions(mappedActions);

    localStorage.setItem("exitecom_business", JSON.stringify(updatedBusiness));
    localStorage.setItem("exitecom_risks", JSON.stringify(mappedRisks));
    localStorage.setItem("exitecom_actions", JSON.stringify(mappedActions));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Successfully synchronized Shopify data (local sandbox)");
      return true;
    }

    try {
      setLoading(true);

      const { error: bizErr } = await supabase
        .from("businesses")
        .update({
          name: updatedBusiness.name,
          industry: updatedBusiness.industry,
          primary_channel: "Shopify Connect",
          country: updatedBusiness.country,
        })
        .eq("id", business.id);

      if (bizErr) throw bizErr;

      const { error: valErr } = await supabase
        .from("valuation_data")
        .update({
          exit_score: updatedBusiness.exitScore,
          valuation_low: updatedBusiness.valuationLow,
          valuation_mid: updatedBusiness.valuationMid,
          valuation_high: updatedBusiness.valuationHigh,
          valuation_optimised: updatedBusiness.valuationOptimised,
          current_multiple: updatedBusiness.currentMultiple,
          optimised_multiple: updatedBusiness.optimisedMultiple,
          quick_sale: updatedBusiness.quickSale,
          fair_market: updatedBusiness.fairMarket,
          optimised: updatedBusiness.optimised,
          adjusted_earnings: updatedBusiness.adjustedEarnings,
          value_gap: updatedBusiness.valueGap,
          repeat_rate: updatedBusiness.repeatRate,
          avg_order_value: updatedBusiness.avgOrderValue,
          roas: updatedBusiness.roas,
          top_product_share: updatedBusiness.topProductShare,
          risk_score: updatedBusiness.riskScore,
          total_value_lost: updatedBusiness.totalValueLost,
          data_confidence: updatedBusiness.dataConfidence,
          connected_sources: updatedBusiness.connectedSources,
          missing_sources: updatedBusiness.missingSources,
        })
        .eq("business_id", business.id);

      if (valErr) throw valErr;

      // Clean old risks and insert new
      await supabase.from("risks").delete().eq("business_id", business.id);
      const { error: riskErr } = await supabase.from("risks").insert(
        mappedRisks.map((r) => ({
          business_id: business.id,
          title: r.title,
          severity: r.severity,
          description: r.description,
          impact: r.impact,
          buyer_sees: r.buyerSees,
          buyer_fears: r.buyerFears,
          buyer_does: r.buyerDoes,
          recommendation: r.recommendation,
        }))
      );
      if (riskErr) throw riskErr;

      // Clean old actions and insert new
      await supabase.from("actions").delete().eq("business_id", business.id);
      const { error: actErr } = await supabase.from("actions").insert(
        mappedActions.map((a) => ({
          business_id: business.id,
          title: a.title,
          priority: a.priority,
          uplift: a.uplift,
          time: a.time,
          problem: a.problem,
          steps: a.steps,
        }))
      );
      if (actErr) throw actErr;

      toast.success("Successfully saved Shopify and Gemini reports to Supabase!");
      return true;
    } catch (err) {
      console.error("Failed to sync Shopify data to Supabase:", err);
      toast.error("Synced locally, but failed to save to Supabase cloud.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    business,
    risks,
    actions,
    documents,
    loading,
    error,
    refetch: fetchData,
    updateBusiness,
    syncShopifyData,
  };
}

