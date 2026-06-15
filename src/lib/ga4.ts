import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Google Analytics 4 (GA4) data sync. Structurally mirrors src/lib/google.ts
// (authenticate, pull a dataset, hand raw rows back to persist), but GA4 is a
// WEB-ANALYTICS source, not an ad platform: there is no spend/ROAS. We pull a
// monthly traffic/conversion/revenue series plus a per-channel breakdown (the
// analytics analogue of a campaign breakdown). The Exit Score consumes this as
// a separate "traffic" signal (session growth + channel concentration), never
// as an ad feed — see src/lib/analytics.ts.
//
// Two connection paths, both ending in the same GA4SyncResult + commit:
//   - manual path (syncGA4Fn): the user pastes a numeric GA4 property id + a
//     refresh token they generated themselves (e.g. via the OAuth Playground).
//   - OAuth path  (getGA4OAuthUrlFn + exchangeGA4OAuthCodeFn): a real in-app
//     Google OAuth flow handled entirely by this app.
//
// OAuth credentials are REUSED from the Google Ads OAuth client
// (GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET) — the same GCP project — but
// with the read-only Analytics scope and a GA4-specific redirect URI
// (GA4_OAUTH_REDIRECT_URI). No developer token is needed. The GCP project must
// have BOTH the Analytics Data API (reports) and the Analytics Admin API
// (property listing) enabled, and the ga4-oauth-callback URL must be added to
// the OAuth client's authorized redirect URIs. See docs/ga4-setup.md.
// ---------------------------------------------------------------------------

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const OAUTH_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const CHANNEL_CAP = 50;
const LOOKBACK_DAYS = 365;
// Earliest date the GA4 Data API accepts. GA4 properties never have data this
// old, and standard aggregated reports (unlike Explorations) aren't capped by
// the property's data-retention setting, so this pulls the property's full
// history — the report returns rows only from the property's first data month.
const REPORT_START_DATE = "2015-08-14";

export interface GA4SyncInput {
  propertyId: string;
  refreshToken: string;
}

export interface RawGA4Account {
  propertyId: string;
  name: string;
  currency: string;
  timezone: string;
  // GA4 properties don't have an "account status" the way ad accounts do; we
  // surface the property type (e.g. "ordinary"/"subproperty") in its place so
  // the data page's generic account grid stays consistent with the ad pages.
  propertyType: string;
}

export interface RawGA4Monthly {
  month: string; // YYYY-MM
  sessions: number;
  totalUsers: number;
  newUsers: number;
  // GA4 renamed "conversions" to "key events" (2024+). The Data API metric is
  // `keyEvents`; we keep the buyer-friendly name `conversions` in our shape.
  conversions: number;
  conversionRate: number; // computed: conversions / sessions (0–1)
  purchaseRevenue: number;
  transactions: number;
}

// Per-channel breakdown (sessionDefaultChannelGroup) — the analytics analogue
// of an ad campaign breakdown. `sessionShare` is this channel's share of total
// sessions (0–1), used downstream for traffic-concentration risk.
export interface RawGA4Channel {
  channel: string;
  sessions: number;
  conversions: number;
  purchaseRevenue: number;
  sessionShare: number;
}

export interface GA4Totals {
  sessions: number;
  totalUsers: number;
  newUsers: number;
  conversions: number;
  conversionRate: number; // total conversions / total sessions (0–1)
  purchaseRevenue: number;
  transactions: number;
}

export interface GA4SyncResult {
  account: RawGA4Account;
  monthly: RawGA4Monthly[];
  channels: RawGA4Channel[];
  totals: GA4Totals;
  range: { since: string; until: string };
  capped: { channels: boolean };
  sandbox: boolean;
}

