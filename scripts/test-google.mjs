// Standalone smoke test for the Google Ads connector against the LIVE API.
// Mirrors the logic in src/lib/google.ts (token refresh, listAccessibleCustomers,
// manager-expansion, account/monthly/campaign GAQL queries) but runs as a plain
// Node script so it can be exercised without a browser OAuth round-trip.
//
// Usage:
//   node scripts/test-google.mjs <REFRESH_TOKEN> [customerId] [loginCustomerId]
// or set GOOGLE_TEST_REFRESH_TOKEN in .env and run:
//   node scripts/test-google.mjs
//
// Reads GOOGLE_ADS_CLIENT_ID / _CLIENT_SECRET / _DEVELOPER_TOKEN /
// GOOGLE_ADS_API_VERSION / GOOGLE_LOGIN_CUSTOMER_ID from .env.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// --- minimal .env loader (no dependency on the app's env plugin) ------------
function loadEnv() {
  let text = "";
  try {
    text = readFileSync(join(ROOT, ".env"), "utf8");
  } catch {
    /* no .env */
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const apiVersion = (process.env.GOOGLE_ADS_API_VERSION ?? "").trim() || "v23";
const adsBase = `https://googleads.googleapis.com/${apiVersion}`;

const clientId = (process.env.GOOGLE_ADS_CLIENT_ID ?? "").trim();
const clientSecret = (process.env.GOOGLE_ADS_CLIENT_SECRET ?? "").trim();
const developerToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "").trim();
const envLoginCustomerId = (process.env.GOOGLE_LOGIN_CUSTOMER_ID ?? "").replace(
  /[^\d]/g,
  "",
);

const refreshToken =
  process.argv[2] || (process.env.GOOGLE_TEST_REFRESH_TOKEN ?? "").trim();
const argCustomerId = (process.argv[3] ?? "").replace(/[^\d]/g, "");
const argLoginCustomerId = (process.argv[4] ?? "").replace(/[^\d]/g, "");

const norm = (s) => (s ?? "").replace(/[^\d]/g, "");
const microsToCurrency = (m) => (Number(m) || 0) / 1_000_000;

function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg) {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
}
function step(msg) {
  console.log(`\n\x1b[1m${msg}\x1b[0m`);
}

function preflight() {
  step("Preflight — env");
  const checks = [
    ["GOOGLE_ADS_CLIENT_ID", clientId],
    ["GOOGLE_ADS_CLIENT_SECRET", clientSecret],
    ["GOOGLE_ADS_DEVELOPER_TOKEN", developerToken],
  ];
  let okAll = true;
  for (const [name, val] of checks) {
    if (val) ok(`${name} present (${val.slice(0, 6)}…)`);
    else {
      fail(`${name} MISSING`);
      okAll = false;
    }
  }
  ok(`API version ${apiVersion}`);
  if (envLoginCustomerId) ok(`GOOGLE_LOGIN_CUSTOMER_ID ${envLoginCustomerId}`);
  if (!refreshToken) {
    fail(
      "No refresh token. Pass one as argv[2] or set GOOGLE_TEST_REFRESH_TOKEN in .env.",
    );
    okAll = false;
  } else {
    ok(`Refresh token present (${refreshToken.slice(0, 8)}…)`);
  }
  return okAll;
}

async function refreshToAccessToken() {
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
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || JSON.stringify(json) || "token refresh failed",
    );
  }
  return json.access_token;
}

async function listAccessibleCustomers(accessToken) {
  const res = await fetch(`${adsBase}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`);
  const json = JSON.parse(text);
  return (json.resourceNames ?? []).map((r) => r.split("/")[1]).filter(Boolean);
}

async function searchStream(customerId, accessToken, query, loginCustomerId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const lcid = norm(loginCustomerId ?? "") || envLoginCustomerId;
  if (lcid) headers["login-customer-id"] = lcid;
  const res = await fetch(
    `${adsBase}/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }) },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`);
  const batches = JSON.parse(text);
  const rows = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    rows.push(...(b.results ?? []));
  }
  return rows;
}

const ACCOUNT_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager FROM customer LIMIT 1";
const CUSTOMER_CLIENT_QUERY =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.status, customer_client.manager FROM customer_client WHERE customer_client.manager = false LIMIT 51";
const MONTHLY_QUERY =
  "SELECT segments.month, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_365_DAYS";
const CAMPAIGN_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_365_DAYS";

