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
const LOOKBACK_DAYS = 365;
// Snapchat exposes only `spend` at the ad-account level, so the monthly series is
// built from account-level DAY spend (authoritative total spend, ~13 windows) and
// conversion metrics come from per-campaign TOTAL stats (one request per campaign).
// Cap the campaign fan-out and the in-flight concurrency to stay well under the
// serverless function time limit.
const CAMPAIGN_CAP = 100;
const STATS_CONCURRENCY = 8;

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

// Snapchat wraps every list item as { sub_request_status, <entity>: {...} }, where
// the entity key differs per endpoint (organization / adaccount / timeseries_stat /
// total_stat / campaign). unwrapEntries() pulls the inner objects out uniformly.
interface SnapchatAdAccountRaw {
  id: string;
  name?: string;
  currency?: string;
  timezone?: string;
  status?: string;
}

interface SnapchatOrg {
  id: string;
  name?: string;
  // with_ad_accounts=true inlines accounts UNWRAPPED. Some responses wrap them
  // like the standalone endpoint, so each item may also carry an `adaccount`.
  ad_accounts?: Array<
    SnapchatAdAccountRaw & { adaccount?: SnapchatAdAccountRaw }
  >;
}

interface SnapchatStatFields {
  impressions?: number;
  swipes?: number;
  spend?: number;
  conversion_purchases?: number;
  conversion_purchases_value?: number;
}

interface OrgEntry {
  organization?: SnapchatOrg;
}

interface AdAccountEntry {
  adaccount?: SnapchatAdAccountRaw;
}

// DAY granularity → timeseries_stat (a series of buckets); TOTAL → total_stat (one bucket).
interface TimeseriesStatEntry {
  timeseries_stat?: {
    id?: string;
    granularity?: string;
    timeseries?: Array<{
      start_time?: string;
      end_time?: string;
      stats?: SnapchatStatFields;
    }>;
  };
}

interface TotalStatEntry {
  total_stat?: {
    id?: string;
    stats?: SnapchatStatFields;
  };
}

interface CampaignEntry {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    objective?: string;
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

// DAY-granularity stats are capped at 31 days per request AND require start/end
// times aligned to midnight in the ad account's timezone (ISO 8601 with offset).
// These helpers build contiguous, zone-aligned ≤28-day windows over the lookback.
function zoneOffset(at: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/([+-]\d{2}):?(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "+00:00";
}

function zonedMidnight(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD; pair it with the zone's offset at that instant.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return `${ymd}T00:00:00${zoneOffset(at, timeZone)}`;
}

// Snapchat returns IANA zone names (e.g. "America/Los_Angeles"); fall back to
// UTC if the value is missing or unrecognised so Intl can't throw mid-pull.
function safeTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function dayWindows(
  since: Date,
  until: Date,
  timeZone: string,
  maxDays = 28,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  let cursor = new Date(zonedMidnight(since, timeZone));
  const end = new Date(zonedMidnight(until, timeZone));
  while (cursor < end) {
    const next = new Date(
      Math.min(cursor.getTime() + maxDays * 86400000, end.getTime()),
    );
    windows.push({
      start: zonedMidnight(cursor, timeZone),
      end: zonedMidnight(next, timeZone),
    });
    cursor = next;
  }
  return windows;
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
    // Include Snapchat's response body — its 400s carry the actual reason
    // (invalid field, bad time boundary, …) which a bare status code hides.
    const body = await res.text().catch(() => "");
    const detail = body ? `: ${body.slice(0, 300)}` : "";
    throw new Error(
      `Snapchat API error ${res.status} for ${url.replace(API_BASE, "")}${detail}`,
    );
  }
  // Snapchat can return HTTP 200 with request_status "ERROR" (e.g. a permission
  // problem). Surface that instead of letting it read as an empty result.
  const json = (await res.json()) as T & { request_status?: string };
  const status = json.request_status;
  if (status && status.toUpperCase() !== "SUCCESS") {
    throw new Error(
      `Snapchat API request failed (request_status: ${status}) for ${url.replace(API_BASE, "")}`,
    );
  }
  return json;
}

// Retry on transient rate-limit / server errors. The campaign-level daily pull
// fans out to many requests, so back off and retry rather than failing the sync.
async function snapGetRetry<T>(
  url: string,
  accessToken: string,
  attempts = 4,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await snapGet<T>(url, accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const transient =
        /\b(429|500|503)\b/.test(msg) || msg.toLowerCase().includes("rate");
      if (transient && attempt < attempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Snapchat rate limit — max retries exceeded.");
}

// Run async tasks with bounded concurrency (Snapchat has no batch stats API, so
// the daily pull is one request per campaign-window; this caps in-flight load).
async function runLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
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
    ctr: sum.impressions > 0 ? round((sum.clicks / sum.impressions) * 100) : 0,
    cpc: sum.clicks > 0 ? round(sum.spend / sum.clicks) : 0,
  };
}

// Snapchat list items nest their entity under a per-endpoint key; lift them out,
// dropping any entry whose inner object is absent.
function unwrapEntries<E, V>(
  entries: E[] | undefined,
  pick: (entry: E) => V | undefined,
): V[] {
  return (entries ?? []).map(pick).filter((v): v is V => v != null);
}

// Tolerates both the unwrapped inline shape and a wrapped { adaccount } item.
function mapAdAccount(
  raw: SnapchatAdAccountRaw & { adaccount?: SnapchatAdAccountRaw },
): SnapchatAdAccount {
  const a = raw.adaccount ?? raw;
  return {
    adAccountId: a.id,
    name: a.name ?? a.id,
    currency: a.currency ?? "USD",
    timezone: a.timezone ?? "",
    accountStatus: (a.status ?? "ACTIVE").toLowerCase(),
  };
}

function extractTotalStats(entry?: TotalStatEntry): SnapchatStatFields {
  return entry?.total_stat?.stats ?? {};
}

function extractTimeseries(
  entry?: TimeseriesStatEntry,
): Array<{ start_time?: string; stats?: SnapchatStatFields }> {
  return entry?.timeseries_stat?.timeseries ?? [];
}

// ---------------------------------------------------------------------------
// Core pull — shared by both connection paths
// ---------------------------------------------------------------------------
// A running stats accumulator shared by the monthly and per-campaign tallies.
interface StatAcc {
  spend: number;
  impressions: number;
  clicks: number; // Snapchat "swipes"
  conversions: number;
  conversionValue: number;
}

function emptyAcc(): StatAcc {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValue: 0,
  };
}

