import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Meta (Facebook/Instagram) Ads data sync.
//
// Connecting an ad account does ONE job: authenticate, pull the full dataset
// (account metadata, a monthly insight series, per-campaign breakdown), and hand
// the raw rows back to the caller to persist. No normalization into a score, no
// AI — the Exit Score is computed later, on demand, from the stored data (see
// src/lib/analytics.ts). This mirrors src/lib/shopify.ts exactly.
//
// Unlike Shopify there is no self-serve "paste an Admin token" path: the Meta
// Marketing API requires a registered App + secret + OAuth. So we provide two
// connection paths, both ending in the same MetaSyncResult + commitMetaSync:
//   - direct path (syncMetaAdAccountFn): the user pastes a long-lived access
//     token + ad-account id they generated themselves.
//   - OAuth path  (getMetaOAuthUrlFn + exchangeMetaOAuthCodeFn): a real in-app
//     Facebook OAuth flow. The App ID/Secret live in THIS app's server env and
//     are used only inside these server functions — the redirect URI is a route
//     on this app's own origin (/meta-oauth-callback), no external service.
// ---------------------------------------------------------------------------

const API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;
const CAMPAIGN_CAP = 500;
// Default reporting window: trailing 365 days, so the monthly series covers a
// full year for trend/seasonality scoring.
const LOOKBACK_DAYS = 365;

// Meta returns conversion data inside `actions`/`action_values` arrays keyed by
// action_type. These are the purchase-style types we treat as a "conversion".
const PURCHASE_ACTION_TYPES = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
];

export interface MetaSyncInput {
  adAccountId: string;
  accessToken: string;
}

export interface RawMetaAccount {
  adAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface RawMetaMonthly {
  month: string; // YYYY-MM
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface RawMetaCampaign {
  metaCampaignId: string;
  name: string;
  objective: string | null;
  status: string | null;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface MetaTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
}

export interface MetaSyncResult {
  account: RawMetaAccount;
  monthly: RawMetaMonthly[];
  campaigns: RawMetaCampaign[];
  totals: MetaTotals;
  range: { since: string; until: string };
  capped: { campaigns: boolean };
  sandbox: boolean;
}

// --- Raw Graph API shapes (subset of fields we request) ---------------------
interface ApiActionEntry {
  action_type: string;
  value: string;
}
interface ApiInsightRow {
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: ApiActionEntry[];
  action_values?: ApiActionEntry[];
  purchase_roas?: ApiActionEntry[];
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
}
interface ApiCampaign {
  id: string;
  name: string;
  objective?: string | null;
  status?: string | null;
}
interface ApiAccount {
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}
interface ApiPaging {
  paging?: { next?: string };
}

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Meta's account_status is a numeric enum; map the ones worth surfacing.
function mapAccountStatus(status: number | undefined): string {
  switch (status) {
    case 1:
      return "active";
    case 2:
      return "disabled";
    case 3:
      return "unsettled";
    case 7:
      return "pending_risk_review";
    case 9:
      return "in_grace_period";
    case 101:
      return "closed";
    default:
      return status != null ? `status_${status}` : "unknown";
  }
}

// Accept "act_123", "123", or a full URL fragment; normalize to "act_<id>".
function normalizeAdAccountId(raw: string): string {
  const id = raw
    .trim()
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/\/+$/, "");
  if (!id) return "";
  return id.startsWith("act_") ? id : `act_${id.replace(/^act/, "")}`;
}

// Sum the values of matching action types out of an actions/action_values array.
function sumActions(
  entries: ApiActionEntry[] | undefined,
  types: string[],
): number {
  if (!entries) return 0;
  let total = 0;
  for (const e of entries) {
    if (types.includes(e.action_type)) total += toNumber(e.value);
  }
  return total;
}

// purchase_roas is itself an array of {action_type, value}; take the best match.
function extractRoas(entries: ApiActionEntry[] | undefined): number {
  if (!entries || entries.length === 0) return 0;
  const match = entries.find((e) =>
    PURCHASE_ACTION_TYPES.includes(e.action_type),
  );
  return toNumber((match ?? entries[0]).value);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Graph API cursor pagination lives in a `paging.next` URL (fully-formed, token
// already embedded), unlike Shopify's Link header. Follow it until exhausted.
async function fetchPagedJson(
  initialUrl: string,
  cap: number,
): Promise<{ rows: ApiInsightRow[]; capped: boolean }> {
  const rows: ApiInsightRow[] = [];
  let url: string | null = initialUrl;
  let capped = false;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(metaErrorMessage(res.status));
    }
    const json = (await res.json()) as { data?: ApiInsightRow[] } & ApiPaging;
    rows.push(...(json.data ?? []));
    if (rows.length >= cap) {
      capped = true;
      break;
    }
    url = json.paging?.next ?? null;
  }

  return { rows: rows.slice(0, cap), capped };
}

function metaErrorMessage(status: number): string {
  if (status === 401 || status === 403 || status === 400) {
    return "Meta rejected the request. Check the access token has the ads_read permission and the ad-account id is correct (it looks like act_1234567890).";
  }
  return `Could not reach the Meta Marketing API (returned ${status}). Please try again shortly.`;
}

function isSandboxCreds(adAccountId: string, accessToken: string): boolean {
  const haystack = `${adAccountId} ${accessToken}`.toLowerCase();
  return (
    haystack.includes("test") ||
    haystack.includes("demo") ||
    haystack.includes("sandbox")
  );
}

function computeTotals(monthly: RawMetaMonthly[]): MetaTotals {
  const sum = monthly.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      conversions: acc.conversions + m.conversions,
      conversionValue: acc.conversionValue + m.conversionValue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );
  return {
    spend: round(sum.spend),
    impressions: sum.impressions,
    clicks: sum.clicks,
    conversions: sum.conversions,
    conversionValue: round(sum.conversionValue),
    roas: sum.spend > 0 ? round(sum.conversionValue / sum.spend) : 0,
    cpa: sum.conversions > 0 ? round(sum.spend / sum.conversions) : 0,
    ctr: sum.impressions > 0 ? round((sum.clicks / sum.impressions) * 100) : 0,
    cpc: sum.clicks > 0 ? round(sum.spend / sum.clicks) : 0,
  };
}

