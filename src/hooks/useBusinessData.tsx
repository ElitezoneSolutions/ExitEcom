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
  syncViaConnectionKeyFn,
  type RawShopifyStore,
  type RawShopifyOrder,
  type RawShopifyProduct,
  type RawShopifyCustomer,
  type ShopifySyncResult,
} from "@/lib/shopify";
import {
  syncMetaAdAccountFn,
  runMetaApiCallFn,
  type RawMetaAccount,
  type RawMetaMonthly,
  type RawMetaCampaign,
  type MetaSyncResult,
} from "@/lib/meta";
import {
  syncGoogleAdsFn,
  type RawGoogleAccount,
  type RawGoogleMonthly,
  type RawGoogleCampaign,
  type GoogleSyncResult,
} from "@/lib/google";
import {
  syncTikTokAdsFn,
  type RawTikTokAccount,
  type RawTikTokMonthly,
  type RawTikTokCampaign,
  type TikTokSyncResult,
} from "@/lib/tiktok";
import {
  syncSnapchatAdsFn,
  type RawSnapchatAccount,
  type RawSnapchatMonthly,
  type RawSnapchatCampaign,
  type SnapchatSyncResult,
} from "@/lib/snapchat";
import {
  syncGA4Fn,
  type RawGA4Account,
  type RawGA4Monthly,
  type RawGA4Channel,
  type GA4SyncResult,
} from "@/lib/ga4";

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

// Re-export the raw Shopify + Meta shapes so pages can type their data.
export type {
  RawShopifyStore,
  RawShopifyOrder,
  RawShopifyProduct,
  RawShopifyCustomer,
};
export type { RawMetaAccount, RawMetaMonthly, RawMetaCampaign };
export type { RawGoogleAccount, RawGoogleMonthly, RawGoogleCampaign };
export type { RawTikTokAccount, RawTikTokMonthly, RawTikTokCampaign };
export type { RawGA4Account, RawGA4Monthly, RawGA4Channel };

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
function describeDbError(err: unknown, source = "Shopify"): Error {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message || String(err);
  if (
    e?.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(msg)
  ) {
    return new Error(
      `Your database isn't fully set up yet: the ${source} data tables are missing. The latest database migration needs to be applied to this Supabase project before you can connect.`,
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

// --- localStorage cache for the raw Meta data -------------------------------
// Same approach as the Shopify cache: serve the (smaller) Meta arrays locally
// for an instant first paint, refresh only on an actual sync. The access token
// is never cached — it stays in the RLS-protected meta_accounts row.
const CACHE_META = "exitecom_meta_raw_v1";

interface MetaRawCache {
  businessId: string;
  account: RawMetaAccount | null;
  lastSyncedAt: string | null;
  monthly: RawMetaMonthly[];
  campaigns: RawMetaCampaign[];
}

function readMetaCache(): MetaRawCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_META);
    return raw ? (JSON.parse(raw) as MetaRawCache) : null;
  } catch {
    return null;
  }
}

function writeMetaCache(cache: MetaRawCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_META, JSON.stringify(cache));
  } catch (err) {
    console.warn("[Meta cache] not stored (likely too large):", err);
    try {
      localStorage.removeItem(CACHE_META);
    } catch {
      /* ignore */
    }
  }
}

function clearMetaCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_META);
}

interface MetaMonthlyRow {
  month: string;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}
interface MetaCampaignRow {
  meta_campaign_id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  spend: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}

const mapMetaMonthlyRow = (r: MetaMonthlyRow): RawMetaMonthly => ({
  month: r.month,
  spend: Number(r.spend ?? 0),
  impressions: Number(r.impressions ?? 0),
  clicks: Number(r.clicks ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});
const mapMetaCampaignRow = (r: MetaCampaignRow): RawMetaCampaign => ({
  metaCampaignId: r.meta_campaign_id,
  name: r.name ?? "",
  objective: r.objective ?? null,
  status: r.status ?? null,
  spend: Number(r.spend ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});

// --- localStorage cache for the raw Google Ads data (same approach as Meta) --
const CACHE_GOOGLE = "exitecom_google_raw_v1";

interface GoogleRawCache {
  businessId: string;
  account: RawGoogleAccount | null;
  lastSyncedAt: string | null;
  monthly: RawGoogleMonthly[];
  campaigns: RawGoogleCampaign[];
}

function readGoogleCache(): GoogleRawCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_GOOGLE);
    return raw ? (JSON.parse(raw) as GoogleRawCache) : null;
  } catch {
    return null;
  }
}

function writeGoogleCache(cache: GoogleRawCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_GOOGLE, JSON.stringify(cache));
  } catch (err) {
    console.warn("[Google cache] not stored (likely too large):", err);
    try {
      localStorage.removeItem(CACHE_GOOGLE);
    } catch {
      /* ignore */
    }
  }
}

function clearGoogleCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_GOOGLE);
}

interface GoogleMonthlyRow {
  month: string;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}
interface GoogleCampaignRow {
  google_campaign_id: string;
  name: string | null;
  channel_type: string | null;
  status: string | null;
  spend: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}

const mapGoogleMonthlyRow = (r: GoogleMonthlyRow): RawGoogleMonthly => ({
  month: r.month,
  spend: Number(r.spend ?? 0),
  impressions: Number(r.impressions ?? 0),
  clicks: Number(r.clicks ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});
const mapGoogleCampaignRow = (r: GoogleCampaignRow): RawGoogleCampaign => ({
  googleCampaignId: r.google_campaign_id,
  name: r.name ?? "",
  channelType: r.channel_type ?? null,
  status: r.status ?? null,
  spend: Number(r.spend ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});

// --- localStorage cache for the raw TikTok Ads data (same approach as Meta/Google) --
const CACHE_TIKTOK = "exitecom_tiktok_raw_v1";

interface TikTokRawCache {
  businessId: string;
  account: RawTikTokAccount | null;
  lastSyncedAt: string | null;
  monthly: RawTikTokMonthly[];
  campaigns: RawTikTokCampaign[];
}

function readTikTokCache(): TikTokRawCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_TIKTOK);
    return raw ? (JSON.parse(raw) as TikTokRawCache) : null;
  } catch {
    return null;
  }
}

function writeTikTokCache(cache: TikTokRawCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_TIKTOK, JSON.stringify(cache));
  } catch (err) {
    console.warn("[TikTok cache] not stored (likely too large):", err);
    try {
      localStorage.removeItem(CACHE_TIKTOK);
    } catch {
      /* ignore */
    }
  }
}

function clearTikTokCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_TIKTOK);
}

// --- localStorage cache for the raw Snapchat Ads data (same approach as TikTok) --
const CACHE_SNAPCHAT = "exitecom_snapchat_raw_v1";

interface SnapchatRawCache {
  businessId: string;
  account: RawSnapchatAccount | null;
  lastSyncedAt: string | null;
  monthly: RawSnapchatMonthly[];
  campaigns: RawSnapchatCampaign[];
}

function readSnapchatCache(): SnapchatRawCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_SNAPCHAT);
    return raw ? (JSON.parse(raw) as SnapchatRawCache) : null;
  } catch {
    return null;
  }
}

function writeSnapchatCache(cache: SnapchatRawCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_SNAPCHAT, JSON.stringify(cache));
  } catch (err) {
    console.warn("[Snapchat cache] not stored (likely too large):", err);
    try {
      localStorage.removeItem(CACHE_SNAPCHAT);
    } catch {
      /* ignore */
    }
  }
}

function clearSnapchatCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_SNAPCHAT);
}

interface TikTokMonthlyRow {
  month: string;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}
interface TikTokCampaignRow {
  tiktok_campaign_id: string;
  name: string | null;
  objective_type: string | null;
  status: string | null;
  spend: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}

const mapTikTokMonthlyRow = (r: TikTokMonthlyRow): RawTikTokMonthly => ({
  month: r.month,
  spend: Number(r.spend ?? 0),
  impressions: Number(r.impressions ?? 0),
  clicks: Number(r.clicks ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});

const mapTikTokCampaignRow = (r: TikTokCampaignRow): RawTikTokCampaign => ({
  tikTokCampaignId: r.tiktok_campaign_id,
  name: r.name ?? "",
  objectiveType: r.objective_type ?? null,
  status: r.status ?? null,
  spend: Number(r.spend ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});

interface SnapchatMonthlyRow {
  month: string;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}
interface SnapchatCampaignRow {
  snapchat_campaign_id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  spend: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
  roas: number | string | null;
}

const mapSnapchatMonthlyRow = (r: SnapchatMonthlyRow): RawSnapchatMonthly => ({
  month: r.month,
  spend: Number(r.spend ?? 0),
  impressions: Number(r.impressions ?? 0),
  clicks: Number(r.clicks ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});

const mapSnapchatCampaignRow = (r: SnapchatCampaignRow): RawSnapchatCampaign => ({
  snapchatCampaignId: r.snapchat_campaign_id,
  name: r.name ?? "",
  objective: r.objective ?? null,
  status: r.status ?? null,
  spend: Number(r.spend ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionValue: Number(r.conversion_value ?? 0),
  roas: Number(r.roas ?? 0),
});

// --- localStorage cache for the raw GA4 data (same approach as the ad feeds) -
// GA4 is web analytics, not ads: the arrays are a monthly traffic series and a
// per-channel breakdown rather than campaigns. The refresh token is never
// cached — it stays in the RLS-protected ga4_accounts row.
const CACHE_GA4 = "exitecom_ga4_raw_v1";

interface GA4RawCache {
  businessId: string;
  account: RawGA4Account | null;
  lastSyncedAt: string | null;
  monthly: RawGA4Monthly[];
  channels: RawGA4Channel[];
}

function readGA4Cache(): GA4RawCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_GA4);
    return raw ? (JSON.parse(raw) as GA4RawCache) : null;
  } catch {
    return null;
  }
}

function writeGA4Cache(cache: GA4RawCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_GA4, JSON.stringify(cache));
  } catch (err) {
    console.warn("[GA4 cache] not stored (likely too large):", err);
    try {
      localStorage.removeItem(CACHE_GA4);
    } catch {
      /* ignore */
    }
  }
}

