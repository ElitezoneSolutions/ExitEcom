import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Snapchat Ads data sync. Mirrors src/lib/tiktok.ts: authenticate, pull the
// full dataset (account metadata, monthly insight series, per-campaign
// breakdown), and hand raw rows back to the caller to persist.
//
// Two connection paths:
//   - direct path (syncSnapchatAdsFn): user pastes an access token + ad account id.
//   - OAuth path  (getSnapchatOAuthUrlFn + exchangeSnapchatOAuthCodeFn).
//
// Key Snapchat Marketing API differences from TikTok:
//   - Standard Bearer auth: `Authorization: Bearer <token>`
//   - Access tokens expire in 3600 s — a refresh_token must be stored and used
//     to obtain a new access_token on 401. updatedTokens is returned when this
//     happens so the caller can persist the refreshed credentials.
//   - Spend is in micro-currency units (spend_micro or `spend` field):
//     divide by 1,000,000 for the actual amount.
//   - Clicks are reported as `swipes` (stored in the `clicks` column).
//   - Per-campaign stats require a separate GET per campaign (no batch report).
//   - OAuth callback param is `code` (standard), state key is `snapchat_oauth_state`.
//
// Server-side env vars (never VITE_):
//   SNAPCHAT_CLIENT_ID, SNAPCHAT_CLIENT_SECRET, SNAPCHAT_REDIRECT_URI
// ---------------------------------------------------------------------------

const API_BASE = "https://adsapi.snapchat.com/v1";
const ACCOUNTS_BASE = "https://accounts.snapchat.com/login/oauth2";
const CAMPAIGN_CAP = 100;
const LOOKBACK_DAYS = 365;

// --- Exported types ---------------------------------------------------------

export interface SnapchatSyncInput {
  adAccountId: string;
  accessToken: string;
  refreshToken?: string | null;
}

export interface RawSnapchatAccount {
  adAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface RawSnapchatMonthly {
  month: string; // YYYY-MM
  spend: number;
  impressions: number;
  clicks: number; // Snapchat "swipes"
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface RawSnapchatCampaign {
  snapchatCampaignId: string;
  name: string;
  objective: string | null;
  status: string | null;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface SnapchatTotals {
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

export interface SnapchatSyncResult {
  account: RawSnapchatAccount;
  monthly: RawSnapchatMonthly[];
  campaigns: RawSnapchatCampaign[];
  totals: SnapchatTotals;
  range: { since: string; until: string };
  capped: { campaigns: boolean };
  sandbox: boolean;
  updatedTokens: { accessToken: string; refreshToken: string } | null;
}

// --- Raw API shapes (internal) ----------------------------------------------

interface SnapchatTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface SnapchatOrg {
  id: string;
  name?: string;
  ad_accounts?: SnapchatAdAccountRaw[];
}

interface SnapchatAdAccountRaw {
  id: string;
  name?: string;
  currency?: string;
  timezone?: string;
  status?: string;
}

interface SnapchatStatsItem {
  sub_request_status?: string;
  timeseries_stats?: {
    id?: string;
    granularity?: string;
    stats?: SnapchatStatFields;
    timeseries?: Array<{
      start_time?: string;
      end_time?: string;
      stats?: SnapchatStatFields;
    }>;
  };
}

interface SnapchatStatFields {
  impressions?: number;
  swipes?: number;
  spend?: number;
  conversion_purchases?: number;
  conversion_purchases_value?: number;
}

interface SnapchatCampaignItem {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    objective_v2_properties?: { objective?: string };
  };
}

// --- Helpers ----------------------------------------------------------------

function snapHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toISODateTime(d: Date): string {
  return d.toISOString().replace(".000Z", "-0000");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function fromMicro(v: number | undefined): number {
  return typeof v === "number" ? v / 1_000_000 : 0;
}

function isSandboxCreds(adAccountId: string, accessToken: string): boolean {
  const h = `${adAccountId} ${accessToken}`.toLowerCase();
  return h.includes("test") || h.includes("demo") || h.includes("sandbox");
}

function readOAuthEnv() {
  return {
    clientId: (process.env.SNAPCHAT_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.SNAPCHAT_CLIENT_SECRET ?? "").trim(),
    redirectUri: (process.env.SNAPCHAT_REDIRECT_URI ?? "").trim(),
  };
}

// Throw a typed auth error when Snapchat returns HTTP 401 so pull can retry.
class SnapchatAuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SnapchatAuthError";
  }
}

async function snapGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: snapHeaders(accessToken) });
  if (res.status === 401) {
    throw new SnapchatAuthError(
      "Snapchat access token expired or invalid. Attempting to refresh.",
    );
  }
  if (!res.ok) {
    throw new Error(
      `Snapchat API error ${res.status} for ${url.replace(API_BASE, "")}`,
    );
  }
  return res.json() as Promise<T>;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${ACCOUNTS_BASE}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as SnapchatTokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(
      "Your Snapchat session has expired and the automatic token refresh failed. " +
        "Please reconnect your Snapchat Ads account.",
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
  };
}

