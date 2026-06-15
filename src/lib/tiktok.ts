import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// TikTok Ads data sync. Mirrors src/lib/meta.ts: authenticate, pull the full
// dataset (account metadata, a monthly insight series, per-campaign breakdown),
// and hand raw rows back to the caller to persist. The Exit Score is computed
// later, on demand, from the stored data (src/lib/analytics.ts).
//
// Two connection paths, both ending in the same TikTokSyncResult + commit:
//   - direct path (syncTikTokAdsFn): the user pastes an access token + advertiser id.
//   - OAuth path  (getTikTokOAuthUrlFn + exchangeTikTokOAuthCodeFn): a real
//     in-app TikTok OAuth flow handled by this app.
//
// Key TikTok Marketing API v1.3 differences from Meta/Google:
//   - Auth header is `Access-Token: <token>` (not Bearer)
//   - Response envelope is { code: 0, data } — must check code, not HTTP status
//   - No refresh token: the access_token IS long-lived (~365 days)
//   - OAuth callback param is `auth_code` (not `code`), app param is `app_id`
//   - No monthly time_increment: pull daily (stat_time_day) and bucket to months
//
// Server-side env vars (never VITE_):
//   TIKTOK_APP_ID, TIKTOK_APP_SECRET, TIKTOK_OAUTH_REDIRECT_URI
// ---------------------------------------------------------------------------

const API_BASE_PROD    = "https://business-api.tiktok.com/open_api/v1.3";
const API_BASE_SANDBOX = "https://sandbox-ads.tiktok.com/open_api/v1.3";
const CAMPAIGN_CAP = 500;
const LOOKBACK_DAYS = 365;

function apiBase(sandboxEnv: boolean): string {
  return sandboxEnv ? API_BASE_SANDBOX : API_BASE_PROD;
}

export interface TikTokSyncInput {
  advertiserId: string;
  accessToken: string;
  sandboxEnv?: boolean;
}

