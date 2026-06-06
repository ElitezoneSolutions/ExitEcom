import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";
import {
  syncShopifyStoreFn,
  type RawShopifyStore,
  type RawShopifyOrder,
  type RawShopifyProduct,
  type RawShopifyCustomer,
} from "@/lib/shopify";

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

// A computed report snapshot (produced by src/lib/analytics.ts, on demand).
export interface ComputedReport {
  businessUpdate: Partial<BusinessData>;
  risks: RiskItem[];
  actions: ActionItem[];
}

// Re-export the raw Shopify shapes so pages can type their data.
export type {
  RawShopifyStore,
  RawShopifyOrder,
  RawShopifyProduct,
  RawShopifyCustomer,
};

// Empty state — what we show before any real data exists. NOT dummy/demo data:
// every field is blank/zero until onboarding or a computed report populates it.
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

// Upsert large arrays in chunks to stay within payload limits.
async function upsertChunked(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw error;
  }
}

// Turn a raw Supabase/Postgrest error into a clear, actionable Error. A missing
// table means the database migration hasn't been applied to this project yet.
function describeDbError(err: unknown): Error {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message || String(err);
  if (
    e?.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(msg)
  ) {
    return new Error(
      "Your database isn't fully set up yet: the Shopify data tables are missing. The latest database migration needs to be applied to this Supabase project before you can connect a store.",
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

// --- localStorage cache for the heavy raw Shopify arrays --------------------
// Orders/products/customers can be thousands of rows; re-reading them from
// Supabase on every page navigation is wasteful. We cache them locally (keyed
// by business) and only refresh the cache on an actual sync (manual or auto).
// NOTE: we deliberately do NOT cache the access token here — it stays in
// Supabase (RLS-protected) and is read from the small shopify_stores row.
const CACHE_SHOPIFY = "exitecom_shopify_raw_v1";

interface ShopifyRawCache {
  businessId: string;
  store: RawShopifyStore | null;
  lastSyncedAt: string | null;
  orders: RawShopifyOrder[];
  products: RawShopifyProduct[];
  customers: RawShopifyCustomer[];
}

function readShopifyCache(): ShopifyRawCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_SHOPIFY);
    return raw ? (JSON.parse(raw) as ShopifyRawCache) : null;
  } catch {
    return null;
  }
}

function writeShopifyCache(cache: ShopifyRawCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_SHOPIFY, JSON.stringify(cache));
  } catch (err) {
    // Quota exceeded (very large store) — skip caching; we read from Supabase
    // on cold loads instead. The app stays correct, just slightly slower.
    console.warn("[Shopify cache] not stored (likely too large):", err);
    try {
      localStorage.removeItem(CACHE_SHOPIFY);
    } catch {
      /* ignore */
    }
  }
}

function clearShopifyCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_SHOPIFY);
}

// Raw DB row shapes (only the columns we select) and pure mappers to in-app shapes.
interface OrderRow {
  shopify_order_id: string;
  order_number: string | null;
  total_price: number | string | null;
  currency: string | null;
  created_at: string | null;
  processed_at: string | null;
  financial_status: string | null;
  customer_id: string | null;
  line_items: unknown;
}
interface ProductRow {
  shopify_product_id: string;
  title: string | null;
  product_type: string | null;
  vendor: string | null;
  status: string | null;
  created_at: string | null;
  variants: unknown;
}
interface CustomerRow {
  shopify_customer_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  orders_count: number | null;
  total_spent: number | string | null;
  created_at: string | null;
  last_order_at: string | null;
}