async function main() {
  console.log("\x1b[1m\nGoogle Ads connector — live smoke test\x1b[0m");
  if (!preflight()) process.exit(1);

  step("1. Refresh token → access token");
  let accessToken;
  try {
    accessToken = await refreshToAccessToken();
    ok(`access token acquired (${accessToken.slice(0, 12)}…)`);
  } catch (e) {
    fail(`refresh failed: ${e.message}`);
    process.exit(1);
  }

  step("2. listAccessibleCustomers (validates developer token)");
  let seeds = [];
  try {
    seeds = await listAccessibleCustomers(accessToken);
    ok(`${seeds.length} accessible customer(s): ${seeds.join(", ") || "(none)"}`);
  } catch (e) {
    fail(e.message);
    console.log(
      "\n  Hint: a DEVELOPER_TOKEN_NOT_APPROVED here means the token is still TEST-only.",
    );
    process.exit(1);
  }

  // Resolve a concrete, queryable (non-manager) account to run metrics against.
  step("3. Resolve a queryable account");
  let target = null; // { customerId, loginCustomerId }
  if (argCustomerId) {
    target = {
      customerId: argCustomerId,
      loginCustomerId: argLoginCustomerId || null,
    };
    ok(`using account from argv: ${argCustomerId}${argLoginCustomerId ? ` (login ${argLoginCustomerId})` : ""}`);
  } else {
    for (const seedId of seeds) {
      try {
        const rows = await searchStream(seedId, accessToken, ACCOUNT_QUERY, seedId);
        const c = rows[0]?.customer ?? {};
        if (c.manager) {
          ok(`${seedId} is a manager (MCC) — expanding clients`);
          const clientRows = await searchStream(
            seedId,
            accessToken,
            CUSTOMER_CLIENT_QUERY,
            seedId,
          );
          const first = clientRows
            .map((cr) => cr.customerClient)
            .find((cc) => norm(cc?.id));
          if (first) {
            target = { customerId: norm(first.id), loginCustomerId: seedId };
            ok(`  picked client ${target.customerId} (${first.descriptiveName || "?"})`);
            break;
          }
          ok(`  (no non-manager clients under ${seedId})`);
        } else {
          target = { customerId: seedId, loginCustomerId: null };
          ok(`${seedId} is a standalone account (${c.descriptiveName || "?"})`);
          break;
        }
      } catch (e) {
        fail(`seed ${seedId}: ${e.message}`);
      }
    }
  }
  if (!target) {
    fail("Could not resolve any queryable account.");
    process.exit(1);
  }

  const { customerId, loginCustomerId } = target;

  step(`4. ACCOUNT_QUERY on ${customerId}`);
  try {
    const rows = await searchStream(customerId, accessToken, ACCOUNT_QUERY, loginCustomerId);
    const c = rows[0]?.customer ?? {};
    ok(`name="${c.descriptiveName || "?"}" currency=${c.currencyCode || "?"} tz=${c.timeZone || "?"} status=${c.status || "?"}`);
  } catch (e) {
    fail(e.message);
  }

  step(`5. MONTHLY_QUERY (LAST_365_DAYS) on ${customerId}`);
  try {
    const rows = await searchStream(customerId, accessToken, MONTHLY_QUERY, loginCustomerId);
    const byMonth = new Map();
    let totalSpend = 0;
    for (const r of rows) {
      const month = (r.segments?.month ?? "").slice(0, 7);
      const spend = microsToCurrency(r.metrics?.costMicros);
      totalSpend += spend;
      byMonth.set(month, (byMonth.get(month) ?? 0) + spend);
    }
    ok(`${rows.length} rows across ${byMonth.size} month(s); total spend ≈ ${totalSpend.toFixed(2)}`);
    const months = [...byMonth.keys()].sort();
    if (months.length) ok(`  range ${months[0]} … ${months[months.length - 1]}`);
  } catch (e) {
    fail(e.message);
  }

  step(`6. CAMPAIGN_QUERY (LAST_365_DAYS) on ${customerId}`);
  try {
    const rows = await searchStream(customerId, accessToken, CAMPAIGN_QUERY, loginCustomerId);
    const ids = new Set(rows.map((r) => r.campaign?.id).filter(Boolean));
    ok(`${rows.length} rows across ${ids.size} campaign(s)`);
    const top = rows
      .map((r) => ({
        name: r.campaign?.name,
        spend: microsToCurrency(r.metrics?.costMicros),
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);
    for (const t of top) ok(`  ${t.name}: ${t.spend.toFixed(2)}`);
  } catch (e) {
    fail(e.message);
  }

  console.log("\n\x1b[1m\x1b[32mDone.\x1b[0m\n");
}

main().catch((e) => {
  console.error("\n\x1b[31mUnexpected error:\x1b[0m", e);
  process.exit(1);
});
