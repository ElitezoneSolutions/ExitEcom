import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Shopify data sync (custom-app path).
//
// Connecting a store does ONE job: authenticate, pull the full dataset
// (orders, products, customers, store metadata), and hand the raw rows back to
// the caller to persist. No normalization, no valuation, no AI — reports are
// computed later, on demand, from the stored data (see src/lib/analytics.ts).
// ---------------------------------------------------------------------------

const API_VERSION = "2024-01";
const PAGE_LIMIT = 250;
const ORDER_CAP = 5000;
const PRODUCT_CAP = 2000;
const CUSTOMER_CAP = 5000;

export interface ShopifySyncInput {
  shopDomain: string;
  accessToken: string;
  // ISO timestamp; on incremental refresh only pull orders created after this.
  sinceISO?: string;
}

export interface RawShopifyStore {
  shopDomain: string;
  name: string;
  currency: string;
  country: string;
  plan: string | null;
  shopCreatedAt: string;
}

export interface RawLineItem {
  title: string;
  quantity: number;
  price: number;
  productId: string | null;
}

export interface RawShopifyOrder {
  shopifyOrderId: string;
  orderNumber: string;
  totalPrice: number;
  currency: string;
  createdAt: string;
  processedAt: string | null;
  financialStatus: string | null;
  customerId: string | null;
  lineItems: RawLineItem[];
}

export interface RawShopifyProduct {
  shopifyProductId: string;
  title: string;
  productType: string | null;
  vendor: string | null;
  status: string | null;
  createdAt: string;
  variants: { id: string; title: string; price: number }[];
}

export interface RawShopifyCustomer {
  shopifyCustomerId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
  lastOrderAt: string | null;
}

export interface ShopifySyncResult {
  shop: RawShopifyStore;
  orders: RawShopifyOrder[];
  products: RawShopifyProduct[];
  customers: RawShopifyCustomer[];
  counts: { orders: number; products: number; customers: number };
  capped: { orders: boolean; products: boolean; customers: boolean };
  sandbox: boolean;
}

// --- Raw Shopify Admin API shapes (subset of fields we request) -------------
interface ApiLineItem {
  title: string;
  quantity: number;
  price: string;
  product_id: number | string | null;
}
interface ApiOrder {
  id: number | string;
  name?: string;
  total_price: string;
  currency?: string;
  created_at: string;
  processed_at?: string | null;
  financial_status?: string | null;
  customer?: { id: number | string } | null;
  line_items?: ApiLineItem[];
}
interface ApiProduct {
  id: number | string;
  title: string;
  product_type?: string | null;
  vendor?: string | null;
  status?: string | null;
  created_at: string;
  variants?: { id: number | string; title: string; price: string }[];
}
interface ApiCustomer {
  id: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  orders_count?: number;
  total_spent?: string;
  created_at: string;
}
interface ApiShop {
  name: string;
  domain: string;
  myshopify_domain: string;
  currency: string;
  country_name: string;
  plan_name?: string | null;
  created_at: string;
}

