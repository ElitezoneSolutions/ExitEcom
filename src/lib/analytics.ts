import type {
  BusinessData,
  RiskItem,
  ActionItem,
} from "@/hooks/useBusinessData";

// ---------------------------------------------------------------------------
// Deterministic analytics engine.
//
// Every number a report shows is computed here, in plain auditable code, from
// the raw Shopify data we stored at connect time. No AI touches these figures.
// (AI is only used elsewhere to polish prose — see src/lib/ai.ts.)
//
// Margin/multiple assumptions are explicit, industry-standard benchmarks — the
// only inputs we cannot read directly from Shopify (a store's true COGS, ad
// spend, etc. live outside the order feed). They are constants, not guesses.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface AnalyticsOrder {
  totalPrice: number;
  createdAt: string;
  customerId: string | null;
  lineItems: {
    title: string;
    quantity: number;
    price: number;
    productId: string | null;
  }[];
}
export interface AnalyticsProduct {
  shopifyProductId: string;
  title: string;
  createdAt: string;
}
export interface AnalyticsCustomer {
  shopifyCustomerId: string;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
}
export interface AnalyticsStore {
  name: string;
  currency: string;
  country: string;
  shopCreatedAt: string | null;
}
export interface AnalyticsInput {
  store: AnalyticsStore | null;
  orders: AnalyticsOrder[];
  products: AnalyticsProduct[];
  customers: AnalyticsCustomer[];
  industry: string;
}

export interface ProductRevenue {
  productId: string | null;
  title: string;
  revenue: number;
  units: number;
  share: number;
}

export interface StoreMetrics {
  currency: string;
  orderCount: number;
  productCount: number;
  customerCount: number;
  revenueTTM: number;
  revenueAllTime: number;
  revenueMonthly: { m: string; v: number }[];
  avgOrderValue: number;
  repeatRate: number;
  newCustomers: number;
  returningCustomers: number;
  topProductShare: number;
  productRevenue: ProductRevenue[];
  grossMargin: number;
  netMargin: number;
  cogs: number;
  grossProfit: number;
  grossRevenue: number;
  netRevenue: number;
  ebitda: number;
  sde: number;
  opex: number;
  adSpend: number;
  roas: number;
  businessAgeYears: number;
  businessAge: string;
  growthRate: number;
  hasData: boolean;
}

export interface ScoreDimension {
  key: string;
  name: string;
  score: number;
  max: number;
  status: "green" | "amber" | "red";
}
export interface ExitScoreResult {
  exitScore: number;
  scoreTier: string;
  scoreBreakdown: ScoreDimension[];
  dataConfidence: number;
}