function clearGA4Cache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_GA4);
}

interface GA4MonthlyRow {
  month: string;
  sessions: number | string | null;
  total_users: number | string | null;
  new_users: number | string | null;
  conversions: number | string | null;
  conversion_rate: number | string | null;
  purchase_revenue: number | string | null;
  transactions: number | string | null;
}
interface GA4ChannelRow {
  channel: string;
  sessions: number | string | null;
  conversions: number | string | null;
  purchase_revenue: number | string | null;
  session_share: number | string | null;
}

const mapGA4MonthlyRow = (r: GA4MonthlyRow): RawGA4Monthly => ({
  month: r.month,
  sessions: Number(r.sessions ?? 0),
  totalUsers: Number(r.total_users ?? 0),
  newUsers: Number(r.new_users ?? 0),
  conversions: Number(r.conversions ?? 0),
  conversionRate: Number(r.conversion_rate ?? 0),
  purchaseRevenue: Number(r.purchase_revenue ?? 0),
  transactions: Number(r.transactions ?? 0),
});

const mapGA4ChannelRow = (r: GA4ChannelRow): RawGA4Channel => ({
  channel: r.channel,
  sessions: Number(r.sessions ?? 0),
  conversions: Number(r.conversions ?? 0),
  purchaseRevenue: Number(r.purchase_revenue ?? 0),
  sessionShare: Number(r.session_share ?? 0),
});

// Bank statement row types
interface BankMonthlyRow {
  id: string;
  month: string;
  total_credits: number | string | null;
  total_debits: number | string | null;
  net_flow: number | string | null;
  transaction_count: number | string | null;
}
interface BankFileRow {
  id: string;
  file_name: string;
  file_size: number | null;
  row_count: number | null;
  file_path: string | null;
  synced_at: string;
}

export interface BankStatementMonth {
  month: string;
  totalCredits: number;
  totalDebits: number;
  netFlow: number;
  transactionCount: number;
}
export interface BankStatementFile {
  id: string;
  fileName: string;
  fileSize: number | null;
  rowCount: number | null;
  filePath: string | null;
  syncedAt: string;
}

const mapBankMonthlyRow = (r: BankMonthlyRow): BankStatementMonth => ({
  month: r.month,
  totalCredits: Number(r.total_credits ?? 0),
  totalDebits: Number(r.total_debits ?? 0),
  netFlow: Number(r.net_flow ?? 0),
  transactionCount: Number(r.transaction_count ?? 0),
});
const mapBankFileRow = (r: BankFileRow): BankStatementFile => ({
  id: r.id,
  fileName: r.file_name,
  fileSize: r.file_size,
  rowCount: r.row_count,
  filePath: r.file_path,
  syncedAt: r.synced_at,
});

interface PLFileRow {
  id: string;
  file_name: string;
  file_size: number | null;
  file_path: string | null;
  synced_at: string;
}

export interface PLFile {
  id: string;
  fileName: string;
  fileSize: number | null;
  filePath: string | null;
  syncedAt: string;
}

const mapPLFileRow = (r: PLFileRow): PLFile => ({
  id: r.id,
  fileName: r.file_name,
  fileSize: r.file_size,
  filePath: r.file_path,
  syncedAt: r.synced_at,
});


