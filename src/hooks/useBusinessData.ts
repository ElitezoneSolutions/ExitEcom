import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export interface BusinessData {
  id?: string;
  name: string;
  ownerName: string;
  industry: string;
  channel: string;
  age: string;
  country: string;
  monthlyRevenue: string;
  exitTimeframe: string;
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

// Payload returned by the Shopify Connect server function (Gemini or fallback).
export interface NormalizedShopifyReport {
  businessUpdate: Partial<BusinessData>;
  risks: RiskItem[];
  actions: ActionItem[];
}

// Empty state — what we show before any real data exists. NOT dummy/demo data:
// every field is blank/zero until onboarding (business profile) or Shopify
// (results) populates it. No placeholder business is ever shown to the user.
const EMPTY_BUSINESS: BusinessData = {
  name: "",
  ownerName: "",
  industry: "",
  channel: "",
  age: "",
  country: "",
  monthlyRevenue: "",
  exitTimeframe: "",
  url: "",
  revenueTTM: 0,
  revenueMonthly: [],
  ebitda: 0,
  sde: 0,
  grossMargin: 0,
  netMargin: 0,
  adSpend: 0,
  cogs: 0,
  grossProfit: 0,
  opex: 0,
  grossRevenue: 0,
  netRevenue: 0,
  exitScore: 0,
  scoreTier: "",
  scoreBreakdown: [],
  valuationLow: 0,
  valuationMid: 0,
  valuationHigh: 0,
  valuationOptimised: 0,
  currentMultiple: 0,
  optimisedMultiple: 0,
  quickSale: 0,
  fairMarket: 0,
  optimised: 0,
  adjustedEarnings: 0,
  valueGap: 0,
  repeatRate: 0,
  avgOrderValue: 0,
  roas: 0,
  topProductShare: 0,
  riskScore: 0,
  totalValueLost: 0,
  dataConfidence: 0,
  connectedSources: [],
  missingSources: [],
};

// Bumped from earlier keys so any stale mock ("NovaSkin Co.") cache is ignored.
const CACHE_BUSINESS = "exitecom_business_v2";
const CACHE_RISKS = "exitecom_risks_v2";
const CACHE_ACTIONS = "exitecom_actions_v2";

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const cached = localStorage.getItem(key);
  if (!cached) return fallback;
  try {
    return JSON.parse(cached) as T;
  } catch {
    return fallback;
  }
}