const mapOrderRow = (r: OrderRow): RawShopifyOrder => ({
  shopifyOrderId: r.shopify_order_id,
  orderNumber: r.order_number ?? "",
  totalPrice: Number(r.total_price ?? 0),
  currency: r.currency ?? "",
  createdAt: r.created_at ?? "",
  processedAt: r.processed_at ?? null,
  financialStatus: r.financial_status ?? null,
  customerId: r.customer_id ?? null,
  lineItems: (r.line_items as RawShopifyOrder["lineItems"]) ?? [],
});
const mapProductRow = (r: ProductRow): RawShopifyProduct => ({
  shopifyProductId: r.shopify_product_id,
  title: r.title ?? "",
  productType: r.product_type ?? null,
  vendor: r.vendor ?? null,
  status: r.status ?? null,
  createdAt: r.created_at ?? "",
  variants: (r.variants as RawShopifyProduct["variants"]) ?? [],
});
const mapCustomerRow = (r: CustomerRow): RawShopifyCustomer => ({
  shopifyCustomerId: r.shopify_customer_id,
  email: r.email ?? null,
  firstName: r.first_name ?? null,
  lastName: r.last_name ?? null,
  ordersCount: Number(r.orders_count ?? 0),
  totalSpent: Number(r.total_spent ?? 0),
  createdAt: r.created_at ?? "",
  lastOrderAt: r.last_order_at ?? null,
});