export interface RawTikTokAccount {
  advertiserId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface RawTikTokMonthly {
  month: string; // YYYY-MM
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface RawTikTokCampaign {
  tikTokCampaignId: string;
  name: string;
  objectiveType: string | null;
  status: string | null;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface TikTokTotals {
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

export interface TikTokSyncResult {
  account: RawTikTokAccount;
  monthly: RawTikTokMonthly[];
  campaigns: RawTikTokCampaign[];
  totals: TikTokTotals;
  range: { since: string; until: string };
  capped: { campaigns: boolean };
  sandbox: boolean;
}

// --- Raw API response shapes ------------------------------------------------

interface TikTokEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data?: T;
}

interface ApiAdvertiserInfo {
  advertiser_id: string;
  name?: string;
  currency?: string;
  status?: string;
  timezone?: string;
}

interface ApiDailyRow {
  dimensions: { stat_time_day?: string; campaign_id?: string };
  metrics: {
    spend?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    conversion?: string | number;
    total_value?: string | number;
  };
}

interface ApiCampaignRow {
  dimensions: { campaign_id?: string };
  metrics: {
    spend?: string | number;
    conversion?: string | number;
    total_value?: string | number;
  };
}

interface ApiCampaignMeta {
  campaign_id?: string;
  campaign_name?: string;
  objective_type?: string | null;
  operation_status?: string | null;
}

interface ApiPageInfo {
  total_number: number;
  page: number;
  page_size: number;
  total_page: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tikTokHeaders(accessToken: string): Record<string, string> {
  return {
    "Access-Token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// Guard against HTML error pages (redirects, 5xx, CDN pages) that break JSON.parse.
async function safeJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      `TikTok returned an HTML page for ${label} (HTTP ${res.status}). ` +
      `This usually means the access token is missing a required permission or ` +
      `the TikTok app has not been granted reporting access. ` +
      `Check your TikTok app scopes in the developer console.`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`TikTok ${label} response could not be parsed: ${text.slice(0, 120)}`);
  }
}

// TikTok always returns HTTP 200 — the real status is in `code`. Check both.
function unwrap<T>(json: TikTokEnvelope<T>, label: string): T {
  if (json.code !== 0) {
    throw new Error(
      tikTokErrorMessage(json.code, json.message, label),
    );
  }
  if (json.data === undefined) {
    throw new Error(`TikTok API returned no data for ${label}.`);
  }
  return json.data;
}

function tikTokErrorMessage(code: number, msg: string, label: string): string {
  const base = `TikTok ${label} failed (code ${code})`;
  // QPS limit errors reuse code 40100 — detect by message content first.
  if (msg.toLowerCase().includes("qps")) {
    return `TikTok rate limit reached — too many requests per second. Please wait a moment and try again. (${base}: ${msg})`;
  }
  const hint = hintForCode(code);
  return hint ? `${hint} (${base}: ${msg})` : `${base}: ${msg}`;
}

function hintForCode(code: number): string {
  switch (code) {
    case 40001:
      return "A required parameter is missing or has the wrong type. Check your advertiser ID format.";
    case 40002:
      return "One or more metric or dimension names are invalid for this account or data level.";
    case 40100:
      return "The advertiser ID is invalid or not accessible with this token.";
    case 40105:
      return "The access token is incorrect or has been revoked. Generate a new token in the TikTok Marketing API portal and reconnect.";
    case 40300:
      return "Your TikTok app doesn't have permission to read this account. Check the app's scopes and ensure it has the Reporting / Ad Account Read permission.";
    case 50002:
      return "The TikTok API is temporarily unavailable. Please try again shortly.";
    default:
      return "";
  }
}

function mapAccountStatus(status: string | undefined): string {
  if (!status) return "unknown";
  return status
    .replace(/^(STATUS_|ADVERTISER_STATUS_)/, "")
    .toLowerCase();
}

function isSandboxCreds(advertiserId: string, accessToken: string): boolean {
  const h = `${advertiserId} ${accessToken}`.toLowerCase();
  return h.includes("test") || h.includes("demo") || h.includes("sandbox");
}

function computeTotals(monthly: RawTikTokMonthly[]): TikTokTotals {
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

// Retry a call up to maxAttempts times when TikTok returns a QPS rate-limit error.
async function withQpsRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("qps") && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("TikTok rate limit — max retries exceeded.");
}

// Paginate the reporting endpoint (GET). Returns all rows across pages up to `cap`.
// TikTok's /report/integrated/get/ is a GET endpoint — params go in the query string.
// Arrays (dimensions, metrics) are JSON-encoded as strings in the QS.
async function fetchReportPages<T>(
  body: Record<string, unknown>,
  accessToken: string,
  cap: number,
  base = API_BASE_PROD,
): Promise<{ rows: T[]; capped: boolean }> {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;
  let capped = false;

  while (page <= totalPages) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...body, page, page_size: Math.min(1000, cap) })) {
      qs.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
    // Per-page QPS retry — if rate-limited mid-pagination, back off and retry
    // just this page rather than restarting the whole report from page 1.
    const data = await withQpsRetry(async () => {
      const res = await fetch(`${base}/report/integrated/get/?${qs.toString()}`, {
        method: "GET",
        headers: { "Access-Token": accessToken, Accept: "application/json" },
      });
      const json = await safeJson<TikTokEnvelope<{
        list?: T[];
        page_info?: ApiPageInfo;
      }>>(res, "reporting");
      return unwrap(json, "reporting");
    });
    const list = data.list ?? [];
    rows.push(...(list as T[]));
    totalPages = data.page_info?.total_page ?? 1;
    if (rows.length >= cap) {
      capped = true;
      break;
    }
    page++;
  }

  return { rows: rows.slice(0, cap), capped };
}

// Try fetching a report with total_value; if TikTok rejects it as an invalid
// metric for this account/data-level (code 40002), silently retry without it.
// Detects by checking both the metric name AND the 40002 code phrase to be
// resilient to TikTok varying the exact error message wording.
function isInvalidValueMetricError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return (
    (msg.includes("total_value") || msg.includes("invalid metric")) &&
    msg.includes("40002")
  );
}

async function fetchReportWithValueFallback<T>(
  body: Record<string, unknown>,
  accessToken: string,
  cap: number,
  base: string,
): Promise<{ rows: T[]; capped: boolean; hasValue: boolean }> {
  try {
    const result = await fetchReportPages<T>(body, accessToken, cap, base);
    return { ...result, hasValue: true };
  } catch (err) {
    if (isInvalidValueMetricError(err)) {
      const fallbackBody = {
        ...body,
        metrics: (body.metrics as string[]).filter((m) => m !== "total_value"),
      };
      const result = await fetchReportPages<T>(fallbackBody, accessToken, cap, base);
      return { ...result, hasValue: false };
    }
    throw err;
  }
}