export function useBusinessData() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // States (seeded only from real cached data, never from mock/demo data)
  const [business, setBusiness] = useState<BusinessData>(() =>
    readCache(CACHE_BUSINESS, EMPTY_BUSINESS),
  );
  const [risks, setRisks] = useState<RiskItem[]>(() =>
    readCache<RiskItem[]>(CACHE_RISKS, []),
  );
  const [actions, setActions] = useState<ActionItem[]>(() =>
    readCache<ActionItem[]>(CACHE_ACTIONS, []),
  );
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

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
        // No business yet (account created but onboarding not completed).
        // Show empty state — never stale/mock data.
        setBusiness(EMPTY_BUSINESS);
        setRisks([]);
        setActions([]);
        setDocuments([]);
        localStorage.removeItem(CACHE_BUSINESS);
        localStorage.removeItem(CACHE_RISKS);
        localStorage.removeItem(CACHE_ACTIONS);
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

      // Map DB fields onto the front-end BusinessData shape. Profile fields come
      // from the businesses row (onboarding); result metrics come from
      // valuation_data (Shopify-derived). Anything absent stays empty/zero —
      // no mock/placeholder fallbacks.
      const mappedBusiness: BusinessData = {
        ...EMPTY_BUSINESS,
        id: bizData.id,
        name: bizData.name ?? "",
        ownerName: user.user_metadata?.full_name ?? "",
        industry: bizData.industry ?? "",
        channel: bizData.primary_channel ?? "",
        age: bizData.age ?? "",
        country: bizData.country ?? "",
        monthlyRevenue: bizData.monthly_revenue ?? "",
        exitTimeframe: bizData.exit_timeframe ?? "",
        url: bizData.url ?? "",
        exitScore: Number(valData?.exit_score ?? 0),
        valuationLow: Number(valData?.valuation_low ?? 0),
        valuationMid: Number(valData?.valuation_mid ?? 0),
        valuationHigh: Number(valData?.valuation_high ?? 0),
        valuationOptimised: Number(valData?.valuation_optimised ?? 0),
        currentMultiple: Number(valData?.current_multiple ?? 0),
        optimisedMultiple: Number(valData?.optimised_multiple ?? 0),
        quickSale: Number(valData?.quick_sale ?? 0),
        fairMarket: Number(valData?.fair_market ?? 0),
        optimised: Number(valData?.optimised ?? 0),
        adjustedEarnings: Number(valData?.adjusted_earnings ?? 0),
        valueGap: Number(valData?.value_gap ?? 0),
        repeatRate: Number(valData?.repeat_rate ?? 0),
        avgOrderValue: Number(valData?.avg_order_value ?? 0),
        roas: Number(valData?.roas ?? 0),
        topProductShare: Number(valData?.top_product_share ?? 0),
        riskScore: Number(valData?.risk_score ?? 0),
        totalValueLost: Number(valData?.total_value_lost ?? 0),
        dataConfidence: Number(valData?.data_confidence ?? 0),
        connectedSources: valData?.connected_sources ?? [],
        missingSources: valData?.missing_sources ?? [],
      };

      setBusiness(mappedBusiness);

      // Cache live DB fetch to localStorage too
      localStorage.setItem(CACHE_BUSINESS, JSON.stringify(mappedBusiness));

      const mappedRisks = (risksData ?? []) as RiskItem[];
      setRisks(mappedRisks);
      localStorage.setItem(CACHE_RISKS, JSON.stringify(mappedRisks));

      const mappedActions = (actionsData ?? []) as ActionItem[];
      setActions(mappedActions);
      localStorage.setItem(CACHE_ACTIONS, JSON.stringify(mappedActions));

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
    localStorage.setItem(CACHE_BUSINESS, JSON.stringify(updated));

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
          monthly_revenue: updatedFields.monthlyRevenue,
          exit_timeframe: updatedFields.exitTimeframe,
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

  const syncShopifyData = async (normalizedData: NormalizedShopifyReport) => {
    const {
      businessUpdate,
      risks: newRisks,
      actions: newActions,
    } = normalizedData;

    const updatedBusiness: BusinessData = {
      ...business,
      ...businessUpdate,
      connectedSources: Array.from(
        new Set([...business.connectedSources, "shopify"]),
      ),
      missingSources: business.missingSources.filter(
        (s) => s.toLowerCase() !== "shopify",
      ),
    };

    setBusiness(updatedBusiness);

    const mappedRisks: RiskItem[] = newRisks.map((r) => ({
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

    const mappedActions: ActionItem[] = newActions.map((a) => ({
      title: a.title,
      priority: a.priority as "high" | "medium" | "low",
      uplift: a.uplift,
      time: a.time,
      problem: a.problem,
      steps: a.steps,
    }));
    setActions(mappedActions);

    localStorage.setItem(CACHE_BUSINESS, JSON.stringify(updatedBusiness));
    localStorage.setItem(CACHE_RISKS, JSON.stringify(mappedRisks));
    localStorage.setItem(CACHE_ACTIONS, JSON.stringify(mappedActions));

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
        })),
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
        })),
      );
      if (actErr) throw actErr;

      toast.success(
        "Successfully saved Shopify and Gemini reports to Supabase!",
      );
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

  const isShopifyConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("shopify"),
  );

  return {
    business,
    risks,
    actions,
    documents,
    loading,
    error,
    isShopifyConnected,
    refetch: fetchData,
    updateBusiness,
    syncShopifyData,
  };
}
