// Inbound endpoint for ExitEcom Connect (connect.exitecom.com).
//
// Mounted in src/server.ts, which routes POST /api/analytic/ingest here BEFORE
// delegating to TanStack — signature verification needs the exact bytes the
// connect service signed, so the body must not be consumed first (same reason as
// the Stripe webhook).
//
// Connect pushes a store in signed parts tied together by `syncId`:
//   meta      → identifies the business + store, opens the sync, clears old rows
//   orders    ┐
//   products  ├ up to 500 rows each, any number of parts, any order
//   customers ┘
//   done      → stamps last_synced_at and marks Shopify connected
//
// Parts are chunked because a large store is several MB of JSON, which would risk
// the request-size and duration limits of a single serverless invocation.
//
// This is the PUSH half of the connector. The pull half (src/lib/shopify.ts,
// syncShopifyViaConnectionKeyFn) is the source of truth for every later refresh,
// so a failed push degrades to "data arrives on next sync", never to data loss.
//
// Server-only: imports the service-role Supabase client. Never import into
// client code.

import { getServiceClient } from "./admin/server";
import type {
  RawShopifyStore,
  RawShopifyOrder,
  RawShopifyProduct,
  RawShopifyCustomer,
} from "./shopify";

const INGEST_PATH = "/api/analytic/ingest";

/** True for the request the ingest handler should claim. */
export function isAnalyticIngestRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  return new URL(request.url).pathname === INGEST_PATH;
}

// --- Wire shapes -------------------------------------------------------------

interface MetaPart {
  syncId: string;
  part: "meta";
  businessId: string;
  connectionKey: string;
  shopDomain: string;
  shop: RawShopifyStore;
  counts?: { orders: number; products: number; customers: number };
  capped?: { orders: boolean; products: boolean; customers: boolean };
}

interface RowsPart {
  syncId: string;
  part: "orders" | "products" | "customers";
  businessId: string;
  rows: unknown[];
}

interface DonePart {
  syncId: string;
  part: "done";
  businessId: string;
}

type IngestPart = MetaPart | RowsPart | DonePart;

// --- Signature ---------------------------------------------------------------

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Web Crypto rather than node:crypto — the Nitro/Vercel fetch runtime is the
// same one the Stripe webhook uses constructEventAsync for.
async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
}

/** Constant-time string compare (no early exit on the first differing byte). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** The shared secret with ExitEcom Connect. Empty when the connector is off. */
export function connectSecret(): string {
  return (process.env.EXITECOM_LINK_SECRET ?? "").trim();
}

// --- Row mapping -------------------------------------------------------------
// Column names mirror commitSync in src/hooks/useBusinessData.tsx exactly, so a
// pushed store is byte-for-byte the same shape as a pulled one.

function orderRow(businessId: string, o: RawShopifyOrder, nowISO: string) {
  return {
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
  };
}

function productRow(businessId: string, p: RawShopifyProduct, nowISO: string) {
  return {
    business_id: businessId,
    shopify_product_id: p.shopifyProductId,
    title: p.title,
    product_type: p.productType,
    vendor: p.vendor,
    status: p.status,
    created_at: p.createdAt || null,
    variants: p.variants,
    synced_at: nowISO,
  };
}

function customerRow(
  businessId: string,
  c: RawShopifyCustomer,
  nowISO: string,
) {
  return {
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
  };
}

const ROW_TABLES = {
  orders: {
    table: "shopify_orders",
    conflict: "business_id,shopify_order_id",
    map: orderRow as (b: string, r: unknown, n: string) => object,
  },
  products: {
    table: "shopify_products",
    conflict: "business_id,shopify_product_id",
    map: productRow as (b: string, r: unknown, n: string) => object,
  },
  customers: {
    table: "shopify_customers",
    conflict: "business_id,shopify_customer_id",
    map: customerRow as (b: string, r: unknown, n: string) => object,
  },
} as const;

// --- Handlers ----------------------------------------------------------------

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// The business must exist before we write anything against its id — a valid
// signature proves the sender, not that the businessId it names is real.
async function businessExists(businessId: string): Promise<boolean> {
  const { data } = await getServiceClient()
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  return !!data;
}

