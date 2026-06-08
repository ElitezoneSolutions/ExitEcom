import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Google Ads data sync. Mirrors src/lib/meta.ts: authenticate, pull the full
// dataset (account metadata, a monthly insight series, per-campaign breakdown),
// and hand raw rows back to the caller to persist. The Exit Score is computed
// later, on demand, from the stored data (src/lib/analytics.ts).
//
// Two connection paths, both ending in the same GoogleSyncResult + commit:
//   - manual path (syncGoogleAdsFn): the user pastes a customer id + a refresh
//     token they generated themselves (e.g. via the OAuth Playground).
//   - OAuth path  (getGoogleOAuthUrlFn + exchangeGoogleOAuthCodeFn): a real
//     in-app Google OAuth flow handled entirely by this app.
//
// The Google Ads API requires THREE server-side secrets (env, never VITE_):
// GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN.
// The developer token must be approved by Google (Basic access) to read live
// (non-test) accounts; until then, use the sandbox creds below.
// ---------------------------------------------------------------------------

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords";
const CAMPAIGN_CAP = 500;
const LOOKBACK_DAYS = 365;

// Google Ads API versions sunset ~monthly. Default to a current major and let it
// be overridden by env so a future sunset is a config change, not a code change.
// (As of mid-2026 the current major is v23; v20 sunset 2026-06-10.) Read inside a
// function so the value isn't baked into the client bundle.
function apiVersion(): string {
  return (process.env.GOOGLE_ADS_API_VERSION ?? "").trim() || "v23";
}
function adsBase(): string {
  return `https://googleads.googleapis.com/${apiVersion()}`;
}

export interface GoogleSyncInput {
  customerId: string;
  refreshToken: string;
  // The Manager (MCC) id to send as login-customer-id when the analysed account
  // is reached through a manager. Discovered per-connection during OAuth (never a
  // single global id), so every user's own hierarchy works. Optional for the
  // manual path / standalone accounts.
  loginCustomerId?: string;
}