// ---------------------------------------------------------------------------
// Deterministic sandbox data so local/demo flows work without a real ad account.
// ---------------------------------------------------------------------------
function buildSandbox(adAccountId: string): MetaSyncResult {
  const now = Date.now();
  const monthly: RawMetaMonthly[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 30 * 86400000);
    const month = d.toISOString().slice(0, 7);
    // Gently growing spend with a believable ~2.6x ROAS and seasonal wobble.
    const spend = round(3000 + (11 - i) * 220 + (i % 3) * 180);
    const roas = round(2.4 + ((i % 4) - 1.5) * 0.18);
    const conversionValue = round(spend * roas);
    const conversions = Math.max(1, Math.round(conversionValue / 58));
    const clicks = Math.round(spend / 0.9);
    const impressions = clicks * 42;
    monthly.push({
      month,
      spend,
      impressions,
      clicks,
      conversions,
      conversionValue,
      roas,
    });
  }

  const campaignSeeds = [
    { name: "Prospecting — Broad", objective: "OUTCOME_SALES", share: 0.46 },
    { name: "Retargeting — 30d", objective: "OUTCOME_SALES", share: 0.3 },
    { name: "Advantage+ Shopping", objective: "OUTCOME_SALES", share: 0.18 },
    { name: "Brand Awareness", objective: "OUTCOME_AWARENESS", share: 0.06 },
  ];
  const totals = computeTotals(monthly);
  const campaigns: RawMetaCampaign[] = campaignSeeds.map((c, i) => {
    const spend = round(totals.spend * c.share);
    const conversionValue = round(totals.conversionValue * c.share);
    const conversions = Math.max(0, Math.round(totals.conversions * c.share));
    return {
      metaCampaignId: `camp_${1000 + i}`,
      name: c.name,
      objective: c.objective,
      status: i === campaignSeeds.length - 1 ? "PAUSED" : "ACTIVE",
      spend,
      conversions,
      conversionValue,
      roas: spend > 0 ? round(conversionValue / spend) : 0,
    };
  });

  return {
    account: {
      adAccountId: normalizeAdAccountId(adAccountId) || "act_sandbox",
      name: "Demo Ad Account",
      currency: "GBP",
      timezone: "Europe/London",
      accountStatus: "active",
    },
    monthly,
    campaigns,
    totals,
    range: {
      since: toISODate(new Date(now - LOOKBACK_DAYS * 86400000)),
      until: toISODate(new Date(now)),
    },
    capped: { campaigns: false },
    sandbox: true,
  };
}