// Follow Shopify's cursor pagination (Link header, rel="next").
function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function fetchPaged<T>(
  initialUrl: string,
  accessToken: string,
  extract: (json: unknown) => T[],
  cap: number,
): Promise<{ items: T[]; capped: boolean }> {
  const items: T[] = [];
  let url: string | null = initialUrl;
  let capped = false;

  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Shopify API returned status ${res.status}`);
    }
    const json: unknown = await res.json();
    items.push(...extract(json));
    if (items.length >= cap) {
      capped = true;
      break;
    }
    url = parseNextLink(res.headers.get("link"));
  }

  return { items: items.slice(0, cap), capped };
}

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function mapOrder(o: ApiOrder, fallbackCurrency: string): RawShopifyOrder {
  return {
    shopifyOrderId: String(o.id),
    orderNumber: o.name ?? String(o.id),
    totalPrice: toNumber(o.total_price),
    currency: o.currency ?? fallbackCurrency,
    createdAt: o.created_at,
    processedAt: o.processed_at ?? null,
    financialStatus: o.financial_status ?? null,
    customerId: o.customer?.id != null ? String(o.customer.id) : null,
    lineItems: (o.line_items ?? []).map((li) => ({
      title: li.title,
      quantity: li.quantity,
      price: toNumber(li.price),
      productId: li.product_id != null ? String(li.product_id) : null,
    })),
  };
}

function mapProduct(p: ApiProduct): RawShopifyProduct {
  return {
    shopifyProductId: String(p.id),
    title: p.title,
    productType: p.product_type ?? null,
    vendor: p.vendor ?? null,
    status: p.status ?? null,
    createdAt: p.created_at,
    variants: (p.variants ?? []).map((v) => ({
      id: String(v.id),
      title: v.title,
      price: toNumber(v.price),
    })),
  };
}

function mapCustomer(c: ApiCustomer): RawShopifyCustomer {
  return {
    shopifyCustomerId: String(c.id),
    email: c.email ?? null,
    firstName: c.first_name ?? null,
    lastName: c.last_name ?? null,
    ordersCount: c.orders_count ?? 0,
    totalSpent: toNumber(c.total_spent),
    createdAt: c.created_at,
    lastOrderAt: null,
  };
}

// Derive each customer's last order date from the orders we pulled.
function attachLastOrderDates(
  customers: RawShopifyCustomer[],
  orders: RawShopifyOrder[],
): RawShopifyCustomer[] {
  const lastByCustomer = new Map<string, string>();
  for (const o of orders) {
    if (!o.customerId) continue;
    const prev = lastByCustomer.get(o.customerId);
    if (!prev || new Date(o.createdAt) > new Date(prev)) {
      lastByCustomer.set(o.customerId, o.createdAt);
    }
  }
  return customers.map((c) => ({
    ...c,
    lastOrderAt: lastByCustomer.get(c.shopifyCustomerId) ?? null,
  }));
}

function isSandboxCreds(shopDomain: string, accessToken: string): boolean {
  const haystack = `${shopDomain} ${accessToken}`.toLowerCase();
  return (
    haystack.includes("test") ||
    haystack.includes("demo") ||
    haystack.includes("sandbox")
  );
}

// High-fidelity sandbox data so local/demo flows work without a real store.
function buildSandbox(shopDomain: string): ShopifySyncResult {
  const baseName = shopDomain.split(".")[0] || "demo";
  const productTitles = [
    "Hero Serum",
    "Glow Moisturizer",
    "Hydrating Cleanser",
    "Sunscreen SPF 50",
    "Exfoliating Toner",
  ];
  const prices = [45, 35, 28, 32, 26];
  const now = Date.now();

  const products: RawShopifyProduct[] = productTitles.map((title, i) => ({
    shopifyProductId: String(101 + i),
    title,
    productType: "Skincare",
    vendor: baseName,
    status: "active",
    createdAt: new Date(now - (400 - i * 30) * 86400000).toISOString(),
    variants: [{ id: String(1000 + i), title: "Default", price: prices[i] }],
  }));

  const customers: RawShopifyCustomer[] = Array.from(
    { length: 12 },
    (_, i) => ({
      shopifyCustomerId: `cust_${10000 + i}`,
      email: `customer${i}@example.com`,
      firstName: `Customer`,
      lastName: String(i + 1),
      ordersCount: 0,
      totalSpent: 0,
      createdAt: new Date(now - (300 - i * 10) * 86400000).toISOString(),
      lastOrderAt: null,
    }),
  );

  const orders: RawShopifyOrder[] = [];
  for (let i = 0; i < 45; i++) {
    const customer = customers[i % customers.length];
    const p1 = i % productTitles.length;
    const items: RawLineItem[] = [
      {
        title: productTitles[p1],
        quantity: 1,
        price: prices[p1],
        productId: String(101 + p1),
      },
    ];
    let total = prices[p1];
    if (i % 3 === 0) {
      const p2 = (i + 2) % productTitles.length;
      items.push({
        title: productTitles[p2],
        quantity: 1,
        price: prices[p2],
        productId: String(101 + p2),
      });
      total += prices[p2];
    }
    orders.push({
      shopifyOrderId: `order_${i}`,
      orderNumber: `#${1000 + i}`,
      totalPrice: total,
      currency: "GBP",
      createdAt: new Date(now - (i % 30) * 86400000).toISOString(),
      processedAt: new Date(now - (i % 30) * 86400000).toISOString(),
      financialStatus: "paid",
      customerId: customer.shopifyCustomerId,
      lineItems: items,
    });
  }

  // Roll order facts back onto sandbox customers so the data is self-consistent.
  for (const c of customers) {
    const theirs = orders.filter((o) => o.customerId === c.shopifyCustomerId);
    c.ordersCount = theirs.length;
    c.totalSpent = theirs.reduce((s, o) => s + o.totalPrice, 0);
  }

  return {
    shop: {
      shopDomain,
      name: `${baseName.toUpperCase()} Store`,
      currency: "GBP",
      country: "United Kingdom",
      plan: "sandbox",
      shopCreatedAt: new Date(now - 365 * 86400000).toISOString(),
    },
    orders,
    products,
    customers: attachLastOrderDates(customers, orders),
    counts: {
      orders: orders.length,
      products: products.length,
      customers: customers.length,
    },
    capped: { orders: false, products: false, customers: false },
    sandbox: true,
  };
}