// The actual data-layer implementation. Mounted ONCE by BusinessDataProvider so
// the whole `/app` subtree shares a single instance — otherwise every component
// that called this (the Sidebar + each page + useReport) would spin up its own
// state and fire its own Supabase hydration on mount (2–3× the round-trips per
// page, plus divergent copies of the same data). Consume it via useBusinessData.
function useBusinessDataImpl() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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

  // Raw Shopify data — seeded from the localStorage cache for an instant first
  // paint, then reconciled against Supabase (heavy arrays only re-read on sync).
  const [store, setStore] = useState<RawShopifyStore | null>(
    () => readShopifyCache()?.store ?? null,
  );
  const [orders, setOrders] = useState<RawShopifyOrder[]>(
    () => readShopifyCache()?.orders ?? [],
  );
  const [products, setProducts] = useState<RawShopifyProduct[]>(
    () => readShopifyCache()?.products ?? [],
  );
  const [customers, setCustomers] = useState<RawShopifyCustomer[]>(
    () => readShopifyCache()?.customers ?? [],
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => readShopifyCache()?.lastSyncedAt ?? null,
  );
  // Stored credentials, used only to refresh (never rendered).
  const [storeCreds, setStoreCreds] = useState<{
    shopDomain: string;
    accessToken: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bizError) throw bizError;

      if (!bizData) {
        setBusiness(EMPTY_BUSINESS);
        setRisks([]);
        setActions([]);
        setDocuments([]);
        setStore(null);
        setOrders([]);
        setProducts([]);
        setCustomers([]);
        setLastSyncedAt(null);
        localStorage.removeItem(CACHE_BUSINESS);
        localStorage.removeItem(CACHE_RISKS);
        localStorage.removeItem(CACHE_ACTIONS);
        clearShopifyCache();
        setLoading(false);
        return;
      }

      const [
        { data: valData, error: valError },
        { data: risksData, error: risksError },
        { data: actionsData, error: actionsError },
        { data: docsData, error: docsError },
      ] = await Promise.all([
        supabase
          .from("valuation_data")
          .select("*")
          .eq("business_id", bizData.id)
          .maybeSingle(),
        supabase.from("risks").select("*").eq("business_id", bizData.id),
        supabase.from("actions").select("*").eq("business_id", bizData.id),
        supabase.from("documents").select("*").eq("business_id", bizData.id),
      ]);

      const firstError = valError || risksError || actionsError || docsError;
      if (firstError) throw firstError;

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
        revenueMonthly:
          (valData?.revenue_monthly as { m: string; v: number }[] | null) ?? [],
        scoreBreakdown: (valData?.score_breakdown as unknown[] | null) ?? [],
        revenueTTM: Number(valData?.revenue_ttm ?? 0),
        ebitda: Number(valData?.ebitda ?? 0),
        sde: Number(valData?.adjusted_earnings ?? 0),
        exitScore: Number(valData?.exit_score ?? 0),
        scoreTier: valData?.score_tier ?? "",
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
      localStorage.setItem(CACHE_BUSINESS, JSON.stringify(mappedBusiness));

      const mappedRisks = (risksData ?? []) as RiskItem[];
      setRisks(mappedRisks);
      localStorage.setItem(CACHE_RISKS, JSON.stringify(mappedRisks));

      const mappedActions = (actionsData ?? []) as ActionItem[];
      setActions(mappedActions);
      localStorage.setItem(CACHE_ACTIONS, JSON.stringify(mappedActions));

      if (docsData && docsData.length > 0)
        setDocuments(docsData as DocumentItem[]);

      // Raw Shopify data is optional and loaded independently: a user who
      // hasn't connected a store (or a project where the shopify_* tables
      // aren't migrated yet) should NOT see a failure — just no store data.
      await loadShopifyData(bizData.id);
    } catch (err: unknown) {
      console.error("Error fetching business data from Supabase:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      toast.error(
        "Failed to load live backend data. Falling back to offline data.",
      );
    } finally {
      setLoading(false);
    }
    // loadShopifyData only closes over stable setters + the module-level
    // supabase client, so it doesn't need to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Read the heavy raw tables (orders/products/customers) from Supabase.
  const fetchShopifyArrays = async (businessId: string) => {
    const [
      { data: orderRows, error: oErr },
      { data: productRows, error: pErr },
      { data: customerRows, error: cErr },
    ] = await Promise.all([
      supabase
        .from("shopify_orders")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
      supabase
        .from("shopify_products")
        .select("*")
        .eq("business_id", businessId),
      supabase
        .from("shopify_customers")
        .select("*")
        .eq("business_id", businessId),
    ]);
    const err = oErr || pErr || cErr;
    if (err) throw err;
    return {
      orders: ((orderRows ?? []) as OrderRow[]).map(mapOrderRow),
      products: ((productRows ?? []) as ProductRow[]).map(mapProductRow),
      customers: ((customerRows ?? []) as CustomerRow[]).map(mapCustomerRow),
    };
  };

  // Load the raw Shopify data. The small store row (identity, credentials,
  // freshness) is always read from Supabase; the heavy arrays are served from
  // the localStorage cache when present, and only fetched from Supabase on a
  // cold load (no cache) — after which they're cached. Refreshed on sync.
  // Degrades silently if the tables are absent/empty.
  const loadShopifyData = async (businessId: string) => {
    try {
      // Warm cache: serve store metadata + all arrays locally. Zero network.
      // (The access token is fetched lazily at sync time — never cached.)
      const cache = readShopifyCache();
      if (cache && cache.businessId === businessId && cache.store) {
        setStore(cache.store);
        setLastSyncedAt(cache.lastSyncedAt);
        setOrders(cache.orders);
        setProducts(cache.products);
        setCustomers(cache.customers);
        return;
      }

      // Cold load: read store identity (+ credentials) and the heavy tables once.
      const { data: storeRow, error: storeError } = await supabase
        .from("shopify_stores")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();

      if (storeError) {
        console.warn("[Shopify data] not available yet:", storeError.message);
        return;
      }

      if (!storeRow) {
        // Store not connected — clear any stale local data/cache.
        setStore(null);
        setLastSyncedAt(null);
        setStoreCreds(null);
        setOrders([]);
        setProducts([]);
        setCustomers([]);
        clearShopifyCache();
        return;
      }

      const storeMeta: RawShopifyStore = {
        shopDomain: storeRow.shop_domain,
        name: storeRow.name ?? "",
        currency: storeRow.currency ?? "",
        country: storeRow.country ?? "",
        plan: storeRow.plan ?? null,
        shopCreatedAt: storeRow.shop_created_at ?? "",
      };
      setStore(storeMeta);
      setLastSyncedAt(storeRow.last_synced_at ?? null);
      setStoreCreds(
        storeRow.access_token
          ? {
              shopDomain: storeRow.shop_domain,
              accessToken: storeRow.access_token,
            }
          : null,
      );

      const arrays = await fetchShopifyArrays(businessId);
      setOrders(arrays.orders);
      setProducts(arrays.products);
      setCustomers(arrays.customers);
      writeShopifyCache({
        businessId,
        store: storeMeta,
        lastSyncedAt: storeRow.last_synced_at ?? null,
        ...arrays,
      });
    } catch (err) {
      console.warn("[Shopify data] load skipped:", err);
    }
  };

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
      toast.success("Successfully synced business details to database!");
      return true;
    } catch (err: unknown) {
      console.error("Failed to update business in Supabase:", err);
      toast.error("Failed to sync updates to the cloud database.");
      return false;
    }
  };

  // Connect / refresh a Shopify store: pull the full dataset and persist it.
  // No report is computed here — that happens on demand via saveComputedReport.
  const syncStore = async (
    shopDomain: string,
    accessToken: string,
    opts?: { incremental?: boolean },
  ) => {
    const sinceISO =
      opts?.incremental && lastSyncedAt ? lastSyncedAt : undefined;

    const result = await syncShopifyStoreFn({
      data: { shopDomain, accessToken, sinceISO },
    });

    // Reflect immediately in local state (works even without Supabase).
    setStore(result.shop);
    if (!sinceISO) {
      setOrders(result.orders);
      setProducts(result.products);
      setCustomers(result.customers);
    }
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "shopify"])),
      missingSources: b.missingSources.filter(
        (s) => s.toLowerCase() !== "shopify",
      ),
    }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Store synced (local sandbox).");
      return result;
    }

    const businessId = business.id;
    const nowISO = new Date().toISOString();

    try {
      const { error: storeErr } = await supabase.from("shopify_stores").upsert(
        {
          business_id: businessId,
          shop_domain: result.shop.shopDomain,
          access_token: accessToken,
          name: result.shop.name,
          currency: result.shop.currency,
          country: result.shop.country,
          plan: result.shop.plan,
          shop_created_at: result.shop.shopCreatedAt || null,
          last_synced_at: nowISO,
          synced_at: nowISO,
        },
        { onConflict: "business_id" },
      );
      if (storeErr) throw storeErr;

      await upsertChunked(
        "shopify_orders",
        result.orders.map((o) => ({
          business_id: businessId,
          shopify_order_id: o.shopifyOrderId,
          order_number: o.orderNumber,
          total_price: o.totalPrice,
          currency: o.currency,
          created_at: o.createdAt || null,
          processed_at: o.processedAt,
          financial_status: o.financialStatus,
          customer_id: o.customerId,
          line_items: o.lineItems,
          synced_at: nowISO,
        })),
        "business_id,shopify_order_id",
      );

      await upsertChunked(
        "shopify_products",
        result.products.map((p) => ({
          business_id: businessId,
          shopify_product_id: p.shopifyProductId,
          title: p.title,
          product_type: p.productType,
          vendor: p.vendor,
          status: p.status,
          created_at: p.createdAt || null,
          variants: p.variants,
          synced_at: nowISO,
        })),
        "business_id,shopify_product_id",
      );

      await upsertChunked(
        "shopify_customers",
        result.customers.map((c) => ({
          business_id: businessId,
          shopify_customer_id: c.shopifyCustomerId,
          email: c.email,
          first_name: c.firstName,
          last_name: c.lastName,
          orders_count: c.ordersCount,
          total_spent: c.totalSpent,
          created_at: c.createdAt || null,
          last_order_at: c.lastOrderAt,
          synced_at: nowISO,
        })),
        "business_id,shopify_customer_id",
      );

      // Record the store identity + the connected source.
      const sources = Array.from(
        new Set([...business.connectedSources, "shopify"]),
      );
      await supabase
        .from("businesses")
        .update({
          primary_channel: "Shopify Connect",
          ...(business.name ? {} : { name: result.shop.name }),
          ...(business.country ? {} : { country: result.shop.country }),
        })
        .eq("id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: sources },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
    } catch (err) {
      throw describeDbError(err);
    }

    setLastSyncedAt(nowISO);
    setStoreCreds({ shopDomain, accessToken });

    // Refresh the local cache + state with canonical data. A full sync already
    // holds the complete dataset in `result`; an incremental sync only pulled
    // new rows, so re-read the merged set from Supabase.
    const arrays = sinceISO
      ? await fetchShopifyArrays(businessId)
      : {
          orders: result.orders,
          products: result.products,
          customers: result.customers,
        };
    setOrders(arrays.orders);
    setProducts(arrays.products);
    setCustomers(arrays.customers);
    writeShopifyCache({
      businessId,
      store: result.shop,
      lastSyncedAt: nowISO,
      ...arrays,
    });

    return result;
  };

  // Refresh using the stored credentials (manual "Sync now" / auto-on-stale).
  // The access token isn't cached locally, so fetch it from Supabase on demand
  // (only when a sync actually runs) rather than holding it in the browser.
  const resyncStore = async (incremental = false) => {
    let creds = storeCreds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a Shopify store first.");
      }
      const { data, error } = await supabase
        .from("shopify_stores")
        .select("shop_domain, access_token")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error);
      if (!data?.access_token) {
        throw new Error("No stored Shopify credentials — reconnect the store.");
      }
      creds = { shopDomain: data.shop_domain, accessToken: data.access_token };
      setStoreCreds(creds);
    }
    return syncStore(creds.shopDomain, creds.accessToken, { incremental });
  };

  // Persist an on-demand computed report snapshot.
  const saveComputedReport = async (report: ComputedReport) => {
    const updatedBusiness: BusinessData = {
      ...business,
      ...report.businessUpdate,
    };
    setBusiness(updatedBusiness);
    setRisks(report.risks);
    setActions(report.actions);
    localStorage.setItem(CACHE_BUSINESS, JSON.stringify(updatedBusiness));
    localStorage.setItem(CACHE_RISKS, JSON.stringify(report.risks));
    localStorage.setItem(CACHE_ACTIONS, JSON.stringify(report.actions));

    if (!isSupabaseConfigured || !user || !business.id) return true;

    try {
      const businessId = business.id;
      await supabase
        .from("businesses")
        .update({
          name: updatedBusiness.name,
          industry: updatedBusiness.industry,
          country: updatedBusiness.country,
          age: updatedBusiness.age,
        })
        .eq("id", businessId);

      const { error: valErr } = await supabase.from("valuation_data").upsert(
        {
          business_id: businessId,
          revenue_ttm: updatedBusiness.revenueTTM,
          revenue_monthly: updatedBusiness.revenueMonthly,
          ebitda: updatedBusiness.ebitda,
          score_breakdown: updatedBusiness.scoreBreakdown,
          score_tier: updatedBusiness.scoreTier,
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
        },
        { onConflict: "business_id" },
      );
      if (valErr) throw valErr;

      await supabase.from("risks").delete().eq("business_id", businessId);
      if (report.risks.length > 0) {
        const { error: riskErr } = await supabase.from("risks").insert(
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
        if (riskErr) throw riskErr;
      }

      await supabase.from("actions").delete().eq("business_id", businessId);
      if (report.actions.length > 0) {
        const { error: actErr } = await supabase.from("actions").insert(
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
        if (actErr) throw actErr;
      }
      return true;
    } catch (err) {
      console.error("Failed to save computed report to Supabase:", err);
      toast.error("Saved locally, but failed to save the report to the cloud.");
      return false;
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
    // Raw Shopify data
    store,
    orders,
    products,
    customers,
    lastSyncedAt,
    // Connected stores can always resync — the token is fetched on demand.
    canResync: !!store || isShopifyConnected,
    // Actions
    refetch: fetchData,
    updateBusiness,
    syncStore,
    resyncStore,
    saveComputedReport,
  };
}

type BusinessDataValue = ReturnType<typeof useBusinessDataImpl>;

const BusinessDataContext = createContext<BusinessDataValue | undefined>(
  undefined,
);

/**
 * Provides a single shared business-data instance to the whole `/app` subtree.
 * Mount this once (in the authenticated layout) above the Sidebar and the
 * routed pages so they all read/write the same state and the backend is
 * hydrated once per session rather than once per consuming component.
 */
export function BusinessDataProvider({ children }: { children: ReactNode }) {
  const value = useBusinessDataImpl();
  return (
    <BusinessDataContext.Provider value={value}>
      {children}
    </BusinessDataContext.Provider>
  );
}

export function useBusinessData() {
  const context = useContext(BusinessDataContext);
  if (context === undefined) {
    throw new Error(
      "useBusinessData must be used within a BusinessDataProvider",
    );
  }
  return context;
}