// Sandbox doesn't support AUCTION_ADVERTISER — falls back to AUCTION_CAMPAIGN
// with an extra campaign_id dimension. The downstream aggregation groups by
// stat_time_day only, so the extra dimension is transparently ignored.
async function fetchDailyWithDataLevelFallback(
  body: Record<string, unknown>,
  accessToken: string,
  cap: number,
  base: string,
): Promise<{ rows: ApiDailyRow[]; capped: boolean; hasValue: boolean }> {
  try {
    return await fetchReportWithValueFallback<ApiDailyRow>(body, accessToken, cap, base);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("40009") || msg.toLowerCase().includes("unsupported data_level")) {
      const fallbackBody = {
        ...body,
        data_level: "AUCTION_CAMPAIGN",
        dimensions: ["stat_time_day", "campaign_id"],
      };
      return fetchReportWithValueFallback<ApiDailyRow>(fallbackBody, accessToken, cap, base);
    }
    throw err;
  }
}

function readOAuthEnv() {
  return {
    appId: (process.env.TIKTOK_APP_ID ?? "").trim(),
    appSecret: (process.env.TIKTOK_APP_SECRET ?? "").trim(),
    redirectUri: (process.env.TIKTOK_OAUTH_REDIRECT_URI ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Core pull — shared by both connection paths
// ---------------------------------------------------------------------------
async function pull(
  advertiserId: string,
  accessToken: string,
  sandboxEnv = false,
): Promise<TikTokSyncResult> {
  const base = apiBase(sandboxEnv);
  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
  const startDate = toISODate(since);
  const endDate = toISODate(until);

  const dailyBody = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: ["stat_time_day"],
    metrics: ["spend", "impressions", "clicks", "conversion", "total_value"],
    start_date: startDate,
    end_date: endDate,
  };

  const campaignReportBody = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: ["campaign_id"],
    metrics: ["spend", "conversion", "total_value"],
    start_date: startDate,
    end_date: endDate,
  };

  // Sequential calls to respect TikTok's QPS limit (sandbox = 1 req/s).
  // Each call is wrapped in withQpsRetry so a rate-limit hit backs off and retries
  // rather than surfacing a confusing error to the user.

  // 1. Account metadata
  const acctRes = await withQpsRetry(() =>
    fetch(
      `${base}/advertiser/info/?advertiser_ids=${encodeURIComponent(`["${advertiserId}"]`)}&fields=${encodeURIComponent('["advertiser_id","name","currency","status","timezone"]')}`,
      { headers: tikTokHeaders(accessToken) },
    ).then((r) => safeJson<TikTokEnvelope<{ list?: ApiAdvertiserInfo[] }>>(r, "advertiser/info")),
  );

  // 2. Daily rows → bucket into months
  // Falls back to AUCTION_CAMPAIGN if AUCTION_ADVERTISER unsupported (sandbox),
  // and falls back again without total_value if that metric is unavailable.
  const dailyPaged = await withQpsRetry(() =>
    fetchDailyWithDataLevelFallback(dailyBody, accessToken, 3650, base),
  );

  // 3. Campaign spend breakdown (same fallback)
  const campaignReportPaged = await withQpsRetry(() =>
    fetchReportWithValueFallback<ApiCampaignRow>(campaignReportBody, accessToken, CAMPAIGN_CAP, base),
  );

  // 4. Campaign metadata (name, objective, status) — non-fatal if unavailable
  const campaignListRes = await withQpsRetry(() =>
    fetch(
      `${base}/campaign/get/?advertiser_id=${advertiserId}&page_size=200&fields=${encodeURIComponent('["campaign_id","campaign_name","objective_type","operation_status"]')}`,
      { headers: tikTokHeaders(accessToken) },
    ).then((r) => safeJson<TikTokEnvelope<{ list?: ApiCampaignMeta[] }>>(r, "campaign/get")),
  );

  // Account
  const acctData = unwrap(acctRes, "advertiser/info");
  const acct: ApiAdvertiserInfo = acctData.list?.[0] ?? { advertiser_id: advertiserId };

  // Monthly series (daily rows → aggregate by YYYY-MM)
  const byMonth = new Map<string, RawTikTokMonthly>();
  for (const row of dailyPaged.rows) {
    const day = row.dimensions?.stat_time_day ?? "";
    const month = day.slice(0, 7); // YYYY-MM
    if (!month) continue;
    const m =
      byMonth.get(month) ??
      ({
        month,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
        roas: 0,
      } as RawTikTokMonthly);
    m.spend += toNumber(row.metrics?.spend);
    m.impressions += toNumber(row.metrics?.impressions);
    m.clicks += toNumber(row.metrics?.clicks);
    m.conversions += toNumber(row.metrics?.conversion);
    m.conversionValue += toNumber(row.metrics?.total_value);
    byMonth.set(month, m);
  }
  const monthly = Array.from(byMonth.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      spend: round(m.spend),
      conversionValue: round(m.conversionValue),
      roas: m.spend > 0 ? round(m.conversionValue / m.spend) : 0,
    }));

  // Campaign metadata map
  const campaignListData = campaignListRes.code === 0 ? (campaignListRes.data?.list ?? []) : [];
  const metaById = new Map<string, ApiCampaignMeta>();
  for (const c of campaignListData) {
    if (c.campaign_id) metaById.set(c.campaign_id, c);
  }

  // Campaign spend breakdown
  const allCampaigns: RawTikTokCampaign[] = campaignReportPaged.rows.map(
    (row) => {
      const id = row.dimensions?.campaign_id ?? "";
      const meta = metaById.get(id);
      const spend = round(toNumber(row.metrics?.spend));
      const conversionValue = round(toNumber(row.metrics?.total_value));
      const conversions = toNumber(row.metrics?.conversion);
      return {
        tikTokCampaignId: id,
        name: meta?.campaign_name ?? id,
        objectiveType: meta?.objective_type ?? null,
        status: meta?.operation_status
          ? meta.operation_status
              .replace(/^CAMPAIGN_STATUS_/, "")
              .toLowerCase()
          : null,
        spend,
        conversions,
        conversionValue,
        roas: spend > 0 ? round(conversionValue / spend) : 0,
      };
    },
  );
  allCampaigns.sort((a, b) => b.spend - a.spend);
  const campaigns = allCampaigns.slice(0, CAMPAIGN_CAP);

  return {
    account: {
      advertiserId,
      name: acct.name ?? advertiserId,
      currency: acct.currency ?? "USD",
      timezone: acct.timezone ?? "",
      accountStatus: mapAccountStatus(acct.status),
    },
    monthly,
    campaigns,
    totals: computeTotals(monthly),
    range: { since: startDate, until: endDate },
    capped: { campaigns: allCampaigns.length > CAMPAIGN_CAP },
    sandbox: sandboxEnv,
  };
}