// --- Raw Data API runReport row shapes --------------------------------------
interface ReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
interface RunReportResponse {
  rows?: ReportRow[];
}

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Property ids are numeric. Accept "properties/123", "123", or a stray URL.
function normalizePropertyId(raw: string): string {
  return (raw ?? "").replace(/[^\d]/g, "");
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// yearMonth comes back as "YYYYMM"; turn it into our "YYYY-MM".
function yearMonthToISO(ym: string): string {
  const s = (ym ?? "").trim();
  if (s.length !== 6) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
}

// Dig the specific message out of a Google API error body. The Data/Admin APIs
// return { error: { code, message, status } }.
function parseGoogleError(body: string): { code: string; message: string } {
  try {
    const j = JSON.parse(body) as {
      error?: { status?: string; message?: string };
    };
    return {
      code: j.error?.status ?? "",
      message: j.error?.message ?? "",
    };
  } catch {
    return { code: "", message: body.slice(0, 300) };
  }
}

function metricsError(status: number, body = ""): string {
  const { code, message } = body
    ? parseGoogleError(body)
    : { code: "", message: "" };
  const detail = message ? ` ${code ? `${code}: ` : ""}${message}` : "";
  if (status === 401) {
    return `Google rejected the request (401) — the access token is invalid or expired. Reconnect your GA4 property.${detail}`;
  }
  if (status === 403) {
    return `Google denied access (403). Make sure the signed-in account can view this GA4 property, and that BOTH the Analytics Data API and Analytics Admin API are enabled in your Google Cloud project.${detail}`;
  }
  if (status === 404) {
    return `GA4 property not found (404). Reconnect and pick a property from the list.${detail}`;
  }
  if (status === 429) {
    return `Google Analytics rate limit hit (429). Wait a moment and sync again.${detail}`;
  }
  return `Could not reach the Google Analytics API (returned ${status}).${detail}`;
}

function isSandboxCreds(propertyId: string, refreshToken: string): boolean {
  const haystack = `${propertyId} ${refreshToken}`.toLowerCase();
  return (
    haystack.includes("test") ||
    haystack.includes("demo") ||
    haystack.includes("sandbox")
  );
}

// Reuse the Google Ads OAuth client (same GCP project) for the analytics scope;
// only the redirect URI is GA4-specific. No developer token is needed.
function readOAuthEnv() {
  return {
    clientId: (process.env.GOOGLE_ADS_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.GOOGLE_ADS_CLIENT_SECRET ?? "").trim(),
    redirectUri: (process.env.GA4_OAUTH_REDIRECT_URI ?? "").trim(),
  };
}

function computeTotals(monthly: RawGA4Monthly[]): GA4Totals {
  const sum = monthly.reduce(
    (acc, m) => ({
      sessions: acc.sessions + m.sessions,
      totalUsers: acc.totalUsers + m.totalUsers,
      newUsers: acc.newUsers + m.newUsers,
      conversions: acc.conversions + m.conversions,
      purchaseRevenue: acc.purchaseRevenue + m.purchaseRevenue,
      transactions: acc.transactions + m.transactions,
    }),
    {
      sessions: 0,
      totalUsers: 0,
      newUsers: 0,
      conversions: 0,
      purchaseRevenue: 0,
      transactions: 0,
    },
  );
  return {
    sessions: sum.sessions,
    totalUsers: sum.totalUsers,
    newUsers: sum.newUsers,
    conversions: sum.conversions,
    conversionRate:
      sum.sessions > 0 ? round4(sum.conversions / sum.sessions) : 0,
    purchaseRevenue: round(sum.purchaseRevenue),
    transactions: sum.transactions,
  };
}

// --- Token + API helpers ----------------------------------------------------

// Exchange a long-lived refresh token for a short-lived access token.
async function refreshToAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = readOAuthEnv();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GA4 OAuth isn't configured (missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET).",
    );
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        "Google rejected the refresh token. Reconnect your GA4 property.",
    );
  }
  return json.access_token;
}

// Fetch a single GA4 property's metadata (display name, currency, timezone).
async function fetchProperty(
  propertyId: string,
  accessToken: string,
): Promise<RawGA4Account> {
  const res = await fetch(`${ADMIN_BASE}/properties/${propertyId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(metricsError(res.status, await res.text()));
  }
  const j = (await res.json()) as {
    displayName?: string;
    currencyCode?: string;
    timeZone?: string;
    propertyType?: string;
  };
  return {
    propertyId,
    name: j.displayName || propertyId,
    currency: j.currencyCode || "USD",
    timezone: j.timeZone || "",
    propertyType: (j.propertyType || "PROPERTY_TYPE_ORDINARY")
      .replace(/^PROPERTY_TYPE_/, "")
      .toLowerCase(),
  };
}

// Run a Data API report and return the raw rows.
async function runReport(
  propertyId: string,
  accessToken: string,
  dimensions: string[],
  metrics: string[],
): Promise<ReportRow[]> {
  const res = await fetch(`${DATA_BASE}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: REPORT_START_DATE, endDate: "today" }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit: 250,
    }),
  });
  if (!res.ok) {
    throw new Error(metricsError(res.status, await res.text()));
  }
  const j = (await res.json()) as RunReportResponse;
  return j.rows ?? [];
}

