# ExitEcom — How the reports are calculated

This document explains, feature by feature, exactly how ExitEcom turns raw
Shopify data into the four reports under **Exit Analysis**:

1. [Exit Readiness Score](#2-exit-readiness-score)
2. [Risk Scanner](#3-risk-scanner)
3. [Valuation Engine](#4-valuation-engine)
4. [Optimization Plan](#5-optimization-plan)

> **Golden rule:** every number is computed in plain, auditable code in
> [`src/lib/analytics.ts`](../src/lib/analytics.ts) — synchronously and
> deterministically. The same raw data always produces the same numbers. AI
> (Gemini, [`src/lib/ai.ts`](../src/lib/ai.ts)) is optional and only rewrites the
> _prose_ of risk/action copy; it never produces or alters a figure.

All four reports are derived from a single shared layer of **base metrics**, so
that layer is documented first.

---

## 0. The pipeline (how a report runs)

```
Raw Shopify data (orders, products, customers, store)
        │
        ▼
computeMetrics()      → StoreMetrics         (§1 base metrics)
        │
        ├─▶ computeExitScore(metrics)         → ExitScoreResult     (§2)
        │           │
        │           ▼
        ├─▶ computeValuation(metrics, exitScore) → ValuationResult  (§4)
        │           │
        │           ├─▶ computeRisks(metrics, valuation)   → RiskItem[]   (§3)
        │           └─▶ computeOptimization(metrics, valuation) → ActionItem[] (§5)
        ▼
computeFullReport() bundles all of the above + a persistable businessUpdate
```

- Orchestrated by `computeFullReport()`
  ([`analytics.ts:644`](../src/lib/analytics.ts)) and triggered by the user
  pressing **Run** on any report page (`useReport.run()`,
  [`useReport.ts:55`](../src/hooks/useReport.ts)).
- Notice the dependency chain: **Score feeds Valuation, and Valuation feeds both
  Risks and the Optimization Plan.** The `valueGap` produced by the Valuation
  Engine is the common currency that Risks and Actions are sized against.

### Inputs (`AnalyticsInput`)

| Field       | Source                                                        |
| ----------- | ------------------------------------------------------------- |
| `orders`    | `shopify_orders` — each with `totalPrice`, `createdAt`, `customerId`, `lineItems[]` |
| `products`  | `shopify_products`                                            |
| `customers` | `shopify_customers` — each with `ordersCount`, `totalSpent`   |
| `store`     | `shopify_stores` — `currency`, `country`, `shopCreatedAt`     |
| `industry`  | The founder's onboarding answer (drives the gross-margin benchmark) |

### Why benchmarks exist

Shopify's order feed tells us **revenue**, **order counts**, **customers**, and
**product mix** — but **not** the store's true COGS, ad spend, or overheads
(those live in tools we don't read). For those, the engine uses **explicit,
industry-standard constants** (clearly labelled in the code). They are
assumptions, not guesses, and they're the same for every store in a given
industry so results stay comparable and auditable.

---

## 1. Base metrics (`computeMetrics`)

Source: [`analytics.ts:159`](../src/lib/analytics.ts). Produces a `StoreMetrics`
object consumed by all four reports.

### 1.1 Revenue

| Metric             | Logic |
| ------------------ | ----- |
| `revenueAllTime`   | Sum of `totalPrice` across **all** orders. |
| `revenueTTM`       | Sum of `totalPrice` for orders in the **last 365 days**. **Fallback:** if every order predates the window (so TTM = 0) but orders exist, it annualizes all-time revenue over the actual trading span: `revenueAllTime × (365 / spanDays)`. |
| `revenueMonthly[]` | 12 calendar-month buckets (oldest → newest), each summing that month's order totals. Used for the dashboard chart and growth. |
| `avgOrderValue`    | `revenueAllTime / orderCount`, rounded to 2 dp (0 if no orders). |

### 1.2 Growth rate

```
last3  = sum of the 3 most recent monthly buckets   (indices 9–11)
prior3 = sum of the 3 buckets before that            (indices 6–8)
growthRate = prior3 > 0 ? (last3 − prior3) / prior3 : 0
```

A trailing-quarter-over-prior-quarter momentum figure. `0` when there isn't
enough history. (`analytics.ts:208`)

### 1.3 Repeat rate & customer split

Two paths, preferring the richer source:

- **If the customers feed is present:** `repeatRate = (customers with ordersCount > 1) / total customers`.
- **Otherwise (fallback):** reconstruct per-customer order counts from
  `order.customerId` linkage and compute the same ratio.

```
newCustomers       = max(0, totalCustomers − returningCustomers)
returningCustomers = customers who ordered more than once
```
(`analytics.ts:213`)

### 1.4 Product concentration (`topProductShare`)

Revenue is attributed per product from **real line items**
(`lineItem.price × quantity`), keyed by `productId` (falling back to title).
Each product's `share` = its revenue ÷ total line-item revenue. Products are
sorted by revenue, and:

```
topProductShare = share of the single highest-revenue product   (0–1)
```
This is the headline "single-SKU dependency" signal used by both the Score and
the Risk Scanner. (`analytics.ts:231`)

### 1.5 Margins & earnings (benchmark-driven)

These are the constants the order feed can't supply:

| Quantity     | Formula                              | Notes |
| ------------ | ------------------------------------ | ----- |
| `grossMargin`| Industry benchmark:<br>• beauty / skincare → **0.72**<br>• apparel / fashion → **0.65**<br>• electronics → **0.35**<br>• everything else → **0.60** | Chosen by matching the onboarding `industry` string. |
| `netMargin`  | **0.18** (flat benchmark)            | |
| `grossProfit`| `revenueTTM × grossMargin`           | |
| `cogs`       | `revenueTTM − grossProfit`           | |
| `ebitda`     | `revenueTTM × netMargin`             | |
| **`sde`**    | `ebitda × 1.25`                      | Seller's Discretionary Earnings — **the basis the valuation multiplies.** |
| `opex`       | `grossProfit − ebitda`               | |
| `adSpend`    | `revenueTTM × 0.22`                  | Benchmark (no ad-platform feed). |
| `netRevenue` | `revenueTTM × 0.95`                  | After returns/discounts allowance. |
| `roas`       | `0`                                  | Unknown without an ad connection. |

(`analytics.ts:271`)

### 1.6 Business age

`businessAgeYears = (now − store.shopCreatedAt) / 1 year`, floored at 0; `0` if
the store creation date is unknown. (`analytics.ts:291`)

---

## 2. Exit Readiness Score

**Page:** `/exit-score` · **Function:** `computeExitScore(metrics)`
([`analytics.ts:334`](../src/lib/analytics.ts))

A score out of **100** built from **9 weighted dimensions**. The weights (max
points) sum to exactly 100.

### 2.1 The dimensions

Each dimension computes a `ratio` (how close the store is to the benchmark),
clamps it to `[0, 1]`, then awards `score = round(max × ratio)`.

| # | Dimension | Max | Ratio formula | What it rewards |
| - | --------- | --- | ------------- | --------------- |
| 1 | **Financial Quality** | 15 | `(grossMargin/0.7 + netMargin/0.2) / 2` | Healthy margins vs. a 70%/20% target. |
| 2 | **Revenue Quality** | 10 | `revenueTTM / 500,000` | Absolute scale; full marks at ~£500k TTM. |
| 3 | **Marketing Efficiency & Stability** | 15 | `repeatRate / 0.3` | Retention as a proxy for non-paid stability; full marks at 30% repeat. |
| 4 | **Customer Economics** | 10 | `(repeatRate/0.3 + avgOrderValue/80) / 2` | Repeat rate **and** AOV (target £80). |
| 5 | **Product & Supply Risk** | 10 | `1 − (topProductShare − 0.2)/0.6` | _Lower_ concentration scores higher. ~20% share ≈ full marks; ~80% ≈ zero. |
| 6 | **Operational Maturity** | 10 | `(clamp(productCount/20) + clamp(orderCount/200)) / 2` | Catalogue breadth + order volume. |
| 7 | **Founder Dependency** | 10 | `0.5` (fixed) | Can't be read from Shopify → **neutral** placeholder. |
| 8 | **Growth Trajectory & Potential** | 10 | `(growthRate + 0.1)/0.4` | Recent momentum; flat growth ≈ 0.25 ratio. |
| 9 | **Platform & Channel Risk** | 10 | `0.6` (fixed) | Single channel (Shopify only) → moderate default. |

> Dimensions 7 and 9 are **fixed** because the underlying facts (who runs the
> business, what other channels exist) aren't in the Shopify feed. They're held
> at honest, moderate defaults rather than guessed.

### 2.2 Status colour per dimension

```
ratio ≥ 0.66 → green
ratio ≥ 0.40 → amber
else         → red
```
(`statusFor`, [`analytics.ts:148`](../src/lib/analytics.ts))

### 2.3 Total, tier & confidence

```
exitScore = Σ dimension scores            (0–100)
```

| `exitScore` | Tier |
| ----------- | ---- |
| ≥ 80 | **Institutional Grade** |
| ≥ 70 | **Strong Asset** |
| ≥ 55 | **Solid Asset** |
| else | **Emerging** |

**Data Confidence** (how much real data backs the score):
```
dataConfidence = 50 + clamp(orderCount/200) × 30
               + 10 if customerCount > 0
               + 10 if productCount  > 0
capped at 95
```
So a brand-new store with a handful of orders sits near 50%, and a store with
200+ orders plus customer and product data approaches the 95% cap.

---

## 3. Risk Scanner

**Page:** `/risk-scanner` · **Function:** `computeRisks(metrics, valuation)`
([`analytics.ts:488`](../src/lib/analytics.ts))

Surfaces the risks a buyer prices in, and quantifies each in **£ impact on
valuation**. Impacts are sized as fractions of the **value gap** from the
Valuation Engine:

```
gap = valuation.valueGap || round(sde × 0.4)     // fallback if gap is 0
```

The scanner always returns **three risks**, each with a data-driven severity and
a monetary impact:

| Risk | Severity logic | £ Impact | Always shown |
| ---- | -------------- | -------- | ------------ |
| **Product Concentration Risk** | `topProductShare > 0.5` → high · `> 0.35` → medium · else low | `−round(gap × 0.35)` | yes |
| **Customer Retention Profile** | `repeatRate < 0.2` → high · `< 0.3` → medium · else low | `−round(gap × 0.25)` | yes |
| **Single-Channel Dependency** | fixed **medium** | `−round(gap × 0.2)` | yes |

Each risk carries five narrative fields, generated from the metrics:
`description` (with the live numbers interpolated, e.g. _"top product accounts
for 62% of order-line revenue"_), plus `buyerSees`, `buyerFears`, `buyerDoes`,
and a `recommendation`. These strings are deterministic templates — and are the
only thing Gemini may later rephrase (never the numbers).

> **Related score field:** `riskScore = max(0, 100 − exitScore)`
> (`buildBusinessUpdate`, [`analytics.ts:629`](../src/lib/analytics.ts)) — the
> inverse of the Exit Score, shown as an overall risk read-out.

---

## 4. Valuation Engine

**Page:** `/valuation` · **Function:** `computeValuation(metrics, exitScore)`
([`analytics.ts:408`](../src/lib/analytics.ts))

Turns earnings into a buyer-grade valuation **range** using an SDE multiple that
is itself driven by the Exit Score.

### 4.1 The multiple

```
currentMultiple   = exitScore ≥ 75 → 2.6
                    exitScore ≥ 60 → 2.1
                    else           → 1.7
optimisedMultiple = round(currentMultiple × 1.4, 1 dp)   // the multiple after fixing risks
```
A better Exit Score literally buys a higher multiple — this is the mechanism
that links the Score page to the money.

### 4.2 The range

With `sde` from §1.5:

| Output | Formula | Meaning |
| ------ | ------- | ------- |
| `valuationMid` / `fairMarket` | `sde × currentMultiple` | Headline fair-market value. |
| `valuationLow` / `quickSale`  | `sde × (currentMultiple − 0.3)` | Conservative / quick-sale floor. |
| `valuationHigh`               | `sde × (currentMultiple + 0.3)` | Optimistic ceiling at today's quality. |
| `valuationOptimised` / `optimised` | `sde × optimisedMultiple` | Value achievable after executing the plan. |
| **`valueGap`** | `valuationOptimised − valuationMid` | **The prize** — value left on the table. Feeds Risks (§3) and Actions (§5). |
| `adjustedEarnings` | `= sde` | The earnings base, surfaced for transparency. |

### 4.3 Value drivers

The engine also produces qualitative `positiveDrivers` / `negativeDrivers` with
illustrative multiple deltas (e.g. `+0.3x`, `−0.3x`):

- **Positive** (added when true): gross margin ≥ 65%, repeat rate ≥ 25%, growth
  > 5%, ≥ 2 years trading. If none qualify, it shows "Live, verifiable order
  data (+0.1x)" so the list is never empty.
- **Negative** (added when true): top-product share > 40%, repeat rate < 20%,
  < 2 years history — **plus** an always-present "Single sales channel (Shopify
  only) (−0.2x)".

These labels explain the multiple to the user; the actual multiple comes from
§4.1 (driven by the Exit Score), not by summing these deltas.

---

## 5. Optimization Plan

**Page:** `/optimization` · **Function:**
`computeOptimization(metrics, valuation)`
([`analytics.ts:540`](../src/lib/analytics.ts))

A prioritised, costed roadmap: each action carries an **£ uplift** (a slice of
the value gap it would recover) and a time estimate. Same `gap` basis as Risks:

```
gap = valuation.valueGap || round(sde × 0.4)
```

| Action | Priority logic | £ Uplift | Time |
| ------ | -------------- | -------- | ---- |
| **Reduce Product Concentration** | `topProductShare > 0.5` → high, else medium | `round(gap × 0.4)` | 3–6 weeks |
| **Lift Repeat Purchase Rate** | `repeatRate < 0.2` → high, else medium | `round(gap × 0.3)` | 2–4 weeks |
| **Diversify Acquisition Channels** | fixed medium | `round(gap × 0.3)` | 4–8 weeks |

Each action includes a `problem` line (with live numbers, e.g. _"62% revenue
concentration suppresses the multiple"_) and concrete `steps[]`. The three
uplifts (0.4 + 0.3 + 0.3 = **1.0 × gap**) are designed to add up to the full
value gap — i.e. executing the whole plan closes the gap between `fairMarket`
and `optimised`.

> **Mirror of the Risk Scanner:** the three actions map one-to-one onto the
> three risks — concentration, retention, channel — so the plan is literally
> "fix what the buyer is afraid of."

---

## 6. Persistence & display

After computing, `buildBusinessUpdate()`
([`analytics.ts:586`](../src/lib/analytics.ts)) flattens everything into the
shape stored in Supabase (`valuation_data`, `risks`, `actions`) and cached in
`localStorage`. Key persisted roll-ups:

| Field | Source |
| ----- | ------ |
| `riskScore` | `max(0, 100 − exitScore)` |
| `totalValueLost` | `= valueGap` |
| `dataConfidence` | from the Exit Score |

On revisit, identical raw data re-computes to identical numbers, so the cached
report and a fresh computation always agree (`useReport`,
[`useReport.ts:49`](../src/hooks/useReport.ts)).

---

## 7. Worked example (sandbox data)

The built-in sandbox (`buildSandbox`, [`shopify.ts:254`](../src/lib/shopify.ts))
generates a skincare store: 45 orders, 5 products, 12 customers, GBP, ~1 year
old. Tracing it through the engine:

1. **Metrics:** `industry = "skincare"` → `grossMargin = 0.72`; sums orders into
   `revenueTTM`; `sde = revenueTTM × 0.18 × 1.25`; computes `topProductShare`
   from the 5-SKU mix and `repeatRate` from the 12 customers.
2. **Score:** the 9 dimensions are scored against their benchmarks → `exitScore`
   and tier.
3. **Valuation:** `exitScore` picks the multiple (1.7 / 2.1 / 2.6) → range +
   `valueGap`.
4. **Risks & Actions:** sized as the `gap` fractions in §3 and §5.

Because all of this is pure and synchronous, you can verify any figure by hand
from the raw rows on the **Store Data** page — that's the whole point of the
deterministic design.
```