async function handleMeta(part: MetaPart): Promise<Response> {
  const db = getServiceClient();
  const nowISO = new Date().toISOString();

  const { error: syncErr } = await db.from("shopify_connect_syncs").upsert(
    {
      sync_id: part.syncId,
      business_id: part.businessId,
      shop_domain: part.shopDomain,
      started_at: nowISO,
      completed_at: null,
    },
    { onConflict: "sync_id" },
  );
  if (syncErr) throw syncErr;

  const { error: storeErr } = await db.from("shopify_stores").upsert(
    {
      business_id: part.businessId,
      shop_domain: part.shop?.shopDomain || part.shopDomain,
      access_token: null,
      connection_key: part.connectionKey,
      source: "connect",
      name: part.shop?.name ?? null,
      currency: part.shop?.currency ?? null,
      country: part.shop?.country ?? null,
      plan: part.shop?.plan ?? null,
      shop_created_at: part.shop?.shopCreatedAt || null,
      synced_at: nowISO,
    },
    { onConflict: "business_id" },
  );
  if (storeErr) throw storeErr;

  // Replace rather than merge, so a store that lost orders/products doesn't keep
  // stale rows around and inflate the report.
  for (const { table } of Object.values(ROW_TABLES)) {
    const { error } = await db
      .from(table)
      .delete()
      .eq("business_id", part.businessId);
    if (error) throw error;
  }

  return json({ ok: true, syncId: part.syncId }, 200);
}

async function handleRows(part: RowsPart): Promise<Response> {
  const spec = ROW_TABLES[part.part];
  const rows = Array.isArray(part.rows) ? part.rows : [];
  if (rows.length === 0) return json({ ok: true, written: 0 }, 200);

  const nowISO = new Date().toISOString();
  const { error } = await getServiceClient()
    .from(spec.table)
    .upsert(
      rows.map((r) => spec.map(part.businessId, r, nowISO)),
      { onConflict: spec.conflict },
    );
  if (error) throw error;

  return json({ ok: true, written: rows.length }, 200);
}

async function handleDone(part: DonePart): Promise<Response> {
  const db = getServiceClient();
  const nowISO = new Date().toISOString();

  const { error: storeErr } = await db
    .from("shopify_stores")
    .update({ last_synced_at: nowISO, synced_at: nowISO })
    .eq("business_id", part.businessId);
  if (storeErr) throw storeErr;

  // Mark Shopify connected. Mirrors addConnectedSource (src/lib/connectedSources.ts),
  // reimplemented here because that helper uses the browser anon client.
  const { data: valuation } = await db
    .from("valuation_data")
    .select("connected_sources")
    .eq("business_id", part.businessId)
    .maybeSingle();
  const current: string[] = valuation?.connected_sources ?? [];
  if (!current.some((s) => s.toLowerCase() === "shopify")) {
    const { error } = await db.from("valuation_data").upsert(
      {
        business_id: part.businessId,
        connected_sources: [...current, "shopify"],
      },
      { onConflict: "business_id" },
    );
    if (error) throw error;
  }

  const { error: syncErr } = await db
    .from("shopify_connect_syncs")
    .update({ completed_at: nowISO })
    .eq("sync_id", part.syncId);
  if (syncErr) throw syncErr;

  return json({ ok: true, completed: true }, 200);
}

/**
 * Verify and process one pushed part. Always resolves to a Response (never
 * throws) so the server entry can return it directly.
 */
export async function handleAnalyticIngest(
  request: Request,
): Promise<Response> {
  const secret = connectSecret();
  if (!secret) {
    // Connector not configured on this deployment — say so rather than
    // pretending to accept the data.
    return json({ error: "Connector not configured" }, 503);
  }

  const signature = request.headers.get("x-exitecom-signature");
  if (!signature) return json({ error: "Missing signature" }, 401);

  const body = await request.text();
  if (!safeEqual(await signBody(body, secret), signature)) {
    return json({ error: "Invalid signature" }, 401);
  }

  let part: IngestPart;
  try {
    part = JSON.parse(body) as IngestPart;
  } catch {
    return json({ error: "Malformed JSON" }, 400);
  }

  if (!part?.syncId || !part?.businessId || !part?.part) {
    return json({ error: "syncId, businessId and part are required" }, 400);
  }

  try {
    if (!(await businessExists(part.businessId))) {
      return json({ error: "Unknown business" }, 404);
    }

    switch (part.part) {
      case "meta":
        return await handleMeta(part as MetaPart);
      case "orders":
      case "products":
      case "customers":
        return await handleRows(part as RowsPart);
      case "done":
        return await handleDone(part as DonePart);
      default:
        // `part` is narrowed to never here — every known part is handled above.
        return json({ error: "Unknown part" }, 400);
    }
  } catch (err) {
    // 500 so ExitEcom Connect logs it; the merchant is connected either way and
    // the pull path backfills on the next sync.
    console.error("[analytic-ingest] failed:", err);
    return json({ error: "Ingest failed" }, 500);
  }
}