// ---------------------------------------------------------------------------
// Direct path — the user pastes a long-lived access token + ad-account id.
// ---------------------------------------------------------------------------
export const syncMetaAdAccountFn = createServerFn({ method: "POST" })
  .inputValidator((input: MetaSyncInput) => input)
  .handler(async ({ data }): Promise<MetaSyncResult> => {
    const accessToken = data.accessToken?.trim();
    const adAccountId = normalizeAdAccountId(data.adAccountId ?? "");

    if (!adAccountId || !accessToken) {
      throw new Error(
        "An ad-account id (act_1234567890) and a Meta access token are required.",
      );
    }

    // Explicit sandbox/demo creds short-circuit to deterministic fake data.
    if (isSandboxCreds(adAccountId, accessToken)) {
      return buildSandbox(adAccountId);
    }

    const until = new Date();
    const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
    const timeRange = encodeURIComponent(
      JSON.stringify({ since: toISODate(since), until: toISODate(until) }),
    );
    const auth = `access_token=${encodeURIComponent(accessToken)}`;

    // 1. Authenticate + read account metadata. Real failures surface as errors.
    const acctRes = await fetch(
      `${GRAPH_BASE}/${adAccountId}?fields=name,currency,timezone_name,account_status&${auth}`,
      { headers: { Accept: "application/json" } },
    );
    if (!acctRes.ok) {
      throw new Error(metaErrorMessage(acctRes.status));
    }
    const acct = (await acctRes.json()) as ApiAccount;
    const currency = acct.currency ?? "USD";

    // 2. Monthly account-level insight series (trend + seasonality).
    const insightFields =
      "spend,impressions,clicks,actions,action_values,purchase_roas";
    const monthlyUrl =
      `${GRAPH_BASE}/${adAccountId}/insights?level=account&time_increment=monthly` +
      `&time_range=${timeRange}&fields=${insightFields}&limit=500&${auth}`;
    const monthlyPaged = await fetchPagedJson(monthlyUrl, 60);
    const monthly: RawMetaMonthly[] = monthlyPaged.rows.map((r) => {
      const spend = toNumber(r.spend);
      const conversionValue = sumActions(
        r.action_values,
        PURCHASE_ACTION_TYPES,
      );
      return {
        month: (r.date_start ?? "").slice(0, 7),
        spend: round(spend),
        impressions: toNumber(r.impressions),
        clicks: toNumber(r.clicks),
        conversions: sumActions(r.actions, PURCHASE_ACTION_TYPES),
        conversionValue: round(conversionValue),
        roas: extractRoas(r.purchase_roas),
      };
    });

    // 3. Per-campaign breakdown (concentration within Meta). Insights give the
    //    spend/conversions; a second call supplies objective + status.
    const campaignUrl =
      `${GRAPH_BASE}/${adAccountId}/insights?level=campaign` +
      `&time_range=${timeRange}&fields=campaign_id,campaign_name,${insightFields}&limit=200&${auth}`;
    const campaignPaged = await fetchPagedJson(campaignUrl, CAMPAIGN_CAP);

    const metaRes = await fetch(
      `${GRAPH_BASE}/${adAccountId}/campaigns?fields=id,name,objective,status&limit=500&${auth}`,
      { headers: { Accept: "application/json" } },
    );
    const metaById = new Map<string, ApiCampaign>();
    if (metaRes.ok) {
      const metaJson = (await metaRes.json()) as { data?: ApiCampaign[] };
      for (const c of metaJson.data ?? []) metaById.set(c.id, c);
    }

    const campaigns: RawMetaCampaign[] = campaignPaged.rows.map((r) => {
      const spend = toNumber(r.spend);
      const conversionValue = sumActions(
        r.action_values,
        PURCHASE_ACTION_TYPES,
      );
      const id = r.campaign_id ?? "";
      const meta = metaById.get(id);
      return {
        metaCampaignId: id,
        name: r.campaign_name ?? meta?.name ?? id,
        objective: meta?.objective ?? null,
        status: meta?.status ?? null,
        spend: round(spend),
        conversions: sumActions(r.actions, PURCHASE_ACTION_TYPES),
        conversionValue: round(conversionValue),
        roas: spend > 0 ? round(conversionValue / spend) : 0,
      };
    });

    return {
      account: {
        adAccountId,
        name: acct.name ?? adAccountId,
        currency,
        timezone: acct.timezone_name ?? "",
        accountStatus: mapAccountStatus(acct.account_status),
      },
      monthly,
      campaigns,
      totals: computeTotals(monthly),
      range: { since: toISODate(since), until: toISODate(until) },
      capped: { campaigns: campaignPaged.capped },
      sandbox: false,
    };
  });

