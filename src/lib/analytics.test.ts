import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  computeExitScore,
  computeValuation,
  computeRisks,
  computeOptimization,
  computeFullReport,
  hasStoreData,
  type StoreMetrics,
  type AnalyticsInput,
  type AnalyticsOrder,
} from "./analytics";

// ---------------------------------------------------------------------------
// These tests pin the deterministic engine (src/lib/analytics.ts). Per the
// project's golden rule, every figure is pure and synchronous, so the scoring /
// valuation / risk / optimization functions can be exercised directly with
// hand-built StoreMetrics — no dates, no I/O. The computeMetrics integration
// tests use timestamps relative to Date.now() so they stay calendar-stable.
//
// Three blocks are explicit regression guards for bugs fixed 2026-06-24:
//   • single-month ad feed must not read as perfectly stable
//   • missing line-item data must not score Product & Supply Risk as perfect
//   • Snapchat's account-level conversionValueTotal must drive real ROAS
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

// A complete, deliberately middling StoreMetrics. Spread overrides on top to
// isolate the field under test.
function makeMetrics(overrides: Partial<StoreMetrics> = {}): StoreMetrics {
  return {
    currency: "GBP",
    orderCount: 100,
    productCount: 10,
    customerCount: 80,
    revenueTTM: 250_000,
    revenueAllTime: 300_000,
    revenueMonthly: [],
    avgOrderValue: 60,
    repeatRate: 0.25,
    newCustomers: 60,
    returningCustomers: 20,
    topProductShare: 0.3,
    productRevenue: [
      { productId: "1", title: "A", revenue: 100, units: 10, share: 0.3 },
    ],
    grossMargin: 0.6,
    netMargin: 0.18,
    cogs: 100_000,
    grossProfit: 150_000,
    grossRevenue: 250_000,
    netRevenue: 237_500,
    ebitda: 45_000,
    sde: 56_250,
    opex: 105_000,
    adSpend: 55_000,
    roas: 0,
    adSpendVerified: false,
    blendedCac: 0,
    adSpendStability: 0,
    topCampaignShare: 0,
    marketingEfficiencyRatio: 0,
    businessAgeYears: 3,
    businessAge: "3.0 years",
    growthRate: 0.1,
    hasData: true,
    bankStatementsMonthCount: 0,
    plFileCount: 0,
    ga4Connected: false,
    sessionGrowth: 0,
    sessionGrowthAvailable: false,
    trafficConversionRate: 0,
    trafficChannelConcentration: 0,
    topTrafficChannel: "",
    ...overrides,
  };
}

function makeOrder(over: Partial<AnalyticsOrder> = {}): AnalyticsOrder {
  return {
    totalPrice: 100,
    createdAt: daysAgo(30),
    customerId: "c1",
    lineItems: [{ title: "Widget", quantity: 1, price: 100, productId: "p1" }],
    ...over,
  };
}

function makeInput(over: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    store: {
      name: "Test Store",
      currency: "GBP",
      country: "GB",
      shopCreatedAt: daysAgo(3 * 365),
    },
    orders: [makeOrder()],
    products: [
      { shopifyProductId: "p1", title: "Widget", createdAt: daysAgo(400) },
    ],
    customers: [],
    industry: "E-commerce",
    ...over,
  };
}