function addStats(acc: StatAcc, s: SnapchatStatFields): void {
  acc.spend += fromMicro(s.spend);
  acc.impressions += s.impressions ?? 0;
  acc.clicks += s.swipes ?? 0;
  acc.conversions += s.conversion_purchases ?? 0;
  acc.conversionValue += s.conversion_purchases_value ?? 0;
}

async function pull(
  adAccountId: string,
  accessToken: string,
): Promise<Omit<SnapchatSyncResult, "updatedTokens">> {
  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);
  const statsFields =
    "impressions,swipes,spend,conversion_purchases,conversion_purchases_value";

  // 1. Account metadata first — its timezone determines how we align the
  //    midnight-bounded windows that Snapchat's DAY-granularity stats require.
  const acctJson = await snapGet<{
    request_status: string;
    adaccounts?: AdAccountEntry[];
  }>(`${API_BASE}/adaccounts/${adAccountId}`, accessToken);
  const acct = acctJson.adaccounts?.[0]?.adaccount;
  const timeZone = safeTimeZone(acct?.timezone);

  // DAY granularity is capped at 31 days/request and must be midnight-aligned in
  // the account timezone, so split the lookback into contiguous ≤28-day windows.
  const windows = dayWindows(since, until, timeZone);
  const rangeStart = windows[0]?.start ?? zonedMidnight(since, timeZone);
  const rangeEnd =
    windows[windows.length - 1]?.end ?? zonedMidnight(until, timeZone);

  // 2. Account-level DAY stats. Only `spend` is exposed at the account level, but
  //    it is the authoritative account spend (covers every campaign). One request
  //    per window, all in parallel → the monthly spend series.
  const dailyJsons = await Promise.all(
    windows.map((w) =>
      snapGetRetry<{
        request_status: string;
        timeseries_stats?: TimeseriesStatEntry[];
      }>(
        `${API_BASE}/adaccounts/${adAccountId}/stats?granularity=DAY&fields=spend` +
          `&start_time=${encodeURIComponent(w.start)}&end_time=${encodeURIComponent(w.end)}`,
        accessToken,
      ),
    ),
  );
  const byMonth = new Map<string, StatAcc>();
  for (const j of dailyJsons) {
    for (const row of extractTimeseries(j.timeseries_stats?.[0])) {
      const month = (row.start_time ?? "").slice(0, 7); // YYYY-MM
      if (!month) continue;
      const acc = byMonth.get(month) ?? emptyAcc();
      addStats(acc, row.stats ?? {});
      byMonth.set(month, acc);
    }
  }
  // Only spend is real per month; conversion metrics aren't available at this
  // level (they come from the campaign totals below), so they stay 0 here.
  const monthly: RawSnapchatMonthly[] = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, a]) => ({
      month,
      spend: round(a.spend),
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValue: 0,
      roas: 0,
    }));

  // 3. Campaign list, then per-campaign TOTAL stats — all metrics are available
  //    at the campaign level. These supply the real conversion value the account
  //    level can't break out, plus the per-campaign breakdown.
  const campaignsJson = await snapGet<{
    request_status: string;
    campaigns?: CampaignEntry[];
  }>(`${API_BASE}/adaccounts/${adAccountId}/campaigns?limit=250`, accessToken);
  const campaignMetas = (campaignsJson.campaigns ?? [])
    .map((e) => e.campaign)
    .filter((c): c is NonNullable<CampaignEntry["campaign"]> => !!c?.id)
    .slice(0, CAMPAIGN_CAP);
  const capped = (campaignsJson.campaigns?.length ?? 0) > CAMPAIGN_CAP;

  const campaigns: RawSnapchatCampaign[] = [];
  await runLimited(campaignMetas, STATS_CONCURRENCY, async (c) => {
    const id = c.id as string;
    try {
      const json = await snapGetRetry<{
        request_status: string;
        total_stats?: TotalStatEntry[];
      }>(
        `${API_BASE}/campaigns/${id}/stats?granularity=TOTAL&fields=${statsFields}` +
          `&start_time=${encodeURIComponent(rangeStart)}&end_time=${encodeURIComponent(rangeEnd)}`,
        accessToken,
      );
      const s = extractTotalStats(json.total_stats?.[0]);
      const spend = round(fromMicro(s.spend));
      const conversionValue = round(s.conversion_purchases_value ?? 0);
      const conversions = s.conversion_purchases ?? 0;
      const objectiveRaw =
        c.objective_v2_properties?.objective ?? c.objective ?? null;
      campaigns.push({
        snapchatCampaignId: id,
        name: c.name ?? id,
        objective: objectiveRaw
          ? objectiveRaw.toLowerCase().replace(/_/g, " ")
          : null,
        status: c.status?.toLowerCase() ?? null,
        spend,
        conversions,
        conversionValue,
        roas: spend > 0 ? round(conversionValue / spend) : 0,
      });
    } catch {
      // Skip a campaign whose stats fail after retries rather than aborting.
    }
  });
  campaigns.sort((a, b) => b.spend - a.spend);

  // Totals: spend is the authoritative account-level figure; conversion metrics
  // are summed from the campaign breakdown (the only level that exposes them).
  const totalSpend = monthly.reduce((s, m) => s + m.spend, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalValue = campaigns.reduce((s, c) => s + c.conversionValue, 0);
  const totals: SnapchatTotals = {
    spend: round(totalSpend),
    impressions: 0,
    clicks: 0,
    conversions: totalConversions,
    conversionValue: round(totalValue),
    roas: totalSpend > 0 ? round(totalValue / totalSpend) : 0,
    cpa: totalConversions > 0 ? round(totalSpend / totalConversions) : 0,
    ctr: 0,
    cpc: 0,
  };

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
    totals,
    range: { since: toISODate(since), until: toISODate(until) },
    capped: { campaigns: capped },
    sandbox: false,
  };
}