// The metric request order is preserved in each row's metricValues, so we read
// by index. Keep these arrays in sync with the readers in pull().
const MONTHLY_METRICS = [
  "sessions",
  "totalUsers",
  "newUsers",
  "keyEvents",
  "purchaseRevenue",
  "ecommercePurchases",
];
const CHANNEL_METRICS = ["sessions", "keyEvents", "purchaseRevenue"];

// Core pull shared by both connection paths. Takes a live access token.
async function pull(
  propertyId: string,
  accessToken: string,
): Promise<GA4SyncResult> {
  // All three calls are independent reads on the same property — run in parallel.
  const [account, monthlyRows, channelRows] = await Promise.all([
    fetchProperty(propertyId, accessToken),
    runReport(propertyId, accessToken, ["yearMonth"], MONTHLY_METRICS),
    runReport(
      propertyId,
      accessToken,
      ["sessionDefaultChannelGroup"],
      CHANNEL_METRICS,
    ),
  ]);

  // 1. Monthly series (dimension: yearMonth -> YYYY-MM).
  const monthly: RawGA4Monthly[] = monthlyRows
    .map((r) => {
      const month = yearMonthToISO(r.dimensionValues?.[0]?.value ?? "");
      const mv = r.metricValues ?? [];
      const sessions = toNumber(mv[0]?.value);
      const conversions = toNumber(mv[3]?.value);
      return {
        month,
        sessions,
        totalUsers: toNumber(mv[1]?.value),
        newUsers: toNumber(mv[2]?.value),
        conversions,
        conversionRate: sessions > 0 ? round4(conversions / sessions) : 0,
        purchaseRevenue: round(toNumber(mv[4]?.value)),
        transactions: toNumber(mv[5]?.value),
      };
    })
    .filter((m) => m.month)
    .sort((a, b) => a.month.localeCompare(b.month));

  // 2. Per-channel breakdown (dimension: sessionDefaultChannelGroup).
  const channelsRaw = channelRows
    .map((r) => ({
      channel: r.dimensionValues?.[0]?.value || "(unknown)",
      sessions: toNumber(r.metricValues?.[0]?.value),
      conversions: toNumber(r.metricValues?.[1]?.value),
      purchaseRevenue: round(toNumber(r.metricValues?.[2]?.value)),
      sessionShare: 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
  const totalChannelSessions = channelsRaw.reduce((s, c) => s + c.sessions, 0);
  for (const c of channelsRaw) {
    c.sessionShare =
      totalChannelSessions > 0 ? round4(c.sessions / totalChannelSessions) : 0;
  }
  const channels = channelsRaw.slice(0, CHANNEL_CAP);

  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);

  return {
    account,
    monthly,
    channels,
    totals: computeTotals(monthly),
    range: { since: toISODate(since), until: toISODate(until) },
    capped: { channels: channelsRaw.length > CHANNEL_CAP },
    sandbox: false,
  };
}

// ---------------------------------------------------------------------------
// Deterministic sandbox data so local/demo flows work without a real property.
// ---------------------------------------------------------------------------
function buildSandbox(propertyId: string): GA4SyncResult {
  const now = Date.now();
  const monthly: RawGA4Monthly[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 30 * 86400000);
    const month = d.toISOString().slice(0, 7);
    const sessions = Math.round(18000 + (11 - i) * 900 + (i % 4) * 600);
    const totalUsers = Math.round(sessions * 0.78);
    const newUsers = Math.round(totalUsers * 0.62);
    const conversions = Math.round(sessions * 0.031);
    const transactions = Math.round(conversions * 0.8);
    const purchaseRevenue = round(transactions * 64);
    monthly.push({
      month,
      sessions,
      totalUsers,
      newUsers,
      conversions,
      conversionRate: sessions > 0 ? round4(conversions / sessions) : 0,
      purchaseRevenue,
      transactions,
    });
  }
  const totals = computeTotals(monthly);
  const seeds = [
    { channel: "Organic Search", share: 0.34 },
    { channel: "Paid Search", share: 0.24 },
    { channel: "Direct", share: 0.18 },
    { channel: "Organic Social", share: 0.13 },
    { channel: "Referral", share: 0.07 },
    { channel: "Email", share: 0.04 },
  ];
  const channels: RawGA4Channel[] = seeds.map((s) => ({
    channel: s.channel,
    sessions: Math.round(totals.sessions * s.share),
    conversions: Math.round(totals.conversions * s.share),
    purchaseRevenue: round(totals.purchaseRevenue * s.share),
    sessionShare: round4(s.share),
  }));
  return {
    account: {
      propertyId: normalizePropertyId(propertyId) || "000000000",
      name: "Demo GA4 Property",
      currency: "GBP",
      timezone: "Europe/London",
      propertyType: "ordinary",
    },
    monthly,
    channels,
    totals,
    range: {
      since: toISODate(new Date(now - LOOKBACK_DAYS * 86400000)),
      until: toISODate(new Date(now)),
    },
    capped: { channels: false },
    sandbox: true,
  };
}

// ---------------------------------------------------------------------------
// Manual path — user pastes a property id + a refresh token. Both this and the
// OAuth path ultimately call here (the OAuth callback supplies the refresh
// token it just minted).
// ---------------------------------------------------------------------------
export const syncGA4Fn = createServerFn({ method: "POST" })
  .inputValidator((input: GA4SyncInput) => input)
  .handler(async ({ data }): Promise<GA4SyncResult> => {
    const refreshToken = data.refreshToken?.trim();
    const propertyId = normalizePropertyId(data.propertyId ?? "");

    if (!propertyId || !refreshToken) {
      throw new Error(
        "A numeric GA4 property id and a Google refresh token are required.",
      );
    }
    if (isSandboxCreds(data.propertyId ?? "", refreshToken)) {
      return buildSandbox(propertyId);
    }

    const accessToken = await refreshToAccessToken(refreshToken);
    return pull(propertyId, accessToken);
  });

// ---------------------------------------------------------------------------
// OAuth path.
// ---------------------------------------------------------------------------
export interface GA4OAuthProperty {
  propertyId: string;
  name: string;
  account: string;
}

export interface GA4OAuthUrlInput {
  state: string;
}
export interface GA4OAuthUrlResult {
  configured: boolean;
  url: string | null;
}

// Build the Google OAuth consent URL for the analytics.readonly scope.
// `configured` is false when the (shared) client id or the GA4 redirect URI is
// missing.
export const getGA4OAuthUrlFn = createServerFn({ method: "POST" })
  .inputValidator((input: GA4OAuthUrlInput) => input)
  .handler(async ({ data }): Promise<GA4OAuthUrlResult> => {
    const { clientId, redirectUri } = readOAuthEnv();
    if (!clientId || !redirectUri) {
      return { configured: false, url: null };
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAUTH_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: data.state,
    });
    return {
      configured: true,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  });

export interface GA4OAuthExchangeInput {
  code: string;
}
export interface GA4OAuthExchangeResult {
  refreshToken: string;
  properties: GA4OAuthProperty[];
}

// Exchange the OAuth code for a refresh token, then list the GA4 properties the
// account can access (via Admin API accountSummaries) for the picker. The
// refresh token is what we store.
export const exchangeGA4OAuthCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: GA4OAuthExchangeInput) => input)
  .handler(async ({ data }): Promise<GA4OAuthExchangeResult> => {
    const code = data.code?.trim();
    const { clientId, clientSecret, redirectUri } = readOAuthEnv();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "GA4 OAuth isn't configured on this deployment (missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GA4_OAUTH_REDIRECT_URI).",
      );
    }
    if (!code) throw new Error("Missing OAuth code from Google.");

    // 1. code -> tokens (offline access yields a refresh_token).
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(
        tokenJson.error_description ||
          "Google rejected the authorisation. Please try connecting again.",
      );
    }
    if (!tokenJson.refresh_token) {
      throw new Error(
        "Google didn't return a refresh token. Remove ExitEcom from your Google account's third-party access and connect again to re-consent.",
      );
    }
    const accessToken = tokenJson.access_token;

    // 2. List accessible GA4 properties (flattened across account summaries).
    const listRes = await fetch(`${ADMIN_BASE}/accountSummaries`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!listRes.ok) {
      throw new Error(metricsError(listRes.status, await listRes.text()));
    }
    const listJson = (await listRes.json()) as {
      accountSummaries?: {
        displayName?: string;
        propertySummaries?: {
          property?: string;
          displayName?: string;
        }[];
      }[];
    };

    const properties: GA4OAuthProperty[] = [];
    const seen = new Set<string>();
    for (const acct of listJson.accountSummaries ?? []) {
      for (const ps of acct.propertySummaries ?? []) {
        const propertyId = normalizePropertyId(ps.property ?? "");
        if (!propertyId || seen.has(propertyId)) continue;
        seen.add(propertyId);
        properties.push({
          propertyId,
          name: ps.displayName || propertyId,
          account: acct.displayName || "",
        });
        if (properties.length >= 50) break;
      }
      if (properties.length >= 50) break;
    }

    return { refreshToken: tokenJson.refresh_token, properties };
  });