export interface Driver {
  name: string;
  impact: string;
}
export interface ValuationResult {
  adjustedEarnings: number;
  currentMultiple: number;
  optimisedMultiple: number;
  valuationLow: number;
  valuationMid: number;
  valuationHigh: number;
  valuationOptimised: number;
  quickSale: number;
  fairMarket: number;
  optimised: number;
  valueGap: number;
  positiveDrivers: Driver[];
  negativeDrivers: Driver[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round = (x: number) => Math.round(x);

function statusFor(ratio: number): "green" | "amber" | "red" {
  if (ratio >= 0.66) return "green";
  if (ratio >= 0.4) return "amber";
  return "red";
}

export function hasStoreData(input: AnalyticsInput): boolean {
  return input.orders.length > 0;
}

// --- 1. Base metrics --------------------------------------------------------
export function computeMetrics(input: AnalyticsInput): StoreMetrics {
  const { orders, products, customers, store, industry } = input;
  const now = Date.now();
  const orderCount = orders.length;
  const revenueAllTime = orders.reduce((s, o) => s + o.totalPrice, 0);

  // Trailing-twelve-month revenue (actual sum of the last 365 days). If every
  // order predates the window, annualize the all-time figure over its span.
  const cutoff = now - YEAR_MS;
  const ttmOrders = orders.filter(
    (o) => new Date(o.createdAt).getTime() >= cutoff,
  );
  let revenueTTM = ttmOrders.reduce((s, o) => s + o.totalPrice, 0);
  if (revenueTTM === 0 && orderCount > 0) {
    const times = orders.map((o) => new Date(o.createdAt).getTime());
    const spanDays = Math.max(
      1,
      (Math.max(...times) - Math.min(...times)) / DAY_MS,
    );
    revenueTTM = round(revenueAllTime * (365 / spanDays));
  }

  const avgOrderValue =
    orderCount > 0 ? Math.round((revenueAllTime / orderCount) * 100) / 100 : 0;

  // Monthly buckets for the last 12 calendar months.
  const monthly: { m: string; v: number }[] = [];
  const base = new Date(now);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    monthly.push({ m: MONTH_LABELS[d.getMonth()], v: 0 });
  }
  const firstBucket = new Date(
    base.getFullYear(),
    base.getMonth() - 11,
    1,
  ).getTime();
  for (const o of orders) {
    const t = new Date(o.createdAt).getTime();
    if (t < firstBucket) continue;
    const od = new Date(o.createdAt);
    const idx =
      (od.getFullYear() - base.getFullYear()) * 12 +
      (od.getMonth() - base.getMonth()) +
      11;
    if (idx >= 0 && idx < 12) monthly[idx].v += o.totalPrice;
  }
  monthly.forEach((b) => (b.v = round(b.v)));

  const last3 = monthly.slice(9).reduce((s, b) => s + b.v, 0);
  const prior3 = monthly.slice(6, 9).reduce((s, b) => s + b.v, 0);
  const growthRate = prior3 > 0 ? (last3 - prior3) / prior3 : 0;

  // Repeat rate — prefer the customers feed; fall back to order linkage.
  let returningCustomers = 0;
  let totalCustomers = customers.length;
  if (customers.length > 0) {
    returningCustomers = customers.filter((c) => c.ordersCount > 1).length;
  } else {
    const counts = new Map<string, number>();
    for (const o of orders) {
      if (o.customerId)
        counts.set(o.customerId, (counts.get(o.customerId) ?? 0) + 1);
    }
    totalCustomers = counts.size;
    returningCustomers = [...counts.values()].filter((n) => n > 1).length;
  }
  const repeatRate =
    totalCustomers > 0
      ? Math.round((returningCustomers / totalCustomers) * 100) / 100
      : 0;

  // Per-product revenue from real line items.
  const titleById = new Map<string, string>();
  for (const p of products) titleById.set(p.shopifyProductId, p.title);
  const revByKey = new Map<
    string,
    { title: string; revenue: number; units: number; productId: string | null }
  >();
  for (const o of orders) {
    for (const li of o.lineItems) {
      const key = li.productId ?? li.title;
      const title =
        (li.productId && titleById.get(li.productId)) ||
        li.title ||
        "Unknown product";
      const entry = revByKey.get(key) ?? {
        title,
        revenue: 0,
        units: 0,
        productId: li.productId,
      };
      entry.revenue += li.price * li.quantity;
      entry.units += li.quantity;
      revByKey.set(key, entry);
    }
  }
  const lineTotal = [...revByKey.values()].reduce((s, e) => s + e.revenue, 0);
  const productRevenue: ProductRevenue[] = [...revByKey.values()]
    .map((e) => ({
      productId: e.productId,
      title: e.title,
      revenue: round(e.revenue),
      units: e.units,
      share: lineTotal > 0 ? e.revenue / lineTotal : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const topProductShare =
    productRevenue.length > 0
      ? Math.round(productRevenue[0].share * 100) / 100
      : 0;

  // Margin/multiple benchmarks (explicit assumptions; see header note).
  const lc = industry.toLowerCase();
  const grossMargin =
    lc.includes("beauty") || lc.includes("skincare")
      ? 0.72
      : lc.includes("apparel") || lc.includes("fashion")
        ? 0.65
        : lc.includes("electronics")
          ? 0.35
          : 0.6;
  const netMargin = 0.18;
  const grossProfit = round(revenueTTM * grossMargin);
  const cogs = round(revenueTTM - grossProfit);
  const ebitda = round(revenueTTM * netMargin);
  const sde = round(ebitda * 1.25);
  const opex = round(grossProfit - ebitda);
  const adSpend = round(revenueTTM * 0.22); // benchmark estimate (no ad feed)
  const netRevenue = round(revenueTTM * 0.95);

  // Business age from store creation date.
  let businessAgeYears = 0;
  if (store?.shopCreatedAt) {
    businessAgeYears = Math.max(
      0,
      (now - new Date(store.shopCreatedAt).getTime()) / YEAR_MS,
    );
  }
  const businessAge =
    businessAgeYears > 0 ? `${businessAgeYears.toFixed(1)} years` : "—";

  return {
    currency: store?.currency || "USD",
    orderCount,
    productCount: products.length,
    customerCount: totalCustomers,
    revenueTTM: round(revenueTTM),
    revenueAllTime: round(revenueAllTime),
    revenueMonthly: monthly,
    avgOrderValue,
    repeatRate,
    newCustomers: Math.max(0, totalCustomers - returningCustomers),
    returningCustomers,
    topProductShare,
    productRevenue,
    grossMargin,
    netMargin,
    cogs,
    grossProfit,
    grossRevenue: round(revenueTTM),
    netRevenue,
    ebitda,
    sde,
    opex,
    adSpend,
    roas: 0, // unknown without an ad-platform connection
    businessAgeYears,
    businessAge,
    growthRate,
    hasData: orderCount > 0,
  };
}

// --- 2. Exit readiness score (9 dimensions, sums to 100) --------------------
export function computeExitScore(m: StoreMetrics): ExitScoreResult {
  const dim = (
    key: string,
    name: string,
    max: number,
    ratio: number,
  ): ScoreDimension => {
    const r = clamp01(ratio);
    return { key, name, max, score: round(max * r), status: statusFor(r) };
  };

  const breakdown: ScoreDimension[] = [
    dim(
      "financialQuality",
      "Financial Quality",
      15,
      (m.grossMargin / 0.7 + m.netMargin / 0.2) / 2,
    ),
    dim("revenueQuality", "Revenue Quality", 10, m.revenueTTM / 500_000),
    dim(
      "marketingEfficiency",
      "Marketing Efficiency & Stability",
      15,
      m.repeatRate / 0.3,
    ),
    dim(
      "customerEconomics",
      "Customer Economics",
      10,
      (m.repeatRate / 0.3 + m.avgOrderValue / 80) / 2,
    ),
    dim(
      "productSupplyRisk",
      "Product & Supply Risk",
      10,
      1 - (m.topProductShare - 0.2) / 0.6,
    ),
    dim(
      "operationalMaturity",
      "Operational Maturity",
      10,
      (clamp01(m.productCount / 20) + clamp01(m.orderCount / 200)) / 2,
    ),
    // Founder dependency can't be read from Shopify — neutral, low-confidence.
    dim("founderDependency", "Founder Dependency", 10, 0.5),
    dim(
      "growthTrajectory",
      "Growth Trajectory & Potential",
      10,
      (m.growthRate + 0.1) / 0.4,
    ),
    // Single sales channel (Shopify only) — moderate platform risk by default.
    dim("platformChannelRisk", "Platform & Channel Risk", 10, 0.6),
  ];

  const exitScore = breakdown.reduce((s, d) => s + d.score, 0);
  const scoreTier =
    exitScore >= 80
      ? "Institutional Grade"
      : exitScore >= 70
        ? "Strong Asset"
        : exitScore >= 55
          ? "Solid Asset"
          : "Emerging";

  let dataConfidence = 50 + clamp01(m.orderCount / 200) * 30;
  if (m.customerCount > 0) dataConfidence += 10;
  if (m.productCount > 0) dataConfidence += 10;
  dataConfidence = Math.min(95, round(dataConfidence));

  return { exitScore, scoreTier, scoreBreakdown: breakdown, dataConfidence };
}

// --- 3. Valuation -----------------------------------------------------------
export function computeValuation(
  m: StoreMetrics,
  exitScore: number,
): ValuationResult {
  const sde = m.sde;
  const currentMultiple = exitScore >= 75 ? 2.6 : exitScore >= 60 ? 2.1 : 1.7;
  const optimisedMultiple = Math.round(currentMultiple * 1.4 * 10) / 10;

  const valuationMid = round(sde * currentMultiple);
  const valuationLow = round(sde * (currentMultiple - 0.3));
  const valuationHigh = round(sde * (currentMultiple + 0.3));
  const valuationOptimised = round(sde * optimisedMultiple);
  const valueGap = valuationOptimised - valuationMid;

  const positiveDrivers: Driver[] = [];
  const negativeDrivers: Driver[] = [];
  if (m.grossMargin >= 0.65)
    positiveDrivers.push({
      name: `Healthy gross margin (${round(m.grossMargin * 100)}%)`,
      impact: "+0.2x",
    });
  if (m.repeatRate >= 0.25)
    positiveDrivers.push({
      name: `Strong repeat rate (${round(m.repeatRate * 100)}%)`,
      impact: "+0.3x",
    });
  if (m.growthRate > 0.05)
    positiveDrivers.push({
      name: `Positive growth trajectory (+${round(m.growthRate * 100)}%)`,
      impact: "+0.2x",
    });
  if (m.businessAgeYears >= 2)
    positiveDrivers.push({
      name: "Established trading history",
      impact: "+0.1x",
    });
  if (positiveDrivers.length === 0)
    positiveDrivers.push({
      name: "Live, verifiable order data",
      impact: "+0.1x",
    });

  if (m.topProductShare > 0.4)
    negativeDrivers.push({
      name: `Product concentration (${round(m.topProductShare * 100)}% in one SKU)`,
      impact: "-0.3x",
    });
  if (m.repeatRate < 0.2)
    negativeDrivers.push({
      name: `Low repeat rate (${round(m.repeatRate * 100)}%)`,
      impact: "-0.3x",
    });
  if (m.businessAgeYears < 2)
    negativeDrivers.push({
      name: "Limited operating history",
      impact: "-0.2x",
    });
  negativeDrivers.push({
    name: "Single sales channel (Shopify only)",
    impact: "-0.2x",
  });

  return {
    adjustedEarnings: sde,
    currentMultiple,
    optimisedMultiple,
    valuationLow,
    valuationMid,
    valuationHigh,
    valuationOptimised,
    quickSale: valuationLow,
    fairMarket: valuationMid,
    optimised: valuationOptimised,
    valueGap,
    positiveDrivers,
    negativeDrivers,
  };
}

// --- 4. Risks (deterministic; copy may be polished by AI later) -------------
export function computeRisks(m: StoreMetrics, v: ValuationResult): RiskItem[] {
  const gap = v.valueGap || Math.round(m.sde * 0.4);
  const pct = (n: number) => `${round(n * 100)}%`;

  return [
    {
      title: "Product Concentration Risk",
      severity:
        m.topProductShare > 0.5
          ? "high"
          : m.topProductShare > 0.35
            ? "medium"
            : "low",
      description: `Your top product accounts for ${pct(m.topProductShare)} of order-line revenue across ${m.productCount} catalogued products.`,
      impact: -round(gap * 0.35),
      buyerSees: "Revenue resilience hinges on a single SKU.",
      buyerFears:
        "A demand dip or supply break on the hero product collapses revenue.",
      buyerDoes:
        "Lower the multiple or request an earnout tied to diversification.",
      recommendation:
        "Launch and promote 2 adjacent SKUs to rebalance revenue share.",
    },
    {
      title: "Customer Retention Profile",
      severity:
        m.repeatRate < 0.2 ? "high" : m.repeatRate < 0.3 ? "medium" : "low",
      description: `Repeat purchase rate sits at ${pct(m.repeatRate)} across ${m.customerCount} customers (AOV ${m.currency} ${m.avgOrderValue.toFixed(2)}).`,
      impact: -round(gap * 0.25),
      buyerSees: "High acquisition dependency with churn-sensitive margins.",
      buyerFears:
        "Rising ad costs erode contribution margin as retention lags.",
      buyerDoes: "Discount earnings quality and stress-test CAC payback.",
      recommendation:
        "Add post-purchase replenishment and lifecycle email/SMS flows.",
    },
    {
      title: "Single-Channel Dependency",
      severity: "medium",
      description:
        "All tracked revenue flows through Shopify with no diversified channel evidence connected.",
      impact: -round(gap * 0.2),
      buyerSees: "A business renting one storefront/acquisition stack.",
      buyerFears: "Platform, ad-account or algorithm shifts threaten cashflow.",
      buyerDoes: "Require channel-diversification proof before closing.",
      recommendation:
        "Connect ad and analytics sources, and build an owned audience.",
    },
  ];
}

// --- 5. Optimization actions ------------------------------------------------
export function computeOptimization(
  m: StoreMetrics,
  v: ValuationResult,
): ActionItem[] {
  const gap = v.valueGap || Math.round(m.sde * 0.4);
  return [
    {
      title: "Reduce Product Concentration",
      priority: m.topProductShare > 0.5 ? "high" : "medium",
      uplift: round(gap * 0.4),
      time: "3–6 weeks",
      problem: `${round(m.topProductShare * 100)}% revenue concentration suppresses the multiple.`,
      steps: [
        "Identify 2 adjacent SKUs with overlapping customer intent.",
        "Allocate part of the ad budget to launch trials.",
        "Track per-SKU contribution margin weekly for 90 days.",
      ],
    },
    {
      title: "Lift Repeat Purchase Rate",
      priority: m.repeatRate < 0.2 ? "high" : "medium",
      uplift: round(gap * 0.3),
      time: "2–4 weeks",
      problem: `Repeat rate of ${round(m.repeatRate * 100)}% limits LTV and earnings quality.`,
      steps: [
        "Set up a replenishment reminder based on product usage cycles.",
        "Launch a post-purchase review + win-back sequence.",
        "Stand up a VIP/loyalty offer for 2+ time buyers.",
      ],
    },
    {
      title: "Diversify Acquisition Channels",
      priority: "medium",
      uplift: round(gap * 0.3),
      time: "4–8 weeks",
      problem: "Single-channel dependency caps defensibility and the multiple.",
      steps: [
        "Connect ad and analytics sources to verify blended ROAS.",
        "Launch an SEO content roadmap targeting category intent.",
        "Build an owned email/SMS audience with lifecycle automation.",
      ],
    },
  ];
}

// --- 6. Persistable snapshot for the businesses/valuation_data tables -------
export function buildBusinessUpdate(
  m: StoreMetrics,
  s: ExitScoreResult,
  v: ValuationResult,
  store: AnalyticsStore | null,
  industry: string,
): Partial<BusinessData> {
  return {
    name: store?.name || "My Shopify Store",
    industry,
    channel: "Shopify Connect",
    country: store?.country || "",
    age: m.businessAge,
    revenueTTM: m.revenueTTM,
    revenueMonthly: m.revenueMonthly,
    ebitda: m.ebitda,
    sde: m.sde,
    grossMargin: m.grossMargin,
    netMargin: m.netMargin,
    adSpend: m.adSpend,
    cogs: m.cogs,
    grossProfit: m.grossProfit,
    opex: m.opex,
    grossRevenue: m.grossRevenue,
    netRevenue: m.netRevenue,
    exitScore: s.exitScore,
    scoreTier: s.scoreTier,
    scoreBreakdown: s.scoreBreakdown,
    valuationLow: v.valuationLow,
    valuationMid: v.valuationMid,
    valuationHigh: v.valuationHigh,
    valuationOptimised: v.valuationOptimised,
    currentMultiple: v.currentMultiple,
    optimisedMultiple: v.optimisedMultiple,
    quickSale: v.quickSale,
    fairMarket: v.fairMarket,
    optimised: v.optimised,
    adjustedEarnings: v.adjustedEarnings,
    valueGap: v.valueGap,
    repeatRate: m.repeatRate,
    avgOrderValue: m.avgOrderValue,
    roas: m.roas,
    topProductShare: m.topProductShare,
    riskScore: Math.max(0, 100 - s.exitScore),
    totalValueLost: v.valueGap,
    dataConfidence: s.dataConfidence,
  };
}

// Convenience: full report in one call.
export interface FullReport {
  metrics: StoreMetrics;
  score: ExitScoreResult;
  valuation: ValuationResult;
  risks: RiskItem[];
  actions: ActionItem[];
  businessUpdate: Partial<BusinessData>;
}
export function computeFullReport(input: AnalyticsInput): FullReport {
  const metrics = computeMetrics(input);
  const score = computeExitScore(metrics);
  const valuation = computeValuation(metrics, score.exitScore);
  const risks = computeRisks(metrics, valuation);
  const actions = computeOptimization(metrics, valuation);
  const businessUpdate = buildBusinessUpdate(
    metrics,
    score,
    valuation,
    input.store,
    input.industry,
  );
  return { metrics, score, valuation, risks, actions, businessUpdate };
}