// ---------------------------------------------------------------------------
// Sandbox — deterministic demo data for local/dev use
// ---------------------------------------------------------------------------
function buildSandbox(
  adAccountId: string,
): Omit<SnapchatSyncResult, "updatedTokens"> {
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
    {
      name: "Snap Ads — Prospecting",
      objective: "awareness and engagement",
      share: 0.4,
    },
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
      const msg =
        tokenJson.error_description ??
        tokenJson.error ??
        "Token exchange failed";
      throw new Error(`Snapchat token exchange failed: ${msg}`);
    }
    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token ?? "";

    // Fetch ad accounts from organizations. Snapchat wraps each org as
    // { sub_request_status, organization: { ..., ad_accounts } }, so we unwrap
    // the `organization` object before reading its inline ad_accounts.
    const orgsJson = await snapGet<{
      request_status: string;
      organizations?: OrgEntry[];
    }>(`${API_BASE}/me/organizations?with_ad_accounts=true`, accessToken);

    const orgs = unwrapEntries(
      orgsJson.organizations,
      (e) => e.organization,
    ).filter((o) => !!o.id);

    const adAccounts: SnapchatAdAccount[] = [];
    for (const org of orgs) {
      let raws = org.ad_accounts ?? [];
      // with_ad_accounts=true didn't inline them (or this org's role omits them) —
      // fetch the org's ad accounts explicitly. Isolated so one inaccessible org
      // can't sink the whole list.
      if (raws.length === 0) {
        try {
          const accJson = await snapGet<{
            request_status: string;
            adaccounts?: AdAccountEntry[];
          }>(`${API_BASE}/organizations/${org.id}/adaccounts`, accessToken);
          raws = unwrapEntries(accJson.adaccounts, (e) => e.adaccount);
        } catch {
          // skip — org may not grant ad-account read to this token
        }
      }
      for (const raw of raws) {
        const mapped = mapAdAccount(raw);
        if (mapped.adAccountId) adAccounts.push(mapped);
      }
    }

    if (adAccounts.length === 0) {
      throw new Error(
        "No Snapchat ad accounts were found for this login. " +
          "Make sure you approve access to at least one ad account.",
      );
    }

    return { accessToken, refreshToken, adAccounts };
  });