// ---------------------------------------------------------------------------
describe("computeExitScore", () => {
  it("sums dimension scores into exitScore, capped within [0,100]", () => {
    const { exitScore, scoreBreakdown } = computeExitScore(makeMetrics());
    const summed = scoreBreakdown.reduce((s, d) => s + d.score, 0);
    expect(exitScore).toBe(summed);
    expect(exitScore).toBeGreaterThanOrEqual(0);
    expect(exitScore).toBeLessThanOrEqual(100);
    expect(scoreBreakdown.reduce((s, d) => s + d.max, 0)).toBe(100);
    for (const d of scoreBreakdown) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(d.max);
    }
  });

  it("holds Founder Dependency at a neutral half (unreadable from Shopify)", () => {
    const founder = computeExitScore(makeMetrics()).scoreBreakdown.find(
      (d) => d.key === "founderDependency",
    )!;
    expect(founder.score).toBe(5); // round(10 * 0.5)
    expect(founder.status).toBe("amber");
  });

  it("assigns tiers by threshold", () => {
    // Drive the score with revenue + margins to land in each band.
    const emerging = computeExitScore(
      makeMetrics({
        revenueTTM: 5_000,
        grossMargin: 0.3,
        repeatRate: 0,
        growthRate: -0.3,
      }),
    );
    expect(emerging.scoreTier).toBe("Emerging");
    const strong = computeExitScore(
      makeMetrics({
        revenueTTM: 600_000,
        grossMargin: 0.72,
        repeatRate: 0.4,
        avgOrderValue: 120,
        growthRate: 0.4,
        topProductShare: 0.2,
        adSpendVerified: true,
        marketingEfficiencyRatio: 0.9,
      }),
    );
    expect(["Strong Asset", "Institutional Grade", "Solid Asset"]).toContain(
      strong.scoreTier,
    );
    expect(strong.exitScore).toBeGreaterThan(emerging.exitScore);
  });

  describe("dataConfidence", () => {
    it("rises with each verified connector and caps at 95", () => {
      const bare = computeExitScore(
        makeMetrics({ orderCount: 5, customerCount: 0, productCount: 0 }),
      ).dataConfidence;
      const rich = computeExitScore(
        makeMetrics({
          orderCount: 300,
          customerCount: 80,
          productCount: 10,
          adSpendVerified: true,
          ga4Connected: true,
          bankStatementsMonthCount: 3,
          plFileCount: 1,
        }),
      ).dataConfidence;
      expect(rich).toBeGreaterThan(bare);
      expect(rich).toBeLessThanOrEqual(95);
    });
  });

  describe("Product & Supply Risk no-data guard (regression)", () => {
    it("scores neutral 0.5 — NOT full marks — when there are no line items", () => {
      const dim = computeExitScore(
        makeMetrics({ productRevenue: [], topProductShare: 0 }),
      ).scoreBreakdown.find((d) => d.key === "productSupplyRisk")!;
      expect(dim.score).toBe(5); // round(10 * 0.5), not 10
      expect(dim.status).toBe("amber");
    });

    it("rewards genuinely low concentration with full marks", () => {
      const dim = computeExitScore(
        makeMetrics({
          topProductShare: 0.2,
          productRevenue: [
            { productId: "1", title: "A", revenue: 50, units: 5, share: 0.2 },
          ],
        }),
      ).scoreBreakdown.find((d) => d.key === "productSupplyRisk")!;
      expect(dim.score).toBe(10);
    });
  });
});