// ---------------------------------------------------------------------------
// TEMPORARY — Meta App Review helper. Fires ONE real ads_read Graph call against
// the connected ad account so Meta's "API call(s) required" counter registers.
// Remove this (and its button/hook) once the permission is approved.
// ---------------------------------------------------------------------------
export const runMetaApiCallFn = createServerFn({ method: "POST" })
  .inputValidator((input: MetaSyncInput) => input)
  .handler(async ({ data }): Promise<{ ok: true; account: string }> => {
    const accessToken = data.accessToken?.trim();
    const adAccountId = normalizeAdAccountId(data.adAccountId ?? "");
    if (!adAccountId || !accessToken) {
      throw new Error("No stored Meta credentials — reconnect the account.");
    }
    if (isSandboxCreds(adAccountId, accessToken)) {
      throw new Error(
        "Sandbox/demo credentials don't make a real API call. Connect a real ad account.",
      );
    }
    // A read of the account node is a genuine ads_read Marketing API call.
    const res = await fetch(
      `${GRAPH_BASE}/${adAccountId}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      throw new Error(metaErrorMessage(res.status));
    }
    const json = (await res.json()) as ApiAccount;
    return { ok: true, account: json.name ?? adAccountId };
  });

// ---------------------------------------------------------------------------
// OAuth path — a real in-app Facebook OAuth flow. Two server functions:
//   1. getMetaOAuthUrlFn   — builds the Facebook consent URL (public App ID).
//   2. exchangeMetaOAuthCodeFn — swaps the returned code for a long-lived token
//      and lists the user's ad accounts.
// The App ID/Secret are read from THIS app's server env; the redirect URI is a
// route on this app's own origin. Nothing is hosted externally.
// ---------------------------------------------------------------------------

const OAUTH_SCOPE = "ads_read";

function readOAuthEnv() {
  return {
    appId: (process.env.FACEBOOK_APP_ID ?? "").trim(),
    appSecret: (process.env.FACEBOOK_APP_SECRET ?? "").trim(),
    redirectUri: (process.env.META_OAUTH_REDIRECT_URI ?? "").trim(),
  };
}

export interface MetaOAuthAccount {
  adAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface MetaOAuthUrlInput {
  state: string;
}
export interface MetaOAuthUrlResult {
  configured: boolean;
  url: string | null;
}

// Build the Facebook OAuth dialog URL. `configured` is false (and url null) when
// the App ID or redirect URI aren't set, so the UI can show a clear message
// instead of redirecting to a broken consent screen.
export const getMetaOAuthUrlFn = createServerFn({ method: "POST" })
  .inputValidator((input: MetaOAuthUrlInput) => input)
  .handler(async ({ data }): Promise<MetaOAuthUrlResult> => {
    const { appId, redirectUri } = readOAuthEnv();
    if (!appId || !redirectUri) {
      return { configured: false, url: null };
    }
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: OAUTH_SCOPE,
      response_type: "code",
      state: data.state,
    });
    return {
      configured: true,
      url: `https://www.facebook.com/${API_VERSION}/dialog/oauth?${params.toString()}`,
    };
  });

export interface MetaOAuthExchangeInput {
  code: string;
}
export interface MetaOAuthExchangeResult {
  accessToken: string;
  accounts: MetaOAuthAccount[];
}

interface ApiTokenResponse {
  access_token?: string;
  error?: { message?: string };
}
interface ApiAdAccount {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

// Exchange the OAuth `code` for a long-lived token and list the user's ad
// accounts. App Secret is used here (server-side) and never returned to the
// client. The caller then picks an account and runs the normal pull/commit.
export const exchangeMetaOAuthCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: MetaOAuthExchangeInput) => input)
  .handler(async ({ data }): Promise<MetaOAuthExchangeResult> => {
    const code = data.code?.trim();
    const { appId, appSecret, redirectUri } = readOAuthEnv();
    if (!appId || !appSecret || !redirectUri) {
      throw new Error(
        "Facebook OAuth isn't configured on this deployment (missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET / META_OAUTH_REDIRECT_URI).",
      );
    }
    if (!code) {
      throw new Error("Missing OAuth code from Facebook.");
    }

    // 1. code -> short-lived token. The redirect_uri must match the one used to
    //    start the flow (Facebook validates it).
    const shortParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const shortRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?${shortParams.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const shortJson = (await shortRes.json()) as ApiTokenResponse;
    if (!shortRes.ok || !shortJson.access_token) {
      throw new Error(
        shortJson.error?.message ||
          "Facebook rejected the authorisation. Please try connecting again.",
      );
    }

    // 2. short-lived -> long-lived token (~60 days).
    const longParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortJson.access_token,
    });
    const longRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?${longParams.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const longJson = (await longRes.json()) as ApiTokenResponse;
    // If the long-lived exchange fails for any reason, fall back to the
    // short-lived token so the connect still works (it just expires sooner).
    const accessToken = longJson.access_token || shortJson.access_token;

    // 3. List the ad accounts this token can read.
    const acctRes = await fetch(
      `${GRAPH_BASE}/me/adaccounts?fields=id,name,currency,timezone_name,account_status&limit=200&access_token=${encodeURIComponent(accessToken)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!acctRes.ok) {
      throw new Error(metaErrorMessage(acctRes.status));
    }
    const acctJson = (await acctRes.json()) as { data?: ApiAdAccount[] };
    const accounts: MetaOAuthAccount[] = (acctJson.data ?? []).map((a) => ({
      adAccountId: a.id,
      name: a.name ?? a.id,
      currency: a.currency ?? "USD",
      timezone: a.timezone_name ?? "",
      accountStatus: mapAccountStatus(a.account_status),
    }));

    return { accessToken, accounts };
  });