export interface RawGoogleAccount {
  customerId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface RawGoogleMonthly {
  month: string; // YYYY-MM
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface RawGoogleCampaign {
  googleCampaignId: string;
  name: string;
  channelType: string | null;
  status: string | null;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export interface GoogleTotals {
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

export interface GoogleSyncResult {
  account: RawGoogleAccount;
  monthly: RawGoogleMonthly[];
  campaigns: RawGoogleCampaign[];
  totals: GoogleTotals;
  range: { since: string; until: string };
  capped: { campaigns: boolean };
  sandbox: boolean;
}

// --- Raw GAQL (REST searchStream) row shapes — note camelCase JSON keys -------
interface GaqlRow {
  customer?: {
    id?: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    status?: string;
    manager?: boolean;
  };
  customerClient?: {
    id?: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    status?: string;
    manager?: boolean;
  };
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  segments?: { month?: string };
  metrics?: {
    costMicros?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    conversions?: number;
    conversionsValue?: number;
  };
}
interface SearchStreamBatch {
  results?: GaqlRow[];
}

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Google amounts come back in micros (1,000,000 = one unit of currency).
function microsToCurrency(micros: string | number | null | undefined): number {
  return toNumber(micros) / 1_000_000;
}

// Customer ids are 10-digit; accept "123-456-7890", "1234567890", or a URL.
function normalizeCustomerId(raw: string): string {
  return (raw ?? "").replace(/[^\d]/g, "");
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Dig the specific Google Ads error out of a response body. A 403/400 from the
// Ads API wraps the real cause in a GoogleAdsFailure
// (details[].errors[].errorCode → { someError: "ENUM_VALUE" }, plus a message),
// while the top-level message is just a generic "caller does not have permission".
// Returns the most specific enum code (e.g. USER_PERMISSION_DENIED) + message.
function parseGoogleAdsFailure(body: string): {
  code: string;
  message: string;
} {
  try {
    const j = JSON.parse(body) as {
      error?: {
        message?: string;
        details?: {
          "@type"?: string;
          errors?: {
            errorCode?: Record<string, string>;
            message?: string;
          }[];
        }[];
      };
    };
    const topMessage = j.error?.message ?? "";
    for (const d of j.error?.details ?? []) {
      for (const e of d.errors ?? []) {
        // errorCode is an object with a single key, e.g.
        // { "authorizationError": "USER_PERMISSION_DENIED" }.
        const enumValue = e.errorCode
          ? Object.values(e.errorCode).find(Boolean)
          : undefined;
        if (enumValue) {
          return { code: enumValue, message: e.message ?? topMessage };
        }
        if (e.message) return { code: "", message: e.message };
      }
    }
    if (topMessage) return { code: "", message: topMessage };
  } catch {
    /* not JSON */
  }
  return { code: "", message: body.slice(0, 300) };
}

// Map a Google Ads error code to a one-line, actionable hint so the user knows
// exactly what to change. Falls back to "" when we have no specific advice.
function hintForCode(code: string): string {
  switch (code) {
    case "USER_PERMISSION_DENIED":
      return "The Google account you signed in with has no access to this Ads account. Make sure that exact account is added as a user on the Ads account (or its manager), and that you picked an account it can actually see.";
    case "DEVELOPER_TOKEN_NOT_APPROVED":
      return "Your developer token still has TEST access, so it can only read test accounts. Apply for Basic access in your manager account's API Center and wait for approval.";
    case "DEVELOPER_TOKEN_PROHIBITED":
      return "This developer token isn't allowed to call the API. Use the token from the manager (MCC) account where it was issued.";
    case "NOT_ADS_USER":
      return "The signed-in Google account isn't a Google Ads user at all. Connect with the account that has access to the Ads account.";
    case "CUSTOMER_NOT_ENABLED":
      return "This Ads account is cancelled or not fully set up, so its data can't be read. Pick an active account.";
    case "CUSTOMER_NOT_FOUND":
    case "INVALID_CUSTOMER_ID":
      return "That customer id couldn't be found. Reconnect and pick an account from the list.";
    default:
      return "";
  }
}

function metricsError(status: number, body = ""): string {
  const { code, message } = body
    ? parseGoogleAdsFailure(body)
    : { code: "", message: "" };
  const hint = hintForCode(code);
  // When we recognise the specific code, lead with the actionable hint.
  if (hint) {
    const label = code ? `${code}: ` : "";
    return `${hint} (${label}${message})`;
  }
  const detail = message ? ` ${code ? `${code}: ` : ""}${message}` : "";
  if (status === 401 || status === 403) {
    return `Google rejected the request — check the developer token is approved (Basic access) and the signed-in account has access to this Ads account.${detail}`;
  }
  if (status === 404) {
    return `Google Ads API returned 404 — the API version may be retired (set GOOGLE_ADS_API_VERSION to a current major), or the customer id wasn't found.${detail}`;
  }
  if (status === 400) {
    return `Google rejected the query (400). This often means a Manager/MCC account was selected (it has no campaigns) or login-customer-id is required.${detail}`;
  }
  return `Could not reach the Google Ads API (returned ${status}).${detail}`;
}

function isSandboxCreds(customerId: string, refreshToken: string): boolean {
  const haystack = `${customerId} ${refreshToken}`.toLowerCase();
  return (
    haystack.includes("test") ||
    haystack.includes("demo") ||
    haystack.includes("sandbox")
  );
}

function readOAuthEnv() {
  return {
    clientId: (process.env.GOOGLE_ADS_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.GOOGLE_ADS_CLIENT_SECRET ?? "").trim(),
    developerToken: (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "").trim(),
    redirectUri: (process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "").trim(),
    // Optional: the Manager (MCC) customer id to send as login-customer-id when
    // the analysed account is accessed through a manager. Digits only.
    loginCustomerId: (process.env.GOOGLE_LOGIN_CUSTOMER_ID ?? "").replace(
      /[^\d]/g,
      "",
    ),
  };
}

function computeTotals(monthly: RawGoogleMonthly[]): GoogleTotals {
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

// --- Token + API helpers ----------------------------------------------------

// Exchange a long-lived refresh token for a short-lived access token.
async function refreshToAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = readOAuthEnv();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth isn't configured (missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET).",
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
        "Google rejected the refresh token. Reconnect your Google Ads account.",
    );
  }
  return json.access_token;
}

// Run a GAQL query via searchStream and return the flattened result rows.
async function searchStream(
  customerId: string,
  accessToken: string,
  query: string,
  loginCustomerId?: string,
): Promise<GaqlRow[]> {
  const env = readOAuthEnv();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": env.developerToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  // When the analysed account is reached through a Manager, Google requires that
  // manager's id as login-customer-id. Prefer the per-connection value discovered
  // during OAuth; fall back to the optional global env default if one is set.
  const lcid = normalizeCustomerId(loginCustomerId ?? "") || env.loginCustomerId;
  if (lcid) headers["login-customer-id"] = lcid;
  const res = await fetch(
    `${adsBase()}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    throw new Error(metricsError(res.status, await res.text()));
  }
  // searchStream returns a JSON array of batches, each with `results`.
  const batches = (await res.json()) as SearchStreamBatch[];
  const rows: GaqlRow[] = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    rows.push(...(b.results ?? []));
  }
  return rows;
}

const ACCOUNT_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager FROM customer LIMIT 1";
// Enumerate the non-manager client accounts beneath a manager (MCC). Run against
// the manager with login-customer-id = that manager. Used to expand a manager the
// user logs in through into the real, queryable accounts to pick from.
const CUSTOMER_CLIENT_QUERY =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.status, customer_client.manager FROM customer_client WHERE customer_client.manager = false LIMIT 51";
const MONTHLY_QUERY =
  "SELECT segments.month, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_365_DAYS";
const CAMPAIGN_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_365_DAYS";

// Core pull shared by both connection paths. Takes a live access token and the
// login-customer-id (the manager the account is reached through, if any).
async function pull(
  customerId: string,
  accessToken: string,
  loginCustomerId?: string,
): Promise<GoogleSyncResult> {
  // Fetch all three datasets in parallel — independent queries on the same customer.
  const [acctRows, monthlyRows, campaignRows] = await Promise.all([
    searchStream(customerId, accessToken, ACCOUNT_QUERY, loginCustomerId),
    searchStream(customerId, accessToken, MONTHLY_QUERY, loginCustomerId),
    searchStream(customerId, accessToken, CAMPAIGN_QUERY, loginCustomerId),
  ]);
  const c = acctRows[0]?.customer ?? {};

  // 2. Monthly series — sum campaign rows by month.
  const byMonth = new Map<string, RawGoogleMonthly>();
  for (const r of monthlyRows) {
    const month = (r.segments?.month ?? "").slice(0, 7);
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
      } as RawGoogleMonthly);
    m.spend += microsToCurrency(r.metrics?.costMicros);
    m.impressions += toNumber(r.metrics?.impressions);
    m.clicks += toNumber(r.metrics?.clicks);
    m.conversions += toNumber(r.metrics?.conversions);
    m.conversionValue += toNumber(r.metrics?.conversionsValue);
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

  // 3. Per-campaign breakdown.
  const byCampaign = new Map<string, RawGoogleCampaign>();
  for (const r of campaignRows) {
    const id = r.campaign?.id ?? "";
    if (!id) continue;
    const existing =
      byCampaign.get(id) ??
      ({
        googleCampaignId: id,
        name: r.campaign?.name ?? id,
        channelType: r.campaign?.advertisingChannelType ?? null,
        status: r.campaign?.status ?? null,
        spend: 0,
        conversions: 0,
        conversionValue: 0,
        roas: 0,
      } as RawGoogleCampaign);
    existing.spend += microsToCurrency(r.metrics?.costMicros);
    existing.conversions += toNumber(r.metrics?.conversions);
    existing.conversionValue += toNumber(r.metrics?.conversionsValue);
    byCampaign.set(id, existing);
  }
  const allCampaigns = Array.from(byCampaign.values()).map((cmp) => ({
    ...cmp,
    spend: round(cmp.spend),
    conversionValue: round(cmp.conversionValue),
    roas: cmp.spend > 0 ? round(cmp.conversionValue / cmp.spend) : 0,
  }));
  allCampaigns.sort((a, b) => b.spend - a.spend);
  const campaigns = allCampaigns.slice(0, CAMPAIGN_CAP);

  const until = new Date();
  const since = new Date(until.getTime() - LOOKBACK_DAYS * 86400000);

  return {
    account: {
      customerId,
      name: c.descriptiveName || customerId,
      currency: c.currencyCode || "USD",
      timezone: c.timeZone || "",
      accountStatus: (c.status || "unknown").toLowerCase(),
    },
    monthly,
    campaigns,
    totals: computeTotals(monthly),
    range: { since: toISODate(since), until: toISODate(until) },
    capped: { campaigns: allCampaigns.length > CAMPAIGN_CAP },
    sandbox: false,
  };
}

// ---------------------------------------------------------------------------
// Deterministic sandbox data so local/demo flows work without a real account.
// ---------------------------------------------------------------------------
function buildSandbox(customerId: string): GoogleSyncResult {
  const now = Date.now();
  const monthly: RawGoogleMonthly[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 30 * 86400000);
    const month = d.toISOString().slice(0, 7);
    const spend = round(2200 + (11 - i) * 180 + (i % 4) * 140);
    const roas = round(3.1 + ((i % 3) - 1) * 0.22);
    const conversionValue = round(spend * roas);
    const conversions = Math.max(1, Math.round(conversionValue / 72));
    const clicks = Math.round(spend / 1.4);
    const impressions = clicks * 28;
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
  const totals = computeTotals(monthly);
  const seeds = [
    { name: "Search — Brand", type: "SEARCH", share: 0.34 },
    { name: "Performance Max", type: "PERFORMANCE_MAX", share: 0.4 },
    { name: "Shopping — All Products", type: "SHOPPING", share: 0.18 },
    { name: "Display — Remarketing", type: "DISPLAY", share: 0.08 },
  ];
  const campaigns: RawGoogleCampaign[] = seeds.map((s, i) => {
    const spend = round(totals.spend * s.share);
    const conversionValue = round(totals.conversionValue * s.share);
    const conversions = Math.max(0, Math.round(totals.conversions * s.share));
    return {
      googleCampaignId: `gcamp_${2000 + i}`,
      name: s.name,
      channelType: s.type,
      status: i === seeds.length - 1 ? "PAUSED" : "ENABLED",
      spend,
      conversions,
      conversionValue,
      roas: spend > 0 ? round(conversionValue / spend) : 0,
    };
  });
  return {
    account: {
      customerId: normalizeCustomerId(customerId) || "0000000000",
      name: "Demo Google Ads Account",
      currency: "GBP",
      timezone: "Europe/London",
      accountStatus: "enabled",
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
// Manual path — user pastes a customer id + a refresh token. Both this and the
// OAuth path ultimately call here (the OAuth callback supplies the refresh token
// it just minted).
// ---------------------------------------------------------------------------
export const syncGoogleAdsFn = createServerFn({ method: "POST" })
  .inputValidator((input: GoogleSyncInput) => input)
  .handler(async ({ data }): Promise<GoogleSyncResult> => {
    const refreshToken = data.refreshToken?.trim();
    const customerId = normalizeCustomerId(data.customerId ?? "");

    if (!customerId || !refreshToken) {
      throw new Error(
        "A 10-digit customer id and a Google refresh token are required.",
      );
    }
    if (isSandboxCreds(data.customerId ?? "", refreshToken)) {
      return buildSandbox(customerId);
    }

    const accessToken = await refreshToAccessToken(refreshToken);
    const loginCustomerId = normalizeCustomerId(data.loginCustomerId ?? "") || undefined;
    return pull(customerId, accessToken, loginCustomerId);
  });

// ---------------------------------------------------------------------------
// OAuth path.
// ---------------------------------------------------------------------------
export interface GoogleOAuthAccount {
  customerId: string;
  // The manager (MCC) id to query this account through, discovered from the
  // user's own hierarchy. null for standalone (directly-accessible) accounts.
  loginCustomerId: string | null;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
}

export interface GoogleOAuthUrlInput {
  state: string;
}
export interface GoogleOAuthUrlResult {
  configured: boolean;
  url: string | null;
}

// Build the Google OAuth consent URL. `configured` is false when any of the
// client id / redirect URI / developer token is missing.
export const getGoogleOAuthUrlFn = createServerFn({ method: "POST" })
  .inputValidator((input: GoogleOAuthUrlInput) => input)
  .handler(async ({ data }): Promise<GoogleOAuthUrlResult> => {
    const { clientId, redirectUri, developerToken } = readOAuthEnv();
    if (!clientId || !redirectUri || !developerToken) {
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

export interface GoogleOAuthExchangeInput {
  code: string;
}
export interface GoogleOAuthExchangeResult {
  refreshToken: string;
  customers: GoogleOAuthAccount[];
}

// Exchange the OAuth code for a refresh token, then list the accessible
// customers (with metadata for the picker). The refresh token is what we store.
export const exchangeGoogleOAuthCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: GoogleOAuthExchangeInput) => input)
  .handler(async ({ data }): Promise<GoogleOAuthExchangeResult> => {
    const code = data.code?.trim();
    const { clientId, clientSecret, developerToken, redirectUri } = readOAuthEnv();
    if (!clientId || !clientSecret || !developerToken || !redirectUri) {
      throw new Error(
        "Google OAuth isn't configured on this deployment (missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_OAUTH_REDIRECT_URI).",
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

    // 2. List accessible customers.
    const listHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      Accept: "application/json",
    };
    const listRes = await fetch(
      `${adsBase()}/customers:listAccessibleCustomers`,
      { headers: listHeaders },
    );
    if (!listRes.ok) {
      throw new Error(metricsError(listRes.status, await listRes.text()));
    }
    const listJson = (await listRes.json()) as { resourceNames?: string[] };
    const ids = (listJson.resourceNames ?? [])
      .map((r) => r.split("/")[1])
      .filter(Boolean)
      .slice(0, 20);

    // 3. Resolve a flat list of usable (non-manager) accounts, each paired with
    //    the login-customer-id needed to query it. listAccessibleCustomers
    //    returns what this login can reach directly — frequently a Manager (MCC).
    //    We expand each manager into its client accounts so the user picks a real,
    //    queryable account, and we record the right login-customer-id PER
    //    connection (the user's own manager) — never a single global id.
    const seen = new Set<string>();
    const customers: GoogleOAuthAccount[] = [];

    const addAccount = (acct: GoogleOAuthAccount) => {
      if (!acct.customerId || seen.has(acct.customerId) || customers.length >= 50) return;
      seen.add(acct.customerId);
      customers.push(acct);
    };

    // Resolve all seeds in parallel — each is an independent API call.
    await Promise.allSettled(
      ids.map(async (seedId) => {
        // Query the seed THROUGH itself; tells us whether it's a manager.
        const rows = await searchStream(
          seedId,
          accessToken,
          ACCOUNT_QUERY,
          seedId,
        );
        const c = rows[0]?.customer ?? {};
        if (c.manager) {
          // Manager (MCC): enumerate its non-manager client accounts. Each is
          // queried through this manager, so login-customer-id = seedId.
          const clientRows = await searchStream(
            seedId,
            accessToken,
            CUSTOMER_CLIENT_QUERY,
            seedId,
          );
          for (const cr of clientRows) {
            const cc = cr.customerClient;
            const cid = normalizeCustomerId(cc?.id ?? "");
            if (!cid) continue;
            addAccount({
              customerId: cid,
              loginCustomerId: seedId,
              name: cc?.descriptiveName || cid,
              currency: cc?.currencyCode || "USD",
              timezone: cc?.timeZone || "",
              accountStatus: (cc?.status || "unknown").toLowerCase(),
            });
          }
        } else {
          // Standalone / directly-accessible account — no manager header needed.
          addAccount({
            customerId: seedId,
            loginCustomerId: null,
            name: c.descriptiveName || seedId,
            currency: c.currencyCode || "USD",
            timezone: c.timeZone || "",
            accountStatus: (c.status || "unknown").toLowerCase(),
          });
        }
        // Rejected promises are silently skipped by allSettled — seeds that
        // fail introspection are dropped rather than offered as stubs that would
        // fail again when the user tries to connect them.
      }),
    );

    return {
      refreshToken: tokenJson.refresh_token,
      customers: customers.slice(0, 50),
    };
  });