function computeTotals(monthly: RawSnapchatMonthly[]): SnapchatTotals {
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
    ctr:
      sum.impressions > 0
        ? round((sum.clicks / sum.impressions) * 100)
        : 0,
    cpc: sum.clicks > 0 ? round(sum.spend / sum.clicks) : 0,
  };
}

function extractStats(item?: SnapchatStatsItem): SnapchatStatFields {
  return item?.timeseries_stats?.stats ?? {};
}

function extractTimeseries(
  item?: SnapchatStatsItem,
): Array<{ start_time?: string; stats?: SnapchatStatFields }> {
  return item?.timeseries_stats?.timeseries ?? [];
}

// ---------------------------------------------------------------------------
// Core pull — shared by both connection paths
// ---------------------------------------------------------------------------
async function pull(
  adAccountId: string,
  accessToken: string,
): Promise<Omit<SnapchatSyncResult, "updatedTokens">> {
  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
  const startTime = toISODateTime(since);
  const endTime = toISODateTime(until);
  const statsFields =
    "impressions,swipes,spend,conversion_purchases,conversion_purchases_value";

  // 1. Account metadata + 2. Daily stats — in parallel
  const [acctJson, dailyJson, campaignsJson] = await Promise.all([
    snapGet<{ request_status: string; adaccount?: SnapchatAdAccountRaw }>(
      `${API_BASE}/adaccounts/${adAccountId}`,
      accessToken,
    ),
    snapGet<{ request_status: string; stats?: SnapchatStatsItem[] }>(
      `${API_BASE}/adaccounts/${adAccountId}/stats` +
        `?granularity=DAY&fields=${statsFields}&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`,
      accessToken,
    ),
    snapGet<{ request_status: string; campaigns?: SnapchatCampaignItem[] }>(
      `${API_BASE}/adaccounts/${adAccountId}/campaigns?limit=250`,
      accessToken,
    ),
  ]);

  // Account
  const acct = acctJson.adaccount;

  // Monthly series — aggregate daily timeseries to YYYY-MM buckets
  const dailyRows = extractTimeseries(dailyJson.stats?.[0]);
  const byMonth = new Map<string, RawSnapchatMonthly>();
  for (const row of dailyRows) {
    const day = row.start_time?.slice(0, 10) ?? ""; // YYYY-MM-DD
    const month = day.slice(0, 7); // YYYY-MM
    if (!month) continue;
    const s = row.stats ?? {};
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
      } as RawSnapchatMonthly);
    m.spend += fromMicro(s.spend);
    m.impressions += s.impressions ?? 0;
    m.clicks += s.swipes ?? 0;
    m.conversions += s.conversion_purchases ?? 0;
    m.conversionValue += s.conversion_purchases_value ?? 0;
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

  // Campaign list (capped at CAMPAIGN_CAP)
  const campaignList = (campaignsJson.campaigns ?? []).slice(0, CAMPAIGN_CAP);
  const capped = (campaignsJson.campaigns?.length ?? 0) > CAMPAIGN_CAP;

  // Per-campaign TOTAL stats — all in parallel
  const campaignStats = await Promise.all(
    campaignList.map(async ({ campaign: c }) => {
      if (!c?.id) return null;
      try {
        const json = await snapGet<{
          request_status: string;
          stats?: SnapchatStatsItem[];
        }>(
          `${API_BASE}/campaigns/${c.id}/stats` +
            `?granularity=TOTAL&fields=${statsFields}&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`,
          accessToken,
        );
        const s = extractStats(json.stats?.[0]);
        const spend = round(fromMicro(s.spend));
        const conversionValue = round(s.conversion_purchases_value ?? 0);
        const conversions = s.conversion_purchases ?? 0;
        return {
          snapchatCampaignId: c.id,
          name: c.name ?? c.id,
          objective:
            c.objective_v2_properties?.objective?.toLowerCase().replace(/_/g, " ") ?? null,
          status: c.status?.toLowerCase() ?? null,
          spend,
          conversions,
          conversionValue,
          roas: spend > 0 ? round(conversionValue / spend) : 0,
        } satisfies RawSnapchatCampaign;
      } catch {
        return null;
      }
    }),
  );

  const campaigns = campaignStats
    .filter((c): c is RawSnapchatCampaign => c !== null)
    .sort((a, b) => b.spend - a.spend);

  return {
    account: {
      adAccountId,
      name: acct?.name ?? adAccountId,
      currency: acct?.currency ?? "USD",
      timezone: acct?.timezone ?? "",
      accountStatus: (acct?.status ?? "ACTIVE").toLowerCase(),
    },
    monthly,
    campaigns,
    totals: computeTotals(monthly),
    range: { since: toISODate(since), until: toISODate(until) },
    capped: { campaigns: capped },
    sandbox: false,
  };
}