// ---------------------------------------------------------------------------
// Sandbox — deterministic demo data for local/dev use
// ---------------------------------------------------------------------------
function buildSandbox(advertiserId: string): TikTokSyncResult {
  const now = Date.now();
  const monthly: RawTikTokMonthly[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 30 * 86400000);
    const month = d.toISOString().slice(0, 7);
    const spend = round(1800 + (11 - i) * 160 + (i % 3) * 120);
    const roas = round(2.8 + ((i % 4) - 1.5) * 0.2);
    const conversionValue = round(spend * roas);
    const conversions = Math.max(1, Math.round(conversionValue / 45));
    const clicks = Math.round(spend / 0.7);
    const impressions = clicks * 55;
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

  const seeds = [
    { name: "Spark Ads — Prospecting", objective: "CONVERSIONS", share: 0.45 },
    { name: "Video Shopping Ads", objective: "SHOP_PURCHASES", share: 0.3 },
    { name: "Retargeting — 14d", objective: "CONVERSIONS", share: 0.18 },
    { name: "TopView — Awareness", objective: "REACH", share: 0.07 },
  ];
  const totals = computeTotals(monthly);
  const campaigns: RawTikTokCampaign[] = seeds.map((s, i) => {
    const spend = round(totals.spend * s.share);
    const conversionValue = round(totals.conversionValue * s.share);
    const conversions = Math.max(0, Math.round(totals.conversions * s.share));
    return {
      tikTokCampaignId: `ttcamp_${3000 + i}`,
      name: s.name,
      objectiveType: s.objective,
      status: i === seeds.length - 1 ? "disable" : "enable",
      spend,
      conversions,
      conversionValue,
      roas: spend > 0 ? round(conversionValue / spend) : 0,
    };
  });

  return {
    account: {
      advertiserId: advertiserId || "demo_advertiser",
      name: "Demo TikTok Ads Account",
      currency: "GBP",
      timezone: "Europe/London",
      accountStatus: "enable",
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
// Direct path — the user pastes an access token + advertiser id
// ---------------------------------------------------------------------------
export const syncTikTokAdsFn = createServerFn({ method: "POST" })
  .inputValidator((input: TikTokSyncInput) => input)
  .handler(async ({ data }): Promise<TikTokSyncResult> => {
    const accessToken = data.accessToken?.trim();
    const advertiserId = data.advertiserId?.trim();

    if (!advertiserId || !accessToken) {
      throw new Error(
        "An advertiser id and a TikTok access token are required.",
      );
    }

    if (isSandboxCreds(advertiserId, accessToken)) {
      return buildSandbox(advertiserId);
    }

    return pull(advertiserId, accessToken, data.sandboxEnv ?? false);
  });

// ---------------------------------------------------------------------------
// OAuth path
// ---------------------------------------------------------------------------

export interface TikTokOAuthAccount {
  advertiserId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface TikTokOAuthUrlInput {
  state: string;
}
export interface TikTokOAuthUrlResult {
  configured: boolean;
  url: string | null;
}

// Build the TikTok OAuth consent URL. `configured` false when env vars missing.
export const getTikTokOAuthUrlFn = createServerFn({ method: "POST" })
  .inputValidator((input: TikTokOAuthUrlInput) => input)
  .handler(async ({ data }): Promise<TikTokOAuthUrlResult> => {
    const { appId, redirectUri } = readOAuthEnv();
    if (!appId || !redirectUri) {
      return { configured: false, url: null };
    }
    const params = new URLSearchParams({
      app_id: appId,
      state: data.state,
      redirect_uri: redirectUri,
    });
    return {
      configured: true,
      url: `https://business-api.tiktok.com/portal/auth?${params.toString()}`,
    };
  });

export interface TikTokOAuthExchangeInput {
  authCode: string;
}
export interface TikTokOAuthExchangeResult {
  accessToken: string;
  accounts: TikTokOAuthAccount[];
}

interface ApiTokenResponse {
  access_token?: string;
  advertiser_ids?: string[];
}

// Exchange the OAuth `auth_code` for an access token and list authorised advertisers.
export const exchangeTikTokOAuthCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: TikTokOAuthExchangeInput) => input)
  .handler(async ({ data }): Promise<TikTokOAuthExchangeResult> => {
    const authCode = data.authCode?.trim();
    const { appId, appSecret, redirectUri } = readOAuthEnv();
    if (!appId || !appSecret || !redirectUri) {
      throw new Error(
        "TikTok OAuth isn't configured on this deployment (missing TIKTOK_APP_ID / TIKTOK_APP_SECRET / TIKTOK_OAUTH_REDIRECT_URI).",
      );
    }
    if (!authCode) throw new Error("Missing auth_code from TikTok.");

    // 1. Exchange auth_code for access_token
    const tokenRes = await fetch(`${API_BASE_PROD}/oauth2/access_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ app_id: appId, secret: appSecret, auth_code: authCode }),
    });
    const tokenJson = await safeJson<TikTokEnvelope<ApiTokenResponse>>(tokenRes, "token exchange");
    if (tokenJson.code !== 0 || !tokenJson.data?.access_token) {
      throw new Error(
        tikTokErrorMessage(tokenJson.code, tokenJson.message, "token exchange"),
      );
    }
    const accessToken = tokenJson.data.access_token;
    const advertiserIds = tokenJson.data.advertiser_ids ?? [];

    if (advertiserIds.length === 0) {
      throw new Error(
        "No TikTok ad accounts were authorised. Make sure you approve access to at least one advertiser account.",
      );
    }

    // 2. Fetch advertiser info for each authorised id.
    // advertiser_id must be in the fields list — TikTok only returns requested
    // fields and without it the accounts would have no ID to pass downstream.
    const idsJson = JSON.stringify(advertiserIds.slice(0, 20));
    const acctRes = await withQpsRetry(() =>
      fetch(
        `${API_BASE_PROD}/advertiser/info/?advertiser_ids=${encodeURIComponent(idsJson)}&fields=${encodeURIComponent('["advertiser_id","name","currency","status","timezone"]')}`,
        { headers: tikTokHeaders(accessToken) },
      ),
    );
    const acctJson = await safeJson<TikTokEnvelope<{ list?: ApiAdvertiserInfo[] }>>(acctRes, "advertiser/info");
    if (acctJson.code !== 0) {
      throw new Error(
        tikTokErrorMessage(acctJson.code, acctJson.message, "advertiser/info"),
      );
    }

    // Build a fallback map from the token-exchange advertiser_ids so that if
    // the info endpoint omits an entry we can still use the raw ID.
    const idFallback = new Map(advertiserIds.map((id, i) => [i, String(id)]));

    const accounts: TikTokOAuthAccount[] = (acctJson.data?.list ?? []).map(
      (a, i) => ({
        advertiserId: String(a.advertiser_id ?? idFallback.get(i) ?? ""),
        name: a.name ?? String(a.advertiser_id ?? idFallback.get(i) ?? ""),
        currency: a.currency ?? "USD",
        timezone: a.timezone ?? "",
        accountStatus: mapAccountStatus(a.status),
      }),
    ).filter((a) => a.advertiserId !== "");

    return { accessToken, accounts };
  });