// ---------------------------------------------------------------------------
// ExitEcom Analytic connector (connection-key path).
//
// Instead of pasting a custom-app Admin token, the merchant installs the
// official ExitEcom app via OAuth (handled by the separate ExitEcom Analytic
// service). That service mints a per-store "connection key" and holds the
// Shopify token server-side. Here we exchange that key for the full dataset by
// calling `<SHOPIFY_ANALYTIC_APP_URL>/api/store-data?key=…`, which returns the
// exact same ShopifySyncResult shape the custom-app path produces — so the rest
// of the app (persistence, reports) is identical regardless of connector.
// ---------------------------------------------------------------------------

export interface AnalyticSyncInput {
  connectionKey: string;
}

export const syncViaConnectionKeyFn = createServerFn({ method: "POST" })
  .inputValidator((input: AnalyticSyncInput) => input)
  .handler(async ({ data }): Promise<ShopifySyncResult> => {
    const connectionKey = data.connectionKey?.trim();
    if (!connectionKey) {
      throw new Error("An ExitEcom Analytic connection key is required.");
    }

    let base = (process.env.SHOPIFY_ANALYTIC_APP_URL ?? "")
      .trim()
      .replace(/\/+$/, "");

    // Demo keys, or no configured backend, short-circuit to deterministic
    // sandbox data so the flow is fully usable in local/demo environments.
    if (!base || /test|demo|sandbox/i.test(connectionKey)) {
      return buildSandbox("exitecom-analytic-demo.myshopify.com");
    }

    if (!/^https?:\/\//.test(base)) base = `https://${base}`;

    const res = await fetch(
      `${base}/api/store-data?key=${encodeURIComponent(connectionKey)}`,
      { headers: { Accept: "application/json" } },
    );

    if (!res.ok) {
      throw new Error(
        res.status === 401 || res.status === 400
          ? "That connection key wasn't recognised. Re-install ExitEcom on your store and copy the key shown after install."
          : `The ExitEcom Analytic service is unavailable (returned ${res.status}). Please try again shortly.`,
      );
    }

    const result = (await res.json()) as ShopifySyncResult;
    if (!result?.shop?.shopDomain) {
      throw new Error(
        "The ExitEcom Analytic service returned an unexpected response.",
      );
    }
    return result;
  });

export const syncShopifyStoreFn = createServerFn({ method: "POST" })
  .inputValidator((input: ShopifySyncInput) => input)
  .handler(async ({ data }): Promise<ShopifySyncResult> => {
    const { accessToken, sinceISO } = data;

    // Sanitize domain (accept "store", "store.myshopify.com", or a full URL).
    let shopDomain = data.shopDomain
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    if (!shopDomain.includes(".")) {
      shopDomain = `${shopDomain}.myshopify.com`;
    }

    if (!shopDomain || !accessToken?.trim()) {
      throw new Error(
        "A store domain and Admin API access token are required.",
      );
    }

    // Explicit sandbox/demo creds short-circuit to deterministic fake data.
    if (isSandboxCreds(shopDomain, accessToken)) {
      return buildSandbox(shopDomain);
    }

    const base = `https://${shopDomain}/admin/api/${API_VERSION}`;

    // 1. Authenticate + read store metadata. Real failures surface as errors.
    const shopRes = await fetch(`${base}/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
    });
    if (!shopRes.ok) {
      throw new Error(
        shopRes.status === 401 || shopRes.status === 403
          ? "Shopify rejected the access token. Check the token and that it has read_orders, read_products and read_customers scopes."
          : `Could not reach the store (Shopify returned ${shopRes.status}). Check the store domain.`,
      );
    }
    const shopJson = (await shopRes.json()) as { shop: ApiShop };
    const shop = shopJson.shop;
    const currency = shop.currency ?? "USD";

    // 2. Orders (cursor-paginated; incremental when sinceISO is provided).
    const orderFields =
      "id,name,total_price,currency,created_at,processed_at,financial_status,customer,line_items";
    let ordersUrl = `${base}/orders.json?status=any&limit=${PAGE_LIMIT}&fields=${orderFields}`;
    if (sinceISO)
      ordersUrl += `&created_at_min=${encodeURIComponent(sinceISO)}`;
    const ordersPaged = await fetchPaged<RawShopifyOrder>(
      ordersUrl,
      accessToken,
      (json) =>
        ((json as { orders?: ApiOrder[] }).orders ?? []).map((o) =>
          mapOrder(o, currency),
        ),
      ORDER_CAP,
    );

    // 3. Products.
    const productFields =
      "id,title,product_type,vendor,status,created_at,variants";
    const productsPaged = await fetchPaged<RawShopifyProduct>(
      `${base}/products.json?limit=${PAGE_LIMIT}&fields=${productFields}`,
      accessToken,
      (json) =>
        ((json as { products?: ApiProduct[] }).products ?? []).map(mapProduct),
      PRODUCT_CAP,
    );

    // 4. Customers.
    const customerFields =
      "id,email,first_name,last_name,orders_count,total_spent,created_at";
    const customersPaged = await fetchPaged<RawShopifyCustomer>(
      `${base}/customers.json?limit=${PAGE_LIMIT}&fields=${customerFields}`,
      accessToken,
      (json) =>
        ((json as { customers?: ApiCustomer[] }).customers ?? []).map(
          mapCustomer,
        ),
      CUSTOMER_CAP,
    );

    return {
      shop: {
        shopDomain: shop.myshopify_domain ?? shopDomain,
        name: shop.name,
        currency,
        country: shop.country_name,
        plan: shop.plan_name ?? null,
        shopCreatedAt: shop.created_at,
      },
      orders: ordersPaged.items,
      products: productsPaged.items,
      customers: attachLastOrderDates(customersPaged.items, ordersPaged.items),
      counts: {
        orders: ordersPaged.items.length,
        products: productsPaged.items.length,
        customers: customersPaged.items.length,
      },
      capped: {
        orders: ordersPaged.capped,
        products: productsPaged.capped,
        customers: customersPaged.capped,
      },
      sandbox: false,
    };
  });