// ---------------------------------------------------------------------------
// Sandbox — deterministic demo data for local/dev use
// ---------------------------------------------------------------------------
function buildSandbox(adAccountId: string): Omit<SnapchatSyncResult, "updatedTokens"> {
  const now = Date.now();
  const monthly: RawSnapchatMonthly[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 30 * 86400000);
    const month = d.toISOString().slice(0, 7);
    const spend = round(1500 + (11 - i) * 140 + (i % 3) * 100);
    const roas = round(2.6 + ((i % 4) - 1.5) * 0.2);
    const conversionValue = round(spend * roas);
    const conversions = Math.max(1, Math.round(conversionValue / 50));
    const clicks = Math.round(spend / 0.9);
    const impressions = clicks * 60;
    monthly.push({ month, spend, impressions, clicks, conversions, conversionValue, roas });
  }

  const seeds = [
    { name: "Snap Ads — Prospecting", objective: "awareness and engagement", share: 0.4 },
    { name: "Story Ads — Retargeting 7d", objective: "sales", share: 0.35 },
    { name: "Collection Ads — Catalogue", objective: "sales", share: 0.18 },
    { name: "Dynamic Ads — Lookalike", objective: "traffic", share: 0.07 },
  ];
  const totals = computeTotals(monthly);
  const campaigns: RawSnapchatCampaign[] = seeds.map((s, i) => {
    const spend = round(totals.spend * s.share);
    const conversionValue = round(totals.conversionValue * s.share);
    const conversions = Math.max(0, Math.round(totals.conversions * s.share));
    return {
      snapchatCampaignId: `sccamp_${4000 + i}`,
      name: s.name,
      objective: s.objective,
      status: i === seeds.length - 1 ? "paused" : "active",
      spend,
      conversions,
      conversionValue,
      roas: spend > 0 ? round(conversionValue / spend) : 0,
    };
  });

  return {
    account: {
      adAccountId: adAccountId || "demo_snapchat",
      name: "Demo Snapchat Ads Account",
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
// Direct path — the user pastes an access token + ad account id
// ---------------------------------------------------------------------------
export const syncSnapchatAdsFn = createServerFn({ method: "POST" })
  .inputValidator((input: SnapchatSyncInput) => input)
  .handler(async ({ data }): Promise<SnapchatSyncResult> => {
    const adAccountId = data.adAccountId?.trim();
    const accessToken = data.accessToken?.trim();
    const refreshToken = data.refreshToken?.trim() ?? null;

    if (!adAccountId || !accessToken) {
      throw new Error(
        "An ad account id and a Snapchat access token are required.",
      );
    }

    if (isSandboxCreds(adAccountId, accessToken)) {
      return { ...buildSandbox(adAccountId), updatedTokens: null };
    }

    // Try pull; auto-refresh on 401 if a refresh_token is available.
    try {
      const result = await pull(adAccountId, accessToken);
      return { ...result, updatedTokens: null };
    } catch (err) {
      if (err instanceof SnapchatAuthError && refreshToken) {
        const env = readOAuthEnv();
        if (!env.clientId || !env.clientSecret) {
          throw new Error(
            "Snapchat access token expired. Re-enter your token to reconnect.",
          );
        }
        const newTokens = await refreshAccessToken(
          refreshToken,
          env.clientId,
          env.clientSecret,
        );
        const result = await pull(adAccountId, newTokens.accessToken);
        return { ...result, updatedTokens: newTokens };
      }
      throw err;
    }
  });

// ---------------------------------------------------------------------------
// OAuth path
// ---------------------------------------------------------------------------

export interface SnapchatAdAccount {
  adAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface SnapchatOAuthUrlInput {
  state: string;
}
export interface SnapchatOAuthUrlResult {
  configured: boolean;
  url: string | null;
}

export const getSnapchatOAuthUrlFn = createServerFn({ method: "POST" })
  .inputValidator((input: SnapchatOAuthUrlInput) => input)
  .handler(async ({ data }): Promise<SnapchatOAuthUrlResult> => {
    const { clientId, redirectUri } = readOAuthEnv();
    if (!clientId || !redirectUri) {
      return { configured: false, url: null };
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "snapchat-marketing-api",
      state: data.state,
    });
    return {
      configured: true,
      url: `${ACCOUNTS_BASE}/authorize?${params.toString()}`,
    };
  });

export interface SnapchatOAuthExchangeInput {
  code: string;
}
export interface SnapchatOAuthExchangeResult {
  accessToken: string;
  refreshToken: string;
  adAccounts: SnapchatAdAccount[];
}

export const exchangeSnapchatOAuthCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: SnapchatOAuthExchangeInput) => input)
  .handler(async ({ data }): Promise<SnapchatOAuthExchangeResult> => {
    const code = data.code?.trim();
    const { clientId, clientSecret, redirectUri } = readOAuthEnv();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Snapchat OAuth isn't configured on this deployment (missing " +
          "SNAPCHAT_CLIENT_ID / SNAPCHAT_CLIENT_SECRET / SNAPCHAT_REDIRECT_URI).",
      );
    }
    if (!code) throw new Error("Missing authorization code from Snapchat.");

    // Exchange code for tokens
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch(`${ACCOUNTS_BASE}/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenJson = (await tokenRes.json()) as SnapchatTokenResponse;
    if (!tokenRes.ok || !tokenJson.access_token) {
      const msg = tokenJson.error_description ?? tokenJson.error ?? "Token exchange failed";
      throw new Error(`Snapchat token exchange failed: ${msg}`);
    }
    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token ?? "";

    // Fetch ad accounts from organizations
    const orgsJson = await snapGet<{
      request_status: string;
      organizations?: SnapchatOrg[];
    }>(
      `${API_BASE}/me/organizations?with_ad_accounts=true`,
      accessToken,
    );

    const adAccounts: SnapchatAdAccount[] = (orgsJson.organizations ?? [])
      .flatMap((org) => org.ad_accounts ?? [])
      .map((a) => ({
        adAccountId: a.id,
        name: a.name ?? a.id,
        currency: a.currency ?? "USD",
        timezone: a.timezone ?? "",
        accountStatus: (a.status ?? "ACTIVE").toLowerCase(),
      }));

    if (adAccounts.length === 0) {
      throw new Error(
        "No Snapchat ad accounts were found for this login. " +
          "Make sure you approve access to at least one ad account.",
      );
    }

    return { accessToken, refreshToken, adAccounts };
  });