// The actual data-layer implementation. Mounted ONCE by BusinessDataProvider so
// the whole authenticated app subtree shares a single instance — otherwise every component
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
  // Stored credentials, used only to refresh (never rendered). `source`
  // distinguishes the two connectors: a custom app refreshes with its Admin
  // token, the ExitEcom Analytic connector refreshes with its connection key.
  const [storeCreds, setStoreCreds] = useState<{
    source: "custom_app" | "analytic";
    shopDomain: string;
    accessToken: string | null;
    connectionKey: string | null;
  } | null>(null);

  // Raw Meta Ads data — same cache-first seeding as Shopify above.
  const [metaAccount, setMetaAccount] = useState<RawMetaAccount | null>(
    () => readMetaCache()?.account ?? null,
  );
  const [metaMonthly, setMetaMonthly] = useState<RawMetaMonthly[]>(
    () => readMetaCache()?.monthly ?? [],
  );
  const [metaCampaigns, setMetaCampaigns] = useState<RawMetaCampaign[]>(
    () => readMetaCache()?.campaigns ?? [],
  );
  const [metaLastSyncedAt, setMetaLastSyncedAt] = useState<string | null>(
    () => readMetaCache()?.lastSyncedAt ?? null,
  );
  // Stored Meta credentials, used only to refresh (never rendered). `source`
  // distinguishes the pasted-token path from the in-app OAuth path. Both store a
  // long-lived access token, so refresh treats them identically.
  const [metaCreds, setMetaCreds] = useState<{
    source: "direct" | "oauth";
    adAccountId: string;
    accessToken: string | null;
    connectionKey: string | null;
  } | null>(null);

  // Raw Google Ads data — same cache-first seeding as Meta.
  const [googleAccount, setGoogleAccount] = useState<RawGoogleAccount | null>(
    () => readGoogleCache()?.account ?? null,
  );
  const [googleMonthly, setGoogleMonthly] = useState<RawGoogleMonthly[]>(
    () => readGoogleCache()?.monthly ?? [],
  );
  const [googleCampaigns, setGoogleCampaigns] = useState<RawGoogleCampaign[]>(
    () => readGoogleCache()?.campaigns ?? [],
  );
  const [googleLastSyncedAt, setGoogleLastSyncedAt] = useState<string | null>(
    () => readGoogleCache()?.lastSyncedAt ?? null,
  );
  // Stored Google credentials (the durable refresh token + the manager id the
  // account is queried through), used only to refresh.
  const [googleCreds, setGoogleCreds] = useState<{
    source: "oauth" | "manual";
    customerId: string;
    refreshToken: string | null;
    loginCustomerId: string | null;
  } | null>(null);

  // Raw TikTok Ads data — same cache-first seeding as Meta/Google.
  const [tikTokAccount, setTikTokAccount] = useState<RawTikTokAccount | null>(
    () => readTikTokCache()?.account ?? null,
  );
  const [tikTokMonthly, setTikTokMonthly] = useState<RawTikTokMonthly[]>(
    () => readTikTokCache()?.monthly ?? [],
  );
  const [tikTokCampaigns, setTikTokCampaigns] = useState<RawTikTokCampaign[]>(
    () => readTikTokCache()?.campaigns ?? [],
  );
  const [tikTokLastSyncedAt, setTikTokLastSyncedAt] = useState<string | null>(
    () => readTikTokCache()?.lastSyncedAt ?? null,
  );
  // Stored TikTok credentials (access_token — long-lived, no refresh needed).
  const [tikTokCreds, setTikTokCreds] = useState<{
    source: "oauth" | "direct";
    advertiserId: string;
    accessToken: string | null;
  } | null>(null);

  // Raw Snapchat Ads data — same cache-first seeding as TikTok/Meta/Google.
  const [snapchatAccount, setSnapchatAccount] = useState<RawSnapchatAccount | null>(
    () => readSnapchatCache()?.account ?? null,
  );
  const [snapchatMonthly, setSnapchatMonthly] = useState<RawSnapchatMonthly[]>(
    () => readSnapchatCache()?.monthly ?? [],
  );
  const [snapchatCampaigns, setSnapchatCampaigns] = useState<RawSnapchatCampaign[]>(
    () => readSnapchatCache()?.campaigns ?? [],
  );
  const [snapchatLastSyncedAt, setSnapchatLastSyncedAt] = useState<string | null>(
    () => readSnapchatCache()?.lastSyncedAt ?? null,
  );
  // Stored Snapchat credentials. access_token expires in 1 h; refresh_token is durable.
  const [snapchatCreds, setSnapchatCreds] = useState<{
    source: "oauth" | "direct";
    adAccountId: string;
    accessToken: string | null;
    refreshToken: string | null;
  } | null>(null);

  // Raw GA4 (web analytics) data — same cache-first seeding as the ad feeds,
  // but the arrays are a monthly traffic series + a per-channel breakdown.
  const [ga4Account, setGA4Account] = useState<RawGA4Account | null>(
    () => readGA4Cache()?.account ?? null,
  );
  const [ga4Monthly, setGA4Monthly] = useState<RawGA4Monthly[]>(
    () => readGA4Cache()?.monthly ?? [],
  );
  const [ga4Channels, setGA4Channels] = useState<RawGA4Channel[]>(
    () => readGA4Cache()?.channels ?? [],
  );
  const [ga4LastSyncedAt, setGA4LastSyncedAt] = useState<string | null>(
    () => readGA4Cache()?.lastSyncedAt ?? null,
  );
  // Stored GA4 credentials (the durable refresh token), used only to refresh.
  const [ga4Creds, setGA4Creds] = useState<{
    source: "oauth" | "manual";
    propertyId: string;
    refreshToken: string | null;
  } | null>(null);

  // Bank statement aggregates — loaded from DB on mount, no localStorage cache.
  const [bankStatementMonthly, setBankStatementMonthly] = useState<BankStatementMonth[]>([]);
  const [bankStatementFiles, setBankStatementFiles] = useState<BankStatementFile[]>([]);
  const [bankLastSyncedAt, setBankLastSyncedAt] = useState<string | null>(null);

  // P&L file uploads — loaded from DB on mount, no localStorage cache.
  const [plFiles, setPLFiles] = useState<PLFile[]>([]);
  const [plLastSyncedAt, setPLLastSyncedAt] = useState<string | null>(null);

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
        setMetaAccount(null);
        setMetaMonthly([]);
        setMetaCampaigns([]);
        setMetaLastSyncedAt(null);
        setMetaCreds(null);
        setGoogleAccount(null);
        setGoogleMonthly([]);
        setGoogleCampaigns([]);
        setGoogleLastSyncedAt(null);
        setGoogleCreds(null);
        localStorage.removeItem(CACHE_BUSINESS);
        localStorage.removeItem(CACHE_RISKS);
        localStorage.removeItem(CACHE_ACTIONS);
        setGA4Account(null);
        setGA4Monthly([]);
        setGA4Channels([]);
        setGA4LastSyncedAt(null);
        setGA4Creds(null);
        clearShopifyCache();
        clearMetaCache();
        clearGoogleCache();
        clearTikTokCache();
        clearSnapchatCache();
        clearGA4Cache();
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

      // Raw Shopify + Meta data are optional and loaded independently: a user
      // who hasn't connected a source (or a project where those tables aren't
      // migrated yet) should NOT see a failure — just no data for that source.
      await loadShopifyData(bizData.id);
      await loadMetaData(bizData.id);
      await loadGoogleData(bizData.id);
      await loadTikTokData(bizData.id);
      await loadSnapchatData(bizData.id);
      await loadGA4Data(bizData.id);
      await loadBankStatements(bizData.id);
      await loadPLFiles(bizData.id);
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
        storeRow.access_token || storeRow.connection_key
          ? {
              source:
                (storeRow.source as "custom_app" | "analytic") ?? "custom_app",
              shopDomain: storeRow.shop_domain,
              accessToken: storeRow.access_token ?? null,
              connectionKey: storeRow.connection_key ?? null,
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

  // Read the raw Meta tables (monthly insights + campaigns) from Supabase.
  const fetchMetaArrays = async (businessId: string) => {
    const [
      { data: monthlyRows, error: mErr },
      { data: campaignRows, error: cErr },
    ] = await Promise.all([
      supabase
        .from("meta_monthly_insights")
        .select("*")
        .eq("business_id", businessId)
        .order("month", { ascending: true }),
      supabase
        .from("meta_campaigns")
        .select("*")
        .eq("business_id", businessId)
        .order("spend", { ascending: false }),
    ]);
    const err = mErr || cErr;
    if (err) throw err;
    return {
      monthly: ((monthlyRows ?? []) as MetaMonthlyRow[]).map(mapMetaMonthlyRow),
      campaigns: ((campaignRows ?? []) as MetaCampaignRow[]).map(
        mapMetaCampaignRow,
      ),
    };
  };

  // Load the raw Meta data. Mirrors loadShopifyData: warm cache serves locally,
  // a cold load reads the account row (+ credentials) and arrays from Supabase
  // once, then caches them. Degrades silently if the tables are absent/empty.
  const loadMetaData = async (businessId: string) => {
    try {
      const cache = readMetaCache();
      if (cache && cache.businessId === businessId && cache.account) {
        setMetaAccount(cache.account);
        setMetaLastSyncedAt(cache.lastSyncedAt);
        setMetaMonthly(cache.monthly);
        setMetaCampaigns(cache.campaigns);
        return;
      }

      const { data: acctRow, error: acctError } = await supabase
        .from("meta_accounts")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();

      if (acctError) {
        console.warn("[Meta data] not available yet:", acctError.message);
        return;
      }

      if (!acctRow) {
        setMetaAccount(null);
        setMetaLastSyncedAt(null);
        setMetaCreds(null);
        setMetaMonthly([]);
        setMetaCampaigns([]);
        clearMetaCache();
        return;
      }

      const accountMeta: RawMetaAccount = {
        adAccountId: acctRow.ad_account_id,
        name: acctRow.name ?? "",
        currency: acctRow.currency ?? "",
        timezone: acctRow.timezone ?? "",
        accountStatus: acctRow.account_status ?? "",
      };
      setMetaAccount(accountMeta);
      setMetaLastSyncedAt(acctRow.last_synced_at ?? null);
      setMetaCreds(
        acctRow.access_token
          ? {
              source: (acctRow.source as "direct" | "oauth") ?? "direct",
              adAccountId: acctRow.ad_account_id,
              accessToken: acctRow.access_token ?? null,
              connectionKey: null,
            }
          : null,
      );

      const arrays = await fetchMetaArrays(businessId);
      setMetaMonthly(arrays.monthly);
      setMetaCampaigns(arrays.campaigns);
      writeMetaCache({
        businessId,
        account: accountMeta,
        lastSyncedAt: acctRow.last_synced_at ?? null,
        ...arrays,
      });
    } catch (err) {
      console.warn("[Meta data] load skipped:", err);
    }
  };

  // Read the raw Google tables (monthly insights + campaigns) from Supabase.
  const fetchGoogleArrays = async (businessId: string) => {
    const [
      { data: monthlyRows, error: mErr },
      { data: campaignRows, error: cErr },
    ] = await Promise.all([
      supabase
        .from("google_monthly_insights")
        .select("*")
        .eq("business_id", businessId)
        .order("month", { ascending: true }),
      supabase
        .from("google_campaigns")
        .select("*")
        .eq("business_id", businessId)
        .order("spend", { ascending: false }),
    ]);
    const err = mErr || cErr;
    if (err) throw err;
    return {
      monthly: ((monthlyRows ?? []) as GoogleMonthlyRow[]).map(
        mapGoogleMonthlyRow,
      ),
      campaigns: ((campaignRows ?? []) as GoogleCampaignRow[]).map(
        mapGoogleCampaignRow,
      ),
    };
  };

  // Load the raw Google data. Mirrors loadMetaData exactly.
  const loadGoogleData = async (businessId: string) => {
    try {
      const cache = readGoogleCache();
      if (cache && cache.businessId === businessId && cache.account) {
        setGoogleAccount(cache.account);
        setGoogleLastSyncedAt(cache.lastSyncedAt);
        setGoogleMonthly(cache.monthly);
        setGoogleCampaigns(cache.campaigns);
        return;
      }

      const { data: acctRow, error: acctError } = await supabase
        .from("google_accounts")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();

      if (acctError) {
        console.warn("[Google data] not available yet:", acctError.message);
        return;
      }

      if (!acctRow) {
        setGoogleAccount(null);
        setGoogleLastSyncedAt(null);
        setGoogleCreds(null);
        setGoogleMonthly([]);
        setGoogleCampaigns([]);
        clearGoogleCache();
        return;
      }

      const accountMeta: RawGoogleAccount = {
        customerId: acctRow.customer_id,
        name: acctRow.name ?? "",
        currency: acctRow.currency ?? "",
        timezone: acctRow.timezone ?? "",
        accountStatus: acctRow.account_status ?? "",
      };
      setGoogleAccount(accountMeta);
      setGoogleLastSyncedAt(acctRow.last_synced_at ?? null);
      setGoogleCreds(
        acctRow.refresh_token
          ? {
              source: (acctRow.source as "oauth" | "manual") ?? "oauth",
              customerId: acctRow.customer_id,
              refreshToken: acctRow.refresh_token ?? null,
              loginCustomerId: acctRow.login_customer_id ?? null,
            }
          : null,
      );

      const arrays = await fetchGoogleArrays(businessId);
      setGoogleMonthly(arrays.monthly);
      setGoogleCampaigns(arrays.campaigns);
      writeGoogleCache({
        businessId,
        account: accountMeta,
        lastSyncedAt: acctRow.last_synced_at ?? null,
        ...arrays,
      });
    } catch (err) {
      console.warn("[Google data] load skipped:", err);
    }
  };

  // Read raw TikTok tables from Supabase. Mirrors loadGoogleData exactly.
  const fetchTikTokArrays = async (businessId: string) => {
    const [
      { data: monthlyRows, error: mErr },
      { data: campaignRows, error: cErr },
    ] = await Promise.all([
      supabase
        .from("tiktok_monthly_insights")
        .select("*")
        .eq("business_id", businessId)
        .order("month", { ascending: true }),
      supabase
        .from("tiktok_campaigns")
        .select("*")
        .eq("business_id", businessId)
        .order("spend", { ascending: false }),
    ]);
    const err = mErr || cErr;
    if (err) throw err;
    return {
      monthly: ((monthlyRows ?? []) as TikTokMonthlyRow[]).map(mapTikTokMonthlyRow),
      campaigns: ((campaignRows ?? []) as TikTokCampaignRow[]).map(mapTikTokCampaignRow),
    };
  };

  const loadTikTokData = async (businessId: string) => {
    try {
      const cache = readTikTokCache();
      if (cache && cache.businessId === businessId && cache.account) {
        setTikTokAccount(cache.account);
        setTikTokLastSyncedAt(cache.lastSyncedAt);
        setTikTokMonthly(cache.monthly);
        setTikTokCampaigns(cache.campaigns);
        return;
      }

      const { data: acctRow, error: acctError } = await supabase
        .from("tiktok_accounts")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();

      if (acctError) {
        console.warn("[TikTok data] not available yet:", acctError.message);
        return;
      }

      if (!acctRow) {
        setTikTokAccount(null);
        setTikTokLastSyncedAt(null);
        setTikTokCreds(null);
        setTikTokMonthly([]);
        setTikTokCampaigns([]);
        clearTikTokCache();
        return;
      }

      const accountMeta: RawTikTokAccount = {
        advertiserId: acctRow.advertiser_id,
        name: acctRow.name ?? "",
        currency: acctRow.currency ?? "",
        timezone: acctRow.timezone ?? "",
        accountStatus: acctRow.account_status ?? "",
      };
      setTikTokAccount(accountMeta);
      setTikTokLastSyncedAt(acctRow.last_synced_at ?? null);
      setTikTokCreds(
        acctRow.access_token
          ? {
              source: (acctRow.source as "oauth" | "direct") ?? "oauth",
              advertiserId: acctRow.advertiser_id,
              accessToken: acctRow.access_token ?? null,
            }
          : null,
      );

      const arrays = await fetchTikTokArrays(businessId);
      setTikTokMonthly(arrays.monthly);
      setTikTokCampaigns(arrays.campaigns);
      writeTikTokCache({
        businessId,
        account: accountMeta,
        lastSyncedAt: acctRow.last_synced_at ?? null,
        ...arrays,
      });
    } catch (err) {
      console.warn("[TikTok data] load skipped:", err);
    }
  };

  // Commit a TikTok sync result to local state + Supabase. Mirrors commitGoogleSync.
  const commitTikTokSync = async (
    result: TikTokSyncResult,
    creds: {
      source: "oauth" | "direct";
      advertiserId: string;
      accessToken: string | null;
    },
  ) => {
    setTikTokAccount(result.account);
    setTikTokMonthly(result.monthly);
    setTikTokCampaigns(result.campaigns);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "tiktok"])),
      missingSources: b.missingSources.filter(
        (s) => s.toLowerCase() !== "tiktok",
      ),
    }));

    if (!isSupabaseConfigured || !user) {
      toast.success("TikTok Ads synced (local sandbox).");
      return result;
    }

    // In the OAuth popup, business.id loads asynchronously and may not be in
    // state yet when this runs (especially for single-account connections where
    // the exchange resolves before the business data fetch completes). Fetch it
    // directly from Supabase rather than silently skipping the write.
    let businessId = business.id;
    if (!businessId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      businessId = biz?.id ?? "";
    }

    if (!businessId) {
      toast.success("TikTok Ads synced (local sandbox).");
      return result;
    }
    const nowISO = new Date().toISOString();

    try {
      const { error: acctErr } = await supabase.from("tiktok_accounts").upsert(
        {
          business_id: businessId,
          advertiser_id: result.account.advertiserId,
          access_token: creds.accessToken,
          source: creds.source,
          name: result.account.name,
          currency: result.account.currency,
          timezone: result.account.timezone,
          account_status: result.account.accountStatus,
          last_synced_at: nowISO,
          synced_at: nowISO,
        },
        { onConflict: "business_id" },
      );
      if (acctErr) throw acctErr;

      await supabase
        .from("tiktok_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("tiktok_campaigns")
        .delete()
        .eq("business_id", businessId);

      await upsertChunked(
        "tiktok_monthly_insights",
        result.monthly.map((m) => ({
          business_id: businessId,
          month: m.month,
          spend: m.spend,
          impressions: m.impressions,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversionValue,
          roas: m.roas,
          synced_at: nowISO,
        })),
        "business_id,month",
      );

      await upsertChunked(
        "tiktok_campaigns",
        result.campaigns.map((c) => ({
          business_id: businessId,
          tiktok_campaign_id: c.tikTokCampaignId,
          name: c.name,
          objective_type: c.objectiveType,
          status: c.status,
          spend: c.spend,
          conversions: c.conversions,
          conversion_value: c.conversionValue,
          roas: c.roas,
          synced_at: nowISO,
        })),
        "business_id,tiktok_campaign_id",
      );

      const sources = Array.from(
        new Set([...business.connectedSources, "tiktok"]),
      );
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: sources },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
    } catch (err) {
      throw describeDbError(err, "TikTok");
    }

    setTikTokLastSyncedAt(nowISO);
    setTikTokCreds(creds);
    writeTikTokCache({
      businessId,
      account: result.account,
      lastSyncedAt: nowISO,
      monthly: result.monthly,
      campaigns: result.campaigns,
    });

    return result;
  };

  const syncTikTokWithSource = async (
    source: "oauth" | "direct",
    advertiserId: string,
    accessToken: string,
    sandboxEnv = false,
  ) => {
    const result = await syncTikTokAdsFn({ data: { advertiserId, accessToken, sandboxEnv } });
    return commitTikTokSync(result, {
      source,
      advertiserId: result.account.advertiserId,
      accessToken,
    });
  };

  const syncTikTok = (advertiserId: string, accessToken: string, sandboxEnv = false) =>
    syncTikTokWithSource("direct", advertiserId, accessToken, sandboxEnv);

  const syncTikTokViaOAuth = (advertiserId: string, accessToken: string) =>
    syncTikTokWithSource("oauth", advertiserId, accessToken);

  const resyncTikTok = async () => {
    let creds = tikTokCreds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a TikTok Ads account first.");
      }
      const { data, error } = await supabase
        .from("tiktok_accounts")
        .select("advertiser_id, access_token, source")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error, "TikTok");
      if (!data?.access_token) {
        throw new Error("No stored TikTok credentials — reconnect the account.");
      }
      creds = {
        source: (data.source as "oauth" | "direct") ?? "oauth",
        advertiserId: data.advertiser_id,
        accessToken: data.access_token ?? null,
      };
      setTikTokCreds(creds);
    }
    if (!creds.accessToken) {
      throw new Error("No stored TikTok credentials — reconnect the account.");
    }
    return syncTikTok(creds.advertiserId, creds.accessToken);
  };

  const disconnectTikTok = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("tiktok"),
    );

    setTikTokAccount(null);
    setTikTokMonthly([]);
    setTikTokCampaigns([]);
    setTikTokLastSyncedAt(null);
    setTikTokCreds(null);
    clearTikTokCache();
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("TikTok Ads disconnected.");
      return;
    }

    const businessId = business.id;
    try {
      await supabase
        .from("tiktok_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("tiktok_campaigns")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("tiktok_accounts")
        .delete()
        .eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: remaining },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
      toast.success("TikTok Ads disconnected.");
    } catch (err) {
      throw describeDbError(err, "TikTok");
    }
  };

  // -------------------------------------------------------------------------
  // Snapchat Ads — mirrors the TikTok implementation above.
  // Key difference: access tokens expire in 3600 s. commitSnapchatSync stores
  // refresh_token, and resyncSnapchat passes both to the server fn so it can
  // auto-refresh and return updatedTokens when a refresh happens.
  // -------------------------------------------------------------------------

  const fetchSnapchatArrays = async (businessId: string) => {
    const [
      { data: monthlyRows, error: mErr },
      { data: campaignRows, error: cErr },
    ] = await Promise.all([
      supabase
        .from("snapchat_monthly_insights")
        .select("*")
        .eq("business_id", businessId)
        .order("month", { ascending: true }),
      supabase
        .from("snapchat_campaigns")
        .select("*")
        .eq("business_id", businessId)
        .order("spend", { ascending: false }),
    ]);
    const err = mErr || cErr;
    if (err) throw err;
    return {
      monthly: ((monthlyRows ?? []) as SnapchatMonthlyRow[]).map(mapSnapchatMonthlyRow),
      campaigns: ((campaignRows ?? []) as SnapchatCampaignRow[]).map(mapSnapchatCampaignRow),
    };
  };

  const loadSnapchatData = async (businessId: string) => {
    try {
      const cache = readSnapchatCache();
      if (cache && cache.businessId === businessId && cache.account) {
        setSnapchatAccount(cache.account);
        setSnapchatLastSyncedAt(cache.lastSyncedAt);
        setSnapchatMonthly(cache.monthly);
        setSnapchatCampaigns(cache.campaigns);
        return;
      }

      const { data: acctRow, error: acctError } = await supabase
        .from("snapchat_accounts")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();

      if (acctError) {
        console.warn("[Snapchat data] not available yet:", acctError.message);
        return;
      }

      if (!acctRow) {
        setSnapchatAccount(null);
        setSnapchatLastSyncedAt(null);
        setSnapchatCreds(null);
        setSnapchatMonthly([]);
        setSnapchatCampaigns([]);
        clearSnapchatCache();
        return;
      }

      const accountMeta: RawSnapchatAccount = {
        adAccountId: acctRow.ad_account_id,
        name: acctRow.name ?? "",
        currency: acctRow.currency ?? "",
        timezone: acctRow.timezone ?? "",
        accountStatus: acctRow.account_status ?? "",
      };
      setSnapchatAccount(accountMeta);
      setSnapchatLastSyncedAt(acctRow.last_synced_at ?? null);
      setSnapchatCreds(
        acctRow.access_token
          ? {
              source: (acctRow.source as "oauth" | "direct") ?? "oauth",
              adAccountId: acctRow.ad_account_id,
              accessToken: acctRow.access_token ?? null,
              refreshToken: acctRow.refresh_token ?? null,
            }
          : null,
      );

      const arrays = await fetchSnapchatArrays(businessId);
      setSnapchatMonthly(arrays.monthly);
      setSnapchatCampaigns(arrays.campaigns);
      writeSnapchatCache({
        businessId,
        account: accountMeta,
        lastSyncedAt: acctRow.last_synced_at ?? null,
        ...arrays,
      });
    } catch (err) {
      console.warn("[Snapchat data] load skipped:", err);
    }
  };

  const commitSnapchatSync = async (
    result: SnapchatSyncResult,
    creds: {
      source: "oauth" | "direct";
      adAccountId: string;
      accessToken: string | null;
      refreshToken: string | null;
    },
  ) => {
    setSnapchatAccount(result.account);
    setSnapchatMonthly(result.monthly);
    setSnapchatCampaigns(result.campaigns);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "snapchat"])),
      missingSources: b.missingSources.filter(
        (s) => s.toLowerCase() !== "snapchat",
      ),
    }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Snapchat Ads synced (local sandbox).");
      return result;
    }

    const businessId = business.id;
    const nowISO = new Date().toISOString();

    try {
      const { error: acctErr } = await supabase.from("snapchat_accounts").upsert(
        {
          business_id: businessId,
          ad_account_id: result.account.adAccountId,
          access_token: creds.accessToken,
          refresh_token: creds.refreshToken,
          source: creds.source,
          name: result.account.name,
          currency: result.account.currency,
          timezone: result.account.timezone,
          account_status: result.account.accountStatus,
          last_synced_at: nowISO,
          synced_at: nowISO,
        },
        { onConflict: "business_id" },
      );
      if (acctErr) throw acctErr;

      await supabase
        .from("snapchat_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("snapchat_campaigns")
        .delete()
        .eq("business_id", businessId);

      await upsertChunked(
        "snapchat_monthly_insights",
        result.monthly.map((m) => ({
          business_id: businessId,
          month: m.month,
          spend: m.spend,
          impressions: m.impressions,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversionValue,
          roas: m.roas,
          synced_at: nowISO,
        })),
        "business_id,month",
      );

      await upsertChunked(
        "snapchat_campaigns",
        result.campaigns.map((c) => ({
          business_id: businessId,
          snapchat_campaign_id: c.snapchatCampaignId,
          name: c.name,
          objective: c.objective,
          status: c.status,
          spend: c.spend,
          conversions: c.conversions,
          conversion_value: c.conversionValue,
          roas: c.roas,
          synced_at: nowISO,
        })),
        "business_id,snapchat_campaign_id",
      );

      const sources = Array.from(
        new Set([...business.connectedSources, "snapchat"]),
      );
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: sources },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
    } catch (err) {
      throw describeDbError(err, "Snapchat");
    }

    setSnapchatLastSyncedAt(nowISO);
    setSnapchatCreds(creds);
    writeSnapchatCache({
      businessId,
      account: result.account,
      lastSyncedAt: nowISO,
      monthly: result.monthly,
      campaigns: result.campaigns,
    });

    return result;
  };

  const syncSnapchat = async (
    adAccountId: string,
    accessToken: string,
    refreshToken?: string | null,
  ) => {
    const result = await syncSnapchatAdsFn({
      data: { adAccountId, accessToken, refreshToken: refreshToken ?? null },
    });
    const creds = {
      source: "direct" as const,
      adAccountId,
      accessToken: result.updatedTokens?.accessToken ?? accessToken,
      refreshToken: result.updatedTokens?.refreshToken ?? refreshToken ?? null,
    };
    return commitSnapchatSync(result, creds);
  };

  const syncSnapchatViaOAuth = async (
    adAccountId: string,
    accessToken: string,
    refreshToken: string,
  ) => {
    const result = await syncSnapchatAdsFn({
      data: { adAccountId, accessToken, refreshToken },
    });
    const creds = {
      source: "oauth" as const,
      adAccountId,
      accessToken: result.updatedTokens?.accessToken ?? accessToken,
      refreshToken: result.updatedTokens?.refreshToken ?? refreshToken,
    };
    return commitSnapchatSync(result, creds);
  };

  const resyncSnapchat = async () => {
    let creds = snapchatCreds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a Snapchat Ads account first.");
      }
      const { data, error } = await supabase
        .from("snapchat_accounts")
        .select("ad_account_id, access_token, refresh_token, source")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error, "Snapchat");
      if (!data?.access_token) {
        throw new Error(
          "No stored Snapchat credentials — reconnect the account.",
        );
      }
      creds = {
        source: (data.source as "oauth" | "direct") ?? "oauth",
        adAccountId: data.ad_account_id,
        accessToken: data.access_token ?? null,
        refreshToken: data.refresh_token ?? null,
      };
      setSnapchatCreds(creds);
    }
    if (!creds.accessToken) {
      throw new Error("No stored Snapchat credentials — reconnect the account.");
    }
    return syncSnapchat(creds.adAccountId, creds.accessToken, creds.refreshToken);
  };

  const disconnectSnapchat = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("snapchat"),
    );

    setSnapchatAccount(null);
    setSnapchatMonthly([]);
    setSnapchatCampaigns([]);
    setSnapchatLastSyncedAt(null);
    setSnapchatCreds(null);
    clearSnapchatCache();
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Snapchat Ads disconnected.");
      return;
    }

    const businessId = business.id;
    try {
      await supabase
        .from("snapchat_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("snapchat_campaigns")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("snapchat_accounts")
        .delete()
        .eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: remaining },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
      toast.success("Snapchat Ads disconnected.");
    } catch (err) {
      throw describeDbError(err, "Snapchat");
    }
  };

  // --- Bank Statements ------------------------------------------------------- //

  const loadBankStatements = async (businessId: string) => {
    try {
      const [{ data: monthlyRows }, { data: fileRows }] = await Promise.all([
        supabase
          .from("bank_statement_monthly")
          .select("*")
          .eq("business_id", businessId)
          .order("month", { ascending: true }),
        supabase
          .from("bank_statement_files")
          .select("*")
          .eq("business_id", businessId)
          .order("synced_at", { ascending: false }),
      ]);
      if (monthlyRows && monthlyRows.length > 0) {
        const monthly = (monthlyRows as BankMonthlyRow[]).map(mapBankMonthlyRow);
        setBankStatementMonthly(monthly);
        const fileList = (fileRows ?? []) as BankFileRow[];
        setBankStatementFiles(fileList.map(mapBankFileRow));
        const latest = fileList[0];
        if (latest) setBankLastSyncedAt(latest.synced_at);
      }
    } catch {
      // Silently degrade — tables may not exist yet on older deploys
    }
  };

  const commitBankFile = async (
    fileInfo: { name: string; size: number; blob?: File },
    businessId: string,
  ) => {
    const nowISO = new Date().toISOString();
    setBankLastSyncedAt(nowISO);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "bank_statements"])),
    }));

    if (!isSupabaseConfigured || !user) return;

    // Upload PDF to storage: {uid}/{uuid}.pdf
    let filePath: string | null = null;
    if (fileInfo.blob) {
      const fileId = crypto.randomUUID();
      const storagePath = `${user.id}/${fileId}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("bank-statements")
        .upload(storagePath, fileInfo.blob, { contentType: "application/pdf", upsert: false });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
      filePath = storagePath;
    }

    const { data: fileRow, error: fileErr } = await supabase
      .from("bank_statement_files")
      .insert({
        business_id: businessId,
        file_name: fileInfo.name,
        file_size: fileInfo.size,
        row_count: null,
        file_path: filePath,
        synced_at: nowISO,
      })
      .select()
      .single();
    if (fileErr) throw describeDbError(fileErr, "Bank Statements");
    setBankStatementFiles((prev) => [mapBankFileRow(fileRow as BankFileRow), ...prev]);

    const sources = Array.from(new Set([...business.connectedSources, "bank_statements"]));
    const { error: valErr } = await supabase
      .from("valuation_data")
      .upsert({ business_id: businessId, connected_sources: sources }, { onConflict: "business_id" });
    if (valErr) throw describeDbError(valErr, "Bank Statements");

    await supabase
      .from("documents")
      .update({ uploaded: true })
      .eq("business_id", businessId)
      .eq("name", "Bank Statements (3 months)");
  };

  const uploadBankStatements = async (files: File[]) => {
    if (!business.id) throw new Error("No business found. Complete your profile first.");
    for (const file of files) {
      await commitBankFile({ name: file.name, size: file.size, blob: file }, business.id);
    }
    toast.success(`${files.length} file${files.length !== 1 ? "s" : ""} uploaded.`);
  };

  const disconnectBankStatements = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("bank_statements"),
    );
    setBankStatementMonthly([]);
    setBankStatementFiles([]);
    setBankLastSyncedAt(null);
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Bank Statements disconnected.");
      return;
    }
    const businessId = business.id;
    try {
      await supabase.from("bank_statement_monthly").delete().eq("business_id", businessId);
      await supabase.from("bank_statement_files").delete().eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert({ business_id: businessId, connected_sources: remaining }, { onConflict: "business_id" });
      if (valErr) throw valErr;
      await supabase
        .from("documents")
        .update({ uploaded: false })
        .eq("business_id", businessId)
        .eq("name", "Bank Statements (3 months)");
      toast.success("Bank Statements disconnected.");
    } catch (err) {
      throw describeDbError(err, "Bank Statements");
    }
  };

  // --- P&L Upload ------------------------------------------------------------- //

  const loadPLFiles = async (businessId: string) => {
    try {
      const { data: rows } = await supabase
        .from("pl_files")
        .select("*")
        .eq("business_id", businessId)
        .order("synced_at", { ascending: false });
      if (rows && rows.length > 0) {
        setPLFiles((rows as PLFileRow[]).map(mapPLFileRow));
        setPLLastSyncedAt((rows as PLFileRow[])[0].synced_at);
      }
    } catch {
      // Silently degrade — table may not exist on older deploys
    }
  };

  const commitPLFile = async (
    fileInfo: { name: string; size: number; blob?: File },
    businessId: string,
  ) => {
    const nowISO = new Date().toISOString();
    setPLLastSyncedAt(nowISO);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "pl_upload"])),
    }));

    if (!isSupabaseConfigured || !user) return;

    let filePath: string | null = null;
    if (fileInfo.blob) {
      const fileId = crypto.randomUUID();
      const storagePath = `${user.id}/${fileId}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("pl-uploads")
        .upload(storagePath, fileInfo.blob, { contentType: "application/pdf", upsert: false });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
      filePath = storagePath;
    }

    const { data: fileRow, error: fileErr } = await supabase
      .from("pl_files")
      .insert({
        business_id: businessId,
        file_name: fileInfo.name,
        file_size: fileInfo.size,
        file_path: filePath,
        synced_at: nowISO,
      })
      .select()
      .single();
    if (fileErr) throw describeDbError(fileErr, "P&L Upload");
    setPLFiles((prev) => [mapPLFileRow(fileRow as PLFileRow), ...prev]);

    const sources = Array.from(new Set([...business.connectedSources, "pl_upload"]));
    const { error: valErr } = await supabase
      .from("valuation_data")
      .upsert({ business_id: businessId, connected_sources: sources }, { onConflict: "business_id" });
    if (valErr) throw describeDbError(valErr, "P&L Upload");

    await supabase
      .from("documents")
      .update({ uploaded: true })
      .eq("business_id", businessId)
      .eq("name", "Profit & Loss Statement (12 months)");
  };

  const uploadPL = async (files: File[]) => {
    if (!business.id) throw new Error("No business found. Complete your profile first.");
    for (const file of files) {
      await commitPLFile({ name: file.name, size: file.size, blob: file }, business.id);
    }
    toast.success(`${files.length} file${files.length !== 1 ? "s" : ""} uploaded.`);
  };

  const disconnectPL = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("pl_upload"),
    );
    setPLFiles([]);
    setPLLastSyncedAt(null);
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("P&L disconnected.");
      return;
    }
    const businessId = business.id;
    try {
      await supabase.from("pl_files").delete().eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert({ business_id: businessId, connected_sources: remaining }, { onConflict: "business_id" });
      if (valErr) throw valErr;
      await supabase
        .from("documents")
        .update({ uploaded: false })
        .eq("business_id", businessId)
        .eq("name", "Profit & Loss Statement (12 months)");
      toast.success("P&L disconnected.");
    } catch (err) {
      throw describeDbError(err, "P&L Upload");
    }
  };

  // `opts.silent` suppresses the success toast (used by background re-saves, e.g.
  // the profile auto-tidy, which surface their own message). Errors always toast.
  const updateBusiness = async (
    updatedFields: Partial<BusinessData>,
    opts?: { silent?: boolean },
  ) => {
    const updated = { ...business, ...updatedFields };
    setBusiness(updated);
    localStorage.setItem(CACHE_BUSINESS, JSON.stringify(updated));

    if (!isSupabaseConfigured || !user || !business.id) {
      if (!opts?.silent)
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
      if (!opts?.silent)
        toast.success("Successfully synced business details to database!");
      return true;
    } catch (err: unknown) {
      console.error("Failed to update business in Supabase:", err);
      toast.error("Failed to sync updates to the cloud database.");
      return false;
    }
  };

  // Persist a freshly pulled dataset to Supabase + local cache/state. Shared by
  // both connectors. `creds` records how to refresh later (custom-app Admin
  // token vs ExitEcom Analytic connection key). `incremental` means only new
  // rows were pulled, so the canonical set is re-read from Supabase afterwards.
  const commitSync = async (
    result: ShopifySyncResult,
    creds: {
      source: "custom_app" | "analytic";
      shopDomain: string;
      accessToken: string | null;
      connectionKey: string | null;
    },
    incremental: boolean,
  ) => {
    // Reflect immediately in local state (works even without Supabase).
    setStore(result.shop);
    if (!incremental) {
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
          access_token: creds.accessToken,
          connection_key: creds.connectionKey,
          source: creds.source,
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
    setStoreCreds(creds);

    // Refresh the local cache + state with canonical data. A full sync already
    // holds the complete dataset in `result`; an incremental sync only pulled
    // new rows, so re-read the merged set from Supabase.
    const arrays = incremental
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

  // Connect / refresh a store via the custom-app connector (Admin API token).
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

    return commitSync(
      result,
      {
        source: "custom_app",
        shopDomain: result.shop.shopDomain,
        accessToken,
        connectionKey: null,
      },
      !!sinceISO,
    );
  };

  // Connect / refresh via the ExitEcom Analytic connector. The connection key
  // is exchanged for the full dataset server-side; this connector always does a
  // full pull (the backend returns the complete dataset each time).
  const syncStoreViaKey = async (connectionKey: string) => {
    const result = await syncViaConnectionKeyFn({ data: { connectionKey } });

    return commitSync(
      result,
      {
        source: "analytic",
        shopDomain: result.shop.shopDomain,
        accessToken: null,
        connectionKey,
      },
      false,
    );
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
        .select("shop_domain, access_token, connection_key, source")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error);
      if (!data?.access_token && !data?.connection_key) {
        throw new Error("No stored Shopify credentials — reconnect the store.");
      }
      creds = {
        source: (data.source as "custom_app" | "analytic") ?? "custom_app",
        shopDomain: data.shop_domain,
        accessToken: data.access_token ?? null,
        connectionKey: data.connection_key ?? null,
      };
      setStoreCreds(creds);
    }

    if (creds.source === "analytic") {
      if (!creds.connectionKey) {
        throw new Error(
          "No stored connection key — reconnect via your ExitEcom Analytic key.",
        );
      }
      return syncStoreViaKey(creds.connectionKey);
    }

    if (!creds.accessToken) {
      throw new Error("No stored Shopify credentials — reconnect the store.");
    }
    return syncStore(creds.shopDomain, creds.accessToken, { incremental });
  };

  // Disconnect Shopify: delete all stored Shopify data + credentials, drop the
  // source, and clear local state/cache. A previously computed report is left as
  // a stale snapshot — the user can re-run once data is reconnected.
  const disconnectShopify = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("shopify"),
    );

    // Clear local state/cache immediately (works even without Supabase).
    setStore(null);
    setOrders([]);
    setProducts([]);
    setCustomers([]);
    setLastSyncedAt(null);
    setStoreCreds(null);
    clearShopifyCache();
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Shopify disconnected.");
      return;
    }

    const businessId = business.id;
    try {
      // Child rows first (FK cascade would handle it, but be explicit).
      await supabase
        .from("shopify_orders")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("shopify_products")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("shopify_customers")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("shopify_stores")
        .delete()
        .eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: remaining },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
      toast.success("Shopify disconnected.");
    } catch (err) {
      throw describeDbError(err);
    }
  };

  // Persist a freshly pulled Meta dataset to Supabase + local cache/state.
  // Shared by both Meta connectors. `creds` records how to refresh later (the
  // pasted token, or the OAuth long-lived token). Meta connectors always do a
  // full pull (the API returns the whole reporting window each time), so there is
  // no incremental path — the monthly + campaign sets are replaced wholesale.
  const commitMetaSync = async (
    result: MetaSyncResult,
    creds: {
      source: "direct" | "oauth";
      adAccountId: string;
      accessToken: string | null;
      connectionKey: string | null;
    },
  ) => {
    // Reflect immediately in local state (works even without Supabase).
    setMetaAccount(result.account);
    setMetaMonthly(result.monthly);
    setMetaCampaigns(result.campaigns);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "meta"])),
      missingSources: b.missingSources.filter(
        (s) => s.toLowerCase() !== "meta",
      ),
    }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Meta Ads synced (local sandbox).");
      return result;
    }

    const businessId = business.id;
    const nowISO = new Date().toISOString();

    try {
      const { error: acctErr } = await supabase.from("meta_accounts").upsert(
        {
          business_id: businessId,
          ad_account_id: result.account.adAccountId,
          access_token: creds.accessToken,
          connection_key: creds.connectionKey,
          source: creds.source,
          name: result.account.name,
          currency: result.account.currency,
          timezone: result.account.timezone,
          account_status: result.account.accountStatus,
          last_synced_at: nowISO,
          synced_at: nowISO,
        },
        { onConflict: "business_id" },
      );
      if (acctErr) throw acctErr;

      // Replace the prior window so removed campaigns/months don't linger.
      await supabase
        .from("meta_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("meta_campaigns")
        .delete()
        .eq("business_id", businessId);

      await upsertChunked(
        "meta_monthly_insights",
        result.monthly.map((m) => ({
          business_id: businessId,
          month: m.month,
          spend: m.spend,
          impressions: m.impressions,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversionValue,
          roas: m.roas,
          synced_at: nowISO,
        })),
        "business_id,month",
      );

      await upsertChunked(
        "meta_campaigns",
        result.campaigns.map((c) => ({
          business_id: businessId,
          meta_campaign_id: c.metaCampaignId,
          name: c.name,
          objective: c.objective,
          status: c.status,
          spend: c.spend,
          conversions: c.conversions,
          conversion_value: c.conversionValue,
          roas: c.roas,
          synced_at: nowISO,
        })),
        "business_id,meta_campaign_id",
      );

      const sources = Array.from(
        new Set([...business.connectedSources, "meta"]),
      );
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: sources },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
    } catch (err) {
      throw describeDbError(err, "Meta");
    }

    setMetaLastSyncedAt(nowISO);
    setMetaCreds(creds);
    writeMetaCache({
      businessId,
      account: result.account,
      lastSyncedAt: nowISO,
      monthly: result.monthly,
      campaigns: result.campaigns,
    });

    return result;
  };

  // Connect / refresh a Meta ad account via the direct-token connector.
  const syncMeta = async (adAccountId: string, accessToken: string) => {
    const result = await syncMetaAdAccountFn({
      data: { adAccountId, accessToken },
    });
    return commitMetaSync(result, {
      source: "direct",
      adAccountId: result.account.adAccountId,
      accessToken,
      connectionKey: null,
    });
  };

  // Commit a dataset pulled via the in-app OAuth flow. The OAuth callback has
  // already exchanged the code for a long-lived token and picked an ad account;
  // here we run the same pull as the direct path and store it with source 'oauth'
  // so a later refresh reuses the stored token.
  const syncMetaViaOAuth = async (adAccountId: string, accessToken: string) => {
    const result = await syncMetaAdAccountFn({
      data: { adAccountId, accessToken },
    });
    return commitMetaSync(result, {
      source: "oauth",
      adAccountId: result.account.adAccountId,
      accessToken,
      connectionKey: null,
    });
  };

  // Refresh using stored Meta credentials (fetched from Supabase on demand —
  // never cached in the browser, mirroring resyncStore). Both the direct and
  // OAuth paths store a long-lived access token, so refresh is identical.
  const resyncMeta = async () => {
    let creds = metaCreds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a Meta ad account first.");
      }
      const { data, error } = await supabase
        .from("meta_accounts")
        .select("ad_account_id, access_token, source")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error, "Meta");
      if (!data?.access_token) {
        throw new Error("No stored Meta credentials — reconnect the account.");
      }
      creds = {
        source: (data.source as "direct" | "oauth") ?? "direct",
        adAccountId: data.ad_account_id,
        accessToken: data.access_token ?? null,
        connectionKey: null,
      };
      setMetaCreds(creds);
    }

    if (!creds.accessToken) {
      throw new Error("No stored Meta credentials — reconnect the account.");
    }
    return syncMeta(creds.adAccountId, creds.accessToken);
  };

  // TEMPORARY — fire one real ads_read call for Meta App Review. Remove later.
  const runMetaApiCall = async () => {
    let creds = metaCreds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a Meta ad account first.");
      }
      const { data, error } = await supabase
        .from("meta_accounts")
        .select("ad_account_id, access_token, source")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error, "Meta");
      if (!data?.access_token) {
        throw new Error("No stored Meta credentials — reconnect the account.");
      }
      creds = {
        source: (data.source as "direct" | "oauth") ?? "direct",
        adAccountId: data.ad_account_id,
        accessToken: data.access_token ?? null,
        connectionKey: null,
      };
      setMetaCreds(creds);
    }
    if (!creds.accessToken) {
      throw new Error("No stored Meta credentials — reconnect the account.");
    }
    return runMetaApiCallFn({
      data: { adAccountId: creds.adAccountId, accessToken: creds.accessToken },
    });
  };

  // Disconnect Meta: delete all stored Meta data + credentials, drop the source,
  // and clear local state/cache. Mirrors disconnectShopify.
  const disconnectMeta = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("meta"),
    );

    setMetaAccount(null);
    setMetaMonthly([]);
    setMetaCampaigns([]);
    setMetaLastSyncedAt(null);
    setMetaCreds(null);
    clearMetaCache();
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Meta Ads disconnected.");
      return;
    }

    const businessId = business.id;
    try {
      await supabase
        .from("meta_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("meta_campaigns")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("meta_accounts")
        .delete()
        .eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: remaining },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
      toast.success("Meta Ads disconnected.");
    } catch (err) {
      throw describeDbError(err, "Meta");
    }
  };

  // --- GA4 (web analytics) ---------------------------------------------------
  // Read the raw GA4 tables (monthly insights + channel breakdown) from Supabase.
  const fetchGA4Arrays = async (businessId: string) => {
    const [
      { data: monthlyRows, error: mErr },
      { data: channelRows, error: cErr },
    ] = await Promise.all([
      supabase
        .from("ga4_monthly_insights")
        .select("*")
        .eq("business_id", businessId)
        .order("month", { ascending: true }),
      supabase
        .from("ga4_channels")
        .select("*")
        .eq("business_id", businessId)
        .order("sessions", { ascending: false }),
    ]);
    const err = mErr || cErr;
    if (err) throw err;
    return {
      monthly: ((monthlyRows ?? []) as GA4MonthlyRow[]).map(mapGA4MonthlyRow),
      channels: ((channelRows ?? []) as GA4ChannelRow[]).map(mapGA4ChannelRow),
    };
  };

  // Load the raw GA4 data. Mirrors loadGoogleData: warm cache serves locally, a
  // cold load reads the account row (+ credentials) and arrays from Supabase
  // once, then caches them. Degrades silently if the tables are absent/empty.
  const loadGA4Data = async (businessId: string) => {
    try {
      const cache = readGA4Cache();
      if (cache && cache.businessId === businessId && cache.account) {
        setGA4Account(cache.account);
        setGA4LastSyncedAt(cache.lastSyncedAt);
        setGA4Monthly(cache.monthly);
        setGA4Channels(cache.channels);
        return;
      }

      const { data: acctRow, error: acctError } = await supabase
        .from("ga4_accounts")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();

      if (acctError) {
        console.warn("[GA4 data] not available yet:", acctError.message);
        return;
      }

      if (!acctRow) {
        setGA4Account(null);
        setGA4LastSyncedAt(null);
        setGA4Creds(null);
        setGA4Monthly([]);
        setGA4Channels([]);
        clearGA4Cache();
        return;
      }

      const accountMeta: RawGA4Account = {
        propertyId: acctRow.property_id,
        name: acctRow.name ?? "",
        currency: acctRow.currency ?? "",
        timezone: acctRow.timezone ?? "",
        propertyType: acctRow.property_type ?? "",
      };
      setGA4Account(accountMeta);
      setGA4LastSyncedAt(acctRow.last_synced_at ?? null);
      setGA4Creds(
        acctRow.refresh_token
          ? {
              source: (acctRow.source as "oauth" | "manual") ?? "oauth",
              propertyId: acctRow.property_id,
              refreshToken: acctRow.refresh_token ?? null,
            }
          : null,
      );

      const arrays = await fetchGA4Arrays(businessId);
      setGA4Monthly(arrays.monthly);
      setGA4Channels(arrays.channels);
      writeGA4Cache({
        businessId,
        account: accountMeta,
        lastSyncedAt: acctRow.last_synced_at ?? null,
        ...arrays,
      });
    } catch (err) {
      console.warn("[GA4 data] load skipped:", err);
    }
  };

  // Persist a freshly pulled GA4 dataset to Supabase + local cache/state.
  // Stores the durable refresh token for later refresh. Source slug is "ga4"
  // (never anything containing "google" — the Google Ads connector keys off
  // .includes("google") and would otherwise clobber this on disconnect).
  const commitGA4Sync = async (
    result: GA4SyncResult,
    creds: {
      source: "oauth" | "manual";
      propertyId: string;
      refreshToken: string | null;
    },
  ) => {
    setGA4Account(result.account);
    setGA4Monthly(result.monthly);
    setGA4Channels(result.channels);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "ga4"])),
      missingSources: b.missingSources.filter((s) => s.toLowerCase() !== "ga4"),
    }));

    if (!isSupabaseConfigured || !user) {
      toast.success("GA4 synced (local sandbox).");
      return result;
    }

    // The OAuth popup may resolve before the business row is in state — fetch
    // the id directly rather than silently skipping the write.
    let businessId = business.id;
    if (!businessId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      businessId = biz?.id ?? "";
    }
    if (!businessId) {
      toast.success("GA4 synced (local sandbox).");
      return result;
    }
    const nowISO = new Date().toISOString();

    try {
      const { error: acctErr } = await supabase.from("ga4_accounts").upsert(
        {
          business_id: businessId,
          property_id: result.account.propertyId,
          refresh_token: creds.refreshToken,
          source: creds.source,
          name: result.account.name,
          currency: result.account.currency,
          timezone: result.account.timezone,
          property_type: result.account.propertyType,
          last_synced_at: nowISO,
          synced_at: nowISO,
        },
        { onConflict: "business_id" },
      );
      if (acctErr) throw acctErr;

      await supabase
        .from("ga4_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("ga4_channels")
        .delete()
        .eq("business_id", businessId);

      await upsertChunked(
        "ga4_monthly_insights",
        result.monthly.map((m) => ({
          business_id: businessId,
          month: m.month,
          sessions: m.sessions,
          total_users: m.totalUsers,
          new_users: m.newUsers,
          conversions: m.conversions,
          conversion_rate: m.conversionRate,
          purchase_revenue: m.purchaseRevenue,
          transactions: m.transactions,
          synced_at: nowISO,
        })),
        "business_id,month",
      );

      await upsertChunked(
        "ga4_channels",
        result.channels.map((c) => ({
          business_id: businessId,
          channel: c.channel,
          sessions: c.sessions,
          conversions: c.conversions,
          purchase_revenue: c.purchaseRevenue,
          session_share: c.sessionShare,
          synced_at: nowISO,
        })),
        "business_id,channel",
      );

      const sources = Array.from(
        new Set([...business.connectedSources, "ga4"]),
      );
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: sources },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
    } catch (err) {
      throw describeDbError(err, "GA4");
    }

    setGA4LastSyncedAt(nowISO);
    setGA4Creds(creds);
    writeGA4Cache({
      businessId,
      account: result.account,
      lastSyncedAt: nowISO,
      monthly: result.monthly,
      channels: result.channels,
    });

    return result;
  };

  const syncGA4WithSource = async (
    source: "oauth" | "manual",
    propertyId: string,
    refreshToken: string,
  ) => {
    const result = await syncGA4Fn({ data: { propertyId, refreshToken } });
    return commitGA4Sync(result, {
      source,
      propertyId: result.account.propertyId,
      refreshToken,
    });
  };

  // Connect / refresh via the manual connector (pasted property id + refresh token).
  const syncGA4 = (propertyId: string, refreshToken: string) =>
    syncGA4WithSource("manual", propertyId, refreshToken);

  // Commit a dataset pulled via the in-app OAuth flow.
  const syncGA4ViaOAuth = (propertyId: string, refreshToken: string) =>
    syncGA4WithSource("oauth", propertyId, refreshToken);

  // Refresh using the stored GA4 refresh token (fetched from Supabase on demand).
  const resyncGA4 = async () => {
    let creds = ga4Creds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a GA4 property first.");
      }
      const { data, error } = await supabase
        .from("ga4_accounts")
        .select("property_id, refresh_token, source")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error, "GA4");
      if (!data?.refresh_token) {
        throw new Error("No stored GA4 credentials — reconnect the property.");
      }
      creds = {
        source: (data.source as "oauth" | "manual") ?? "oauth",
        propertyId: data.property_id,
        refreshToken: data.refresh_token ?? null,
      };
      setGA4Creds(creds);
    }
    if (!creds.refreshToken) {
      throw new Error("No stored GA4 credentials — reconnect the property.");
    }
    return syncGA4(creds.propertyId, creds.refreshToken);
  };

  // Disconnect GA4: delete all stored GA4 data + credentials, drop the source,
  // and clear local state/cache.
  const disconnectGA4 = async () => {
    const remaining = business.connectedSources.filter(
      (s) => s.toLowerCase() !== "ga4",
    );

    setGA4Account(null);
    setGA4Monthly([]);
    setGA4Channels([]);
    setGA4LastSyncedAt(null);
    setGA4Creds(null);
    clearGA4Cache();
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("GA4 disconnected.");
      return;
    }

    const businessId = business.id;
    try {
      await supabase
        .from("ga4_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("ga4_channels")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("ga4_accounts")
        .delete()
        .eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: remaining },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
      toast.success("GA4 disconnected.");
    } catch (err) {
      throw describeDbError(err, "GA4");
    }
  };

  // Persist a freshly pulled Google Ads dataset to Supabase + local cache/state.
  // Mirrors commitMetaSync; stores the durable refresh token for later refresh.
  const commitGoogleSync = async (
    result: GoogleSyncResult,
    creds: {
      source: "oauth" | "manual";
      customerId: string;
      refreshToken: string | null;
      loginCustomerId: string | null;
    },
  ) => {
    setGoogleAccount(result.account);
    setGoogleMonthly(result.monthly);
    setGoogleCampaigns(result.campaigns);
    setBusiness((b) => ({
      ...b,
      connectedSources: Array.from(new Set([...b.connectedSources, "google"])),
      missingSources: b.missingSources.filter(
        (s) => s.toLowerCase() !== "google",
      ),
    }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Google Ads synced (local sandbox).");
      return result;
    }

    const businessId = business.id;
    const nowISO = new Date().toISOString();

    try {
      const { error: acctErr } = await supabase.from("google_accounts").upsert(
        {
          business_id: businessId,
          customer_id: result.account.customerId,
          refresh_token: creds.refreshToken,
          login_customer_id: creds.loginCustomerId,
          source: creds.source,
          name: result.account.name,
          currency: result.account.currency,
          timezone: result.account.timezone,
          account_status: result.account.accountStatus,
          last_synced_at: nowISO,
          synced_at: nowISO,
        },
        { onConflict: "business_id" },
      );
      if (acctErr) throw acctErr;

      await supabase
        .from("google_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("google_campaigns")
        .delete()
        .eq("business_id", businessId);

      await upsertChunked(
        "google_monthly_insights",
        result.monthly.map((m) => ({
          business_id: businessId,
          month: m.month,
          spend: m.spend,
          impressions: m.impressions,
          clicks: m.clicks,
          conversions: m.conversions,
          conversion_value: m.conversionValue,
          roas: m.roas,
          synced_at: nowISO,
        })),
        "business_id,month",
      );

      await upsertChunked(
        "google_campaigns",
        result.campaigns.map((c) => ({
          business_id: businessId,
          google_campaign_id: c.googleCampaignId,
          name: c.name,
          channel_type: c.channelType,
          status: c.status,
          spend: c.spend,
          conversions: c.conversions,
          conversion_value: c.conversionValue,
          roas: c.roas,
          synced_at: nowISO,
        })),
        "business_id,google_campaign_id",
      );

      const sources = Array.from(
        new Set([...business.connectedSources, "google"]),
      );
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: sources },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
    } catch (err) {
      throw describeDbError(err, "Google");
    }

    setGoogleLastSyncedAt(nowISO);
    setGoogleCreds(creds);
    writeGoogleCache({
      businessId,
      account: result.account,
      lastSyncedAt: nowISO,
      monthly: result.monthly,
      campaigns: result.campaigns,
    });

    return result;
  };

  // Shared implementation for both connection paths — only the source label differs.
  const syncGoogleWithSource = async (
    source: "oauth" | "manual",
    customerId: string,
    refreshToken: string,
    loginCustomerId?: string | null,
  ) => {
    const result = await syncGoogleAdsFn({
      data: {
        customerId,
        refreshToken,
        loginCustomerId: loginCustomerId ?? undefined,
      },
    });
    return commitGoogleSync(result, {
      source,
      customerId: result.account.customerId,
      refreshToken,
      loginCustomerId: loginCustomerId ?? null,
    });
  };

  // Connect / refresh via the manual connector (pasted customer id + refresh token).
  const syncGoogle = (
    customerId: string,
    refreshToken: string,
    loginCustomerId?: string | null,
  ) => syncGoogleWithSource("manual", customerId, refreshToken, loginCustomerId);

  // Commit a dataset pulled via the in-app OAuth flow.
  const syncGoogleViaOAuth = (
    customerId: string,
    refreshToken: string,
    loginCustomerId?: string | null,
  ) => syncGoogleWithSource("oauth", customerId, refreshToken, loginCustomerId);

  // Refresh using stored Google credentials (the refresh token, fetched from
  // Supabase on demand — never cached in the browser).
  const resyncGoogle = async () => {
    let creds = googleCreds;
    if (!creds) {
      if (!isSupabaseConfigured || !user || !business.id) {
        throw new Error("Connect a Google Ads account first.");
      }
      const { data, error } = await supabase
        .from("google_accounts")
        .select("customer_id, refresh_token, source, login_customer_id")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw describeDbError(error, "Google");
      if (!data?.refresh_token) {
        throw new Error(
          "No stored Google credentials — reconnect the account.",
        );
      }
      creds = {
        source: (data.source as "oauth" | "manual") ?? "oauth",
        customerId: data.customer_id,
        refreshToken: data.refresh_token ?? null,
        loginCustomerId: data.login_customer_id ?? null,
      };
      setGoogleCreds(creds);
    }

    if (!creds.refreshToken) {
      throw new Error("No stored Google credentials — reconnect the account.");
    }
    return syncGoogle(
      creds.customerId,
      creds.refreshToken,
      creds.loginCustomerId,
    );
  };

  // Disconnect Google: delete all stored Google data + credentials, drop the
  // source, and clear local state/cache. Mirrors disconnectMeta.
  const disconnectGoogle = async () => {
    const remaining = business.connectedSources.filter(
      (s) => !s.toLowerCase().includes("google"),
    );

    setGoogleAccount(null);
    setGoogleMonthly([]);
    setGoogleCampaigns([]);
    setGoogleLastSyncedAt(null);
    setGoogleCreds(null);
    clearGoogleCache();
    setBusiness((b) => ({ ...b, connectedSources: remaining }));

    if (!isSupabaseConfigured || !user || !business.id) {
      toast.success("Google Ads disconnected.");
      return;
    }

    const businessId = business.id;
    try {
      await supabase
        .from("google_monthly_insights")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("google_campaigns")
        .delete()
        .eq("business_id", businessId);
      await supabase
        .from("google_accounts")
        .delete()
        .eq("business_id", businessId);
      const { error: valErr } = await supabase
        .from("valuation_data")
        .upsert(
          { business_id: businessId, connected_sources: remaining },
          { onConflict: "business_id" },
        );
      if (valErr) throw valErr;
      toast.success("Google Ads disconnected.");
    } catch (err) {
      throw describeDbError(err, "Google");
    }
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
  const isMetaConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("meta"),
  );
  const isGoogleConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("google"),
  );
  const isTikTokConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("tiktok"),
  );
  const isSnapchatConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("snapchat"),
  );
  const isGA4Connected = business.connectedSources.some(
    (s) => s.toLowerCase() === "ga4",
  );
  const isBankConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("bank_statements"),
  );
  const isPLConnected = business.connectedSources.some((s) =>
    s.toLowerCase().includes("pl_upload"),
  );

  return {
    business,
    risks,
    actions,
    documents,
    loading,
    error,
    isShopifyConnected,
    isMetaConnected,
    isGoogleConnected,
    isTikTokConnected,
    isSnapchatConnected,
    isGA4Connected,
    isBankConnected,
    isPLConnected,
    // Raw Shopify data
    store,
    orders,
    products,
    customers,
    lastSyncedAt,
    // Raw Meta Ads data
    metaAccount,
    metaMonthly,
    metaCampaigns,
    metaLastSyncedAt,
    // Raw Google Ads data
    googleAccount,
    googleMonthly,
    googleCampaigns,
    googleLastSyncedAt,
    // Raw TikTok Ads data
    tikTokAccount,
    tikTokMonthly,
    tikTokCampaigns,
    tikTokLastSyncedAt,
    // Raw Snapchat Ads data
    snapchatAccount,
    snapchatMonthly,
    snapchatCampaigns,
    snapchatLastSyncedAt,
    // Raw GA4 (web analytics) data
    ga4Account,
    ga4Monthly,
    ga4Channels,
    ga4LastSyncedAt,
    // Bank Statements
    bankStatementMonthly,
    bankStatementFiles,
    bankLastSyncedAt,
    // P&L Upload
    plFiles,
    plLastSyncedAt,
    // Connected stores can always resync — the token is fetched on demand.
    canResync: !!store || isShopifyConnected,
    canResyncMeta: !!metaAccount || isMetaConnected,
    canResyncGoogle: !!googleAccount || isGoogleConnected,
    canResyncTikTok: !!tikTokAccount || isTikTokConnected,
    canResyncSnapchat: !!snapchatAccount || isSnapchatConnected,
    canResyncGA4: !!ga4Account || isGA4Connected,
    // Actions
    refetch: fetchData,
    updateBusiness,
    syncStore,
    syncStoreViaKey,
    resyncStore,
    disconnectShopify,
    syncMeta,
    syncMetaViaOAuth,
    resyncMeta,
    runMetaApiCall,
    disconnectMeta,
    syncGoogle,
    syncGoogleViaOAuth,
    resyncGoogle,
    disconnectGoogle,
    syncTikTok,
    syncTikTokViaOAuth,
    resyncTikTok,
    disconnectTikTok,
    syncSnapchat,
    syncSnapchatViaOAuth,
    resyncSnapchat,
    disconnectSnapchat,
    syncGA4,
    syncGA4ViaOAuth,
    resyncGA4,
    disconnectGA4,
    uploadBankStatements,
    disconnectBankStatements,
    uploadPL,
    disconnectPL,
    saveComputedReport,
  };
}

type BusinessDataValue = ReturnType<typeof useBusinessDataImpl>;

const BusinessDataContext = createContext<BusinessDataValue | undefined>(
  undefined,
);

/**
 * Provides a single shared business-data instance to the whole authenticated app subtree.
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