// ---------------------------------------------------------------------------
describe("computeValuation", () => {
  it("picks the multiple from the exit score band", () => {
    const m = makeMetrics({ sde: 100_000 });
    expect(computeValuation(m, 80).currentMultiple).toBe(2.6);
    expect(computeValuation(m, 65).currentMultiple).toBe(2.1);
    expect(computeValuation(m, 40).currentMultiple).toBe(1.7);
  });

  it("orders the range low < mid < high and leaves a positive value gap", () => {
    const v = computeValuation(makeMetrics({ sde: 100_000 }), 80);
    expect(v.valuationLow).toBeLessThan(v.valuationMid);
    expect(v.valuationMid).toBeLessThan(v.valuationHigh);
    expect(v.valuationOptimised).toBeGreaterThan(v.valuationMid);
    expect(v.valueGap).toBe(v.valuationOptimised - v.valuationMid);
    expect(v.valueGap).toBeGreaterThan(0);
    expect(v.adjustedEarnings).toBe(100_000);
    expect(v.fairMarket).toBe(v.valuationMid);
    expect(v.quickSale).toBe(v.valuationLow);
  });

  it("always names the single-channel negative driver and never leaves positives empty", () => {
    const v = computeValuation(
      makeMetrics({
        grossMargin: 0.3,
        repeatRate: 0.05,
        growthRate: -0.2,
        businessAgeYears: 0.5,
      }),
      40,
    );
    expect(v.positiveDrivers.length).toBeGreaterThan(0);
    expect(
      v.negativeDrivers.some((d) => /single sales channel/i.test(d.name)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("computeRisks", () => {
  it("returns the three baseline risks sized against the value gap", () => {
    const m = makeMetrics({ sde: 100_000 });
    const v = computeValuation(m, 80);
    const risks = computeRisks(m, v);
    expect(risks).toHaveLength(3);
    const product = risks.find(
      (r) => r.title === "Product Concentration Risk",
    )!;
    expect(product.impact).toBe(-Math.round(v.valueGap * 0.35));
  });

  it("falls back to sde×0.4 for impact sizing when the gap is 0", () => {
    const m = makeMetrics({ sde: 100_000 });
    const v = { ...computeValuation(m, 80), valueGap: 0 };
    const risks = computeRisks(m, v);
    const product = risks.find(
      (r) => r.title === "Product Concentration Risk",
    )!;
    expect(product.impact).toBe(-Math.round(m.sde * 0.4 * 0.35));
  });

  it("escalates severity with concentration and retention", () => {
    const m = makeMetrics({ topProductShare: 0.6, repeatRate: 0.1 });
    const risks = computeRisks(m, computeValuation(m, 50));
    expect(
      risks.find((r) => r.title === "Product Concentration Risk")!.severity,
    ).toBe("high");
    expect(
      risks.find((r) => r.title === "Customer Retention Profile")!.severity,
    ).toBe("high");
  });

  describe("missing line-item data (regression)", () => {
    it("flags Product Concentration as medium 'can't verify', not a misleading low/0%", () => {
      const m = makeMetrics({ productRevenue: [], topProductShare: 0 });
      const product = computeRisks(m, computeValuation(m, 50)).find(
        (r) => r.title === "Product Concentration Risk",
      )!;
      expect(product.severity).toBe("medium");
      expect(product.description).toMatch(/isn't available|can't be verified/i);
      expect(product.description).not.toMatch(/\b0%/);
    });
  });

  it("adds a Traffic Concentration risk only when GA4 channel data exists", () => {
    const without = computeRisks(
      makeMetrics(),
      computeValuation(makeMetrics(), 60),
    );
    expect(without.some((r) => r.title === "Traffic Concentration Risk")).toBe(
      false,
    );
    const m = makeMetrics({
      ga4Connected: true,
      trafficChannelConcentration: 0.7,
    });
    const withGa4 = computeRisks(m, computeValuation(m, 60));
    const traffic = withGa4.find(
      (r) => r.title === "Traffic Concentration Risk",
    )!;
    expect(traffic).toBeDefined();
    expect(traffic.severity).toBe("high");
  });
});

// ---------------------------------------------------------------------------
describe("computeOptimization", () => {
  it("returns three actions whose uplifts sum to the full value gap", () => {
    const m = makeMetrics({ sde: 100_000 });
    const v = computeValuation(m, 80);
    const actions = computeOptimization(m, v);
    expect(actions).toHaveLength(3);
    const total = actions.reduce((s, a) => s + a.uplift, 0);
    // uplifts are 0.4 + 0.3 + 0.3 = 1.0 × gap (subject to rounding).
    expect(Math.abs(total - v.valueGap)).toBeLessThanOrEqual(2);
  });

  it("raises priority to high for severe concentration / retention", () => {
    const m = makeMetrics({ topProductShare: 0.6, repeatRate: 0.1 });
    const actions = computeOptimization(m, computeValuation(m, 50));
    expect(
      actions.find((a) => a.title === "Reduce Product Concentration")!.priority,
    ).toBe("high");
    expect(
      actions.find((a) => a.title === "Lift Repeat Purchase Rate")!.priority,
    ).toBe("high");
  });
});

// ---------------------------------------------------------------------------
describe("computeMetrics", () => {
  it("computes revenue, AOV and repeat rate from raw rows", () => {
    const orders = [
      makeOrder({ totalPrice: 100, customerId: "a" }),
      makeOrder({ totalPrice: 200, customerId: "b" }),
      makeOrder({ totalPrice: 300, customerId: "a" }),
    ];
    const m = computeMetrics(
      makeInput({
        orders,
        customers: [
          {
            shopifyCustomerId: "a",
            ordersCount: 2,
            totalSpent: 400,
            createdAt: daysAgo(200),
          },
          {
            shopifyCustomerId: "b",
            ordersCount: 1,
            totalSpent: 200,
            createdAt: daysAgo(100),
          },
        ],
      }),
    );
    expect(m.revenueAllTime).toBe(600);
    expect(m.orderCount).toBe(3);
    expect(m.avgOrderValue).toBe(200); // 600 / 3
    expect(m.repeatRate).toBe(0.5); // 1 of 2 customers ordered > once
    expect(m.returningCustomers).toBe(1);
    expect(m.newCustomers).toBe(1);
  });

  it("attributes per-product revenue and topProductShare from line items", () => {
    const orders = [
      makeOrder({
        lineItems: [
          { title: "Hero", quantity: 1, price: 300, productId: "p1" },
          { title: "Side", quantity: 1, price: 100, productId: "p2" },
        ],
      }),
    ];
    // The engine prefers the catalogued product title over the line-item title,
    // so supply matching products.
    const m = computeMetrics(
      makeInput({
        orders,
        products: [
          { shopifyProductId: "p1", title: "Hero", createdAt: daysAgo(400) },
          { shopifyProductId: "p2", title: "Side", createdAt: daysAgo(400) },
        ],
      }),
    );
    expect(m.topProductShare).toBe(0.75); // 300 / 400
    expect(m.productRevenue[0].title).toBe("Hero");
    expect(m.productRevenue[0].productId).toBe("p1");
  });

  it("leaves topProductShare 0 with an empty productRevenue when orders have no line items", () => {
    const m = computeMetrics(
      makeInput({ orders: [makeOrder({ lineItems: [] })] }),
    );
    expect(m.productRevenue).toHaveLength(0);
    expect(m.topProductShare).toBe(0);
  });

  it("selects the gross-margin benchmark by industry", () => {
    expect(
      computeMetrics(makeInput({ industry: "Beauty & Skincare" })).grossMargin,
    ).toBe(0.72);
    expect(computeMetrics(makeInput({ industry: "Apparel" })).grossMargin).toBe(
      0.65,
    );
    expect(
      computeMetrics(makeInput({ industry: "Consumer Electronics" }))
        .grossMargin,
    ).toBe(0.35);
    expect(
      computeMetrics(makeInput({ industry: "Home Goods" })).grossMargin,
    ).toBe(0.6);
  });

  describe("ad feed (Meta/Google/TikTok/Snapchat)", () => {
    it("verifies spend and blends ROAS from a real monthly feed", () => {
      const m = computeMetrics(
        makeInput({
          meta: {
            monthly: [
              {
                month: "2026-01",
                spend: 1000,
                conversions: 50,
                conversionValue: 3000,
                roas: 3,
              },
              {
                month: "2026-02",
                spend: 1000,
                conversions: 50,
                conversionValue: 3000,
                roas: 3,
              },
              {
                month: "2026-03",
                spend: 1000,
                conversions: 50,
                conversionValue: 3000,
                roas: 3,
              },
            ],
            campaigns: [{ name: "Prospecting", spend: 3000 }],
          },
        }),
      );
      expect(m.adSpendVerified).toBe(true);
      expect(m.adSpend).toBe(3000);
      expect(m.roas).toBe(3); // 9000 / 3000
      expect(m.adSpendStability).toBe(1); // identical monthly spend → zero variance
    });

    it("does NOT treat a single-month feed as perfectly stable (regression)", () => {
      const m = computeMetrics(
        makeInput({
          meta: {
            monthly: [
              {
                month: "2026-03",
                spend: 1000,
                conversions: 50,
                conversionValue: 3000,
                roas: 3,
              },
            ],
            campaigns: [{ name: "Prospecting", spend: 1000 }],
          },
        }),
      );
      expect(m.adSpendVerified).toBe(true);
      expect(m.adSpendStability).toBe(0.5); // neutral, not 1.0
    });

    it("uses Snapchat's account-level conversionValueTotal to drive ROAS (regression)", () => {
      const m = computeMetrics(
        makeInput({
          snapchat: {
            monthly: [
              {
                month: "2026-02",
                spend: 500,
                conversions: 0,
                conversionValue: 0,
                roas: 0,
              },
              {
                month: "2026-03",
                spend: 500,
                conversions: 0,
                conversionValue: 0,
                roas: 0,
              },
            ],
            campaigns: [{ name: "Snap", spend: 1000 }],
            conversionValueTotal: 4000,
          },
        }),
      );
      expect(m.adSpendVerified).toBe(true);
      expect(m.adSpend).toBe(1000);
      expect(m.roas).toBe(4); // 4000 / 1000 — would be 0 without conversionValueTotal
    });

    it("falls back to a benchmark spend estimate with no feed connected", () => {
      const m = computeMetrics(makeInput());
      expect(m.adSpendVerified).toBe(false);
      expect(m.roas).toBe(0);
    });
  });

  describe("GA4 traffic signal", () => {
    it("marks session growth available only with ≥6 months of history", () => {
      const short = computeMetrics(
        makeInput({
          ga4: {
            monthly: [
              { month: "2026-01", sessions: 100, conversions: 5 },
              { month: "2026-02", sessions: 120, conversions: 6 },
            ],
            channels: [],
          },
        }),
      );
      expect(short.ga4Connected).toBe(true);
      expect(short.sessionGrowthAvailable).toBe(false);

      const long = computeMetrics(
        makeInput({
          ga4: {
            monthly: [
              { month: "2026-01", sessions: 100, conversions: 5 },
              { month: "2026-02", sessions: 100, conversions: 5 },
              { month: "2026-03", sessions: 100, conversions: 5 },
              { month: "2026-04", sessions: 120, conversions: 6 },
              { month: "2026-05", sessions: 120, conversions: 6 },
              { month: "2026-06", sessions: 120, conversions: 6 },
            ],
            channels: [
              { channel: "Organic", sessions: 400, sessionShare: 0.6 },
              { channel: "Paid", sessions: 260, sessionShare: 0.4 },
            ],
          },
        }),
      );
      expect(long.sessionGrowthAvailable).toBe(true);
      expect(long.sessionGrowth).toBeCloseTo(0.2, 5); // 360 vs 300
      expect(long.trafficChannelConcentration).toBe(0.6);
      expect(long.topTrafficChannel).toBe("Organic");
    });
  });
});

// ---------------------------------------------------------------------------
describe("determinism", () => {
  it("produces identical output for identical input", () => {
    const input = makeInput({
      orders: [
        makeOrder({ totalPrice: 120, customerId: "a" }),
        makeOrder({ totalPrice: 80, customerId: "b" }),
      ],
    });
    expect(computeFullReport(input)).toEqual(computeFullReport(input));
  });

  it("hasStoreData reflects presence of orders", () => {
    expect(hasStoreData(makeInput())).toBe(true);
    expect(hasStoreData(makeInput({ orders: [] }))).toBe(false);
  });
});
