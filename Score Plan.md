**Exit Readiness Score: Execution Plan**

# **STAGE 1: DATA INGESTION SYSTEM (EXPERT-LEVEL DESIGN)**

## **Objective**

Build a system that reconstructs a **complete economic \+ operational \+ risk picture** of the business from raw data.

This is NOT:

* “pull orders, products, customers”

This IS:

* **rebuild the business like a buyer would see it**

# **OVERVIEW: DATA SOURCES (FULL STACK)**

You need **multi-source ingestion**, not Shopify-only.

## **CORE SOURCES (MVP REQUIRED)**

### **1\. Shopify (Primary Source)**

### **2\. Ad Platforms**

* Meta Ads  
* Google Ads  
* Snapchat Ads  
* Tiktok Ads

### **3\. Financial Inputs**

* Manual \+ CSV upload  
* P\&L upload

## **SECONDARY (Phase 2 but architect now)**

* Stripe / PayPal  
* Google Analytics (GA4)  
* Profit tracking tools (Triple Whale-style tools)  
* Supplier / COGS input

# **CRITICAL PRINCIPLE**

You are not collecting data.  
 You are reconstructing **unit economics, risk, and sustainability**.

# **1️⃣ SHOPIFY DATA INGESTION (DEEP LEVEL)**

## **HOW TO CONNECT**

* Shopify OAuth (public app)  
* Required scopes:  
  * read\_orders  
  * read\_products  
  * read\_customers  
  * read\_analytics (via reports API)  
  * read\_inventory  
  * read\_marketing\_events

## **📦 RAW DATA YOU MUST PULL**

## **A. ORDERS (CORE ECONOMIC DATA)**

Pull ALL fields:

* order\_id  
* created\_at  
* total\_price  
* subtotal\_price  
* total\_discounts  
* total\_tax  
* shipping\_cost  
* refund\_amount  
* payment\_gateway  
* customer\_id  
* line\_items (nested)

## **Line Item Level (VERY IMPORTANT)**

* product\_id  
* variant\_id  
* quantity  
* price  
* discount\_allocations

👉 Why this matters:

You reconstruct:

* Revenue by product  
* Discounting behavior  
* True gross revenue vs net

## **B. PRODUCTS**

* product\_id  
* title  
* vendor  
* product\_type  
* variants:  
  * price  
  * compare\_at\_price  
  * SKU

👉 Used for:

* Product concentration  
* Pricing structure  
* SKU complexity

## **C. CUSTOMERS**

* customer\_id  
* total\_spent  
* orders\_count  
* first\_order\_date  
* last\_order\_date  
* location

👉 Used for:

* LTV estimation  
* Repeat rate  
* Cohorts

## **D. INVENTORY (CRITICAL FOR COGS ASSUMPTIONS)**

* inventory levels  
* inventory cost (if available)

## **E. REFUNDS / RETURNS**

* refund transactions  
* refunded line items

👉 Used for:

* Return rate  
* Quality issues  
* Revenue leakage

## **F. SHOPIFY ANALYTICS (UNDERUSED BUT CRITICAL)**

Use:

* Shopify Reports API

Pull:

### **Sales Reports:**

* Sales over time  
* Sales by product  
* Sales by channel

### **Customer Reports:**

* New vs returning customers  
* Customer cohort

### **Acquisition Reports:**

* Sessions by source

👉 This is where most tools fail—you MUST use this.

# **2️⃣ AD PLATFORM INGESTION**

## **META ADS**

Pull via Marketing API:

* Spend  
* Impressions  
* Clicks  
* CTR  
* CPC  
* CPA  
* ROAS

## **GOOGLE/ TITIKTOK/SNAPCHAT ADS**

Pull:

* Campaign performance  
* Conversion data  
* Spend

## **🔗 CRITICAL: ATTRIBUTION LINKING**

You must connect:

👉 Ad spend → Shopify revenue

Even if imperfect.

## **MVP APPROACH:**

* Ask user:  
  * “% of revenue from ads”  
* OR:  
  * Use UTM/source data (basic)

# **3️⃣ GOOGLE ANALYTICS (GA4)**

Pull:

* Sessions  
* Conversion rate  
* Traffic sources  
* Bounce rate

👉 This gives:

* Funnel quality  
* Conversion health

# **4️⃣ FINANCIAL DATA (CRITICAL GAP FILLER)**

## **A. Manual Input (MVP)**

Ask user:

* COGS %  
* Shipping cost %  
* Ad spend %  
* Fixed costs

## **B. P\&L Upload (CSV / PDF)**

Parse:

* Revenue  
* Expenses  
* Net profit

👉 Use LLM parsing if needed

# **5️⃣ PROFIT TRACKING TOOLS (OPTIONAL BUT POWERFUL)**

If user uses tools like:

* Triple Whale  
* Lifetimely

You can:

* Import cleaner data  
* Skip reconstruction

# **6️⃣ SUPPLIER / COST DATA**

Ask user:

* Cost per product  
* Shipping cost  
* Supplier dependency

👉 This is essential for:

* Margin accuracy  
* Risk scoring

# **DATA NORMALIZATION LAYER (CRITICAL)**

## **Problem:**

All data sources are messy and inconsistent.

## **Solution:**

Create unified schema:

## **CORE METRICS TABLE**

* revenue\_ttm  
* revenue\_monthly\[\]  
* gross\_profit  
* net\_profit  
* ad\_spend  
* cogs  
* contribution\_margin

## **CUSTOMER METRICS**

* repeat\_rate  
* avg\_order\_value  
* ltv\_estimate

## **PRODUCT METRICS**

* top\_product\_share  
* sku\_count

## **RISK METRICS**

* revenue\_concentration  
* channel\_dependency  
* platform\_dependency

# **DERIVED ANALYTICS (THIS IS WHERE INTELLIGENCE COMES FROM)**

## **1\. Revenue Quality**

* Growth rate (MoM)  
* Seasonality  
* Stability

## **2\. Profitability**

* EBITDA  
* Margin trends  
* Contribution margin

## **3\. Customer Economics**

* LTV/CAC proxy  
* Repeat rate  
* Cohort decay

## **4\. Product Risk**

* % revenue from top 1 / top 3 products

## **5\. Marketing Efficiency**

* ROAS  
* CAC trends

## **6\. Operational Risk**

* Refund rate  
* Order volatility

# **WHAT MAKES THIS “EXPERT LEVEL”**

Most tools:

❌ Pull data  
 ❌ Show dashboards

You:

✅ Reconstruct:

* Business quality  
* Sustainability  
* Risk profile  
* Buyer attractiveness

# **UX: DATA CONNECTION FLOW (IMPORTANT)**

## **SCREEN: CONNECT YOUR BUSINESS**

### **Section 1: Shopify**

✅ “Connect Shopify Store”

### **Section 2: Marketing**

* Connect Meta Ads  
* Connect Google Ads  
* Connect other Ads Account

### **Section 3: Financials**

* Upload P\&L  
* Input costs  
* Connect P\&L Tool/ Profit Calculator

### **Section 4: Optional**

* Connect GA4  
* Connect analytics tools

## **UX PRINCIPLE:**

👉 Make it feel like:  
 “Completing your business profile”

# 

# **CRITICAL TRADEOFFS**

## **You CANNOT rely only on Shopify**

Because:

* No true COGS  
* No full ad attribution  
* No full financial picture

## **So you MUST:**

👉 Combine:

* API data  
* User inputs  
* Estimations

# 

# **FINAL OUTPUT OF STAGE 1**

After ingestion, you should have:

## **FULL BUSINESS SNAPSHOT:**

|  |  |
| :---- | ----- |
| 1\. Financial Quality |  |
| 2\. Revenue Quality |  |
| 3\. Marketing Efficiency & Stability |  |
| 4\. Customer Economics |  |
| 5\. Product & Supply Risk |  |
| 6\. Operational Maturity |  |
| 7\. Founder Dependency (CRITICAL) |  |
| 8\. Growth Trajectory & Potential |  |
| 9\. Platform & Channel Risk |  |

👉 This feeds EVERYTHING:

* Exit Score  
* Risk Engine  
* Memo  
* Deal Advisor

# **FINAL INSIGHT**

If you do this right:

You will understand the business better than the founder does.

If you do this wrong:

Everything becomes a glorified calculator.

# **EXIT SCORE ENGINE v2 (ADVANCED MODEL)**

## **Core Philosophy**

The score is not about performance.  
 It’s about **how safe, transferable, and scalable the asset is.**

# **FINAL STRUCTURE**

Score \= **Weighted Multi-Dimensional Model (0–100)**

## **CATEGORY BREAKDOWN (NEW)**

| Category | Weight |
| ----- | ----- |
| 1\. Financial Quality | 15 |
| 2\. Revenue Quality | 10 |
| 3\. Marketing Efficiency & Stability | 15 |
| 4\. Customer Economics | 10 |
| 5\. Product & Supply Risk | 10 |
| 6\. Operational Maturity | 10 |
| 7\. Founder Dependency (CRITICAL) | 10 |
| 8\. Growth Trajectory & Potential | 10 |
| 9\. Platform & Channel Risk | 10 |

👉 Total \= 100

# **CATEGORY BREAKDOWN (DETAILED LOGIC)**

# **1️⃣ FINANCIAL QUALITY (15)**

### **Measures:**

* EBITDA/Earning/ Net Profit Margin  
* Margin consistency  
* Cost structure clarity

### **Scoring:**

* Margin \>25% → 18–20  
* 15–25% → 12–17  
* \<15% → 5–11

### **Penalties:**

* No clear cost breakdown → \-3  
* High volatility → \-3

# **2️⃣ REVENUE QUALITY (10)**

### **Measures:**

* Revenue consistency (monthly variance)  
* Seasonality  
* Refund rate

### **Scoring:**

* Stable \+ low refunds → 8–10  
* Moderate volatility → 5–7  
* Highly inconsistent → 1–4

# **3️⃣ MARKETING EFFICIENCY & STABILITY (15)**

### **Measures:**

* ROAS  
* CAC trends  
* Channel diversity

### **Scoring:**

* Strong \+ diversified → 12–15  
* Moderate → 5–11  
* Unstable / unknown → 1–4

# **4️⃣ CUSTOMER ECONOMICS (10)**

### **Measures:**

* Repeat purchase rate  
* LTV proxy  
* Retention

### **Scoring:**

* Strong repeat (\>30%) → 8–10  
* Moderate → 5–7  
* One-time buyers → 2–4

# **5️⃣ PRODUCT & SUPPLY RISK (10)**

### **Measures:**

* Product concentration  
* SKU diversity  
* Supplier dependency

### **Scoring:**

* Diversified → 8–10  
* Moderate concentration → 5–7  
* Single product reliance → 2–4

# **6️⃣ OPERATIONAL MATURITY (10)**

### **Measures:**

* SOP presence  
* Team structure  
* Automation

### **Scoring:**

* Fully systemized → 8–10  
* Partial → 5–7  
* Founder-run → 2–4

# **7️⃣ FOUNDER DEPENDENCY (10) 🚨 (HIGH IMPACT)**

### **Measures:**

* Who runs ads?  
* Who manages suppliers?  
* Who handles ops?  
* 

### **Scoring:**

* Fully delegable → 8–10  
* Partial dependency → 5–7  
* Fully dependent → 1–4

👉 This is a **deal killer category**

# **8️⃣ GROWTH TRAJECTORY & POTENTIAL (10)**

### **Measures:**

* Revenue trend (MoM)  
* Untapped channels  
* Expansion potential

### **Scoring:**

* Growing \+ clear upside → 8–10  
* Flat → 5–7  
* Declining → 2–4

# **9️⃣ PLATFORM & CHANNEL RISK (10)**

### **Measures:**

* Shopify vs Amazon vs Etsy dependency or other market places  
* Traffic concentration (Do traffic come from one platform or is it diversified)

### **Scoring:**

* Diversified → 8–10  
* Moderate risk → 4–7  
* High dependency →1–3

# **BONUS LAYER: CONFIDENCE SCORE (IMPORTANT)**

You also compute:

👉 **Data Confidence Score (0–100)**

Because:

* Full integrations → high confidence  
* Manual inputs → lower

# **⚙️ FINAL SCORE CALCULATION**

## **Step 1:**

Calculate each category score

## **Step 2:**

Apply weights

## **Step 3:**

Sum → Final Score

## **Step 4:**

Apply modifiers:

### **🚨 Risk Penalty Layer**

* Single product \>70% revenue → \-5  
* Founder dependency high → \-5  
* Declining revenue → \-5

# **🏷️ FINAL TIERS (REFINED)**

| Score | Tier | Meaning |
| ----- | ----- | ----- |
| 0–40 | Weak | Hard to sell |
| 40–60 | Average | Sellable with discount |
| 60–75 | Strong | Good asset |
| 75–85 | Premium | Competitive |
| 85+ | Institutional | Highly desirable |

# **WHY THIS MODEL IS POWERFUL**

## **It mirrors buyer thinking:**

Buyers ask:

* “Is revenue stable?”  
* “Can I run this without the founder?”  
* “What’s the downside risk?”  
* “What’s the upside?”

👉 Your score answers all of that in one number

# **HOW THIS SHOWS ON UI**

## **Instead of:**

“Score: 62”

## **You show:**

### **EXIT SCORE: 62 / 100**

**“Strong asset, but risk-adjusted value is suppressed”**

### **Breakdown:**

* Financial Quality: 11/15  
* Revenue Quality: 7/10  
* Marketing Efficiency: 10/15  
* Customers Economics: 5/10  
* Product & Supply Risk: 4/10  
* Operational Maturity: 6/10  
* Founder’s Dependency: 3/10 🚨  
* Growth Trajectory: 8/10  
* Platform & Channel Risk: 8/10

# **KEY INSIGHT FOR PRODUCT**

The score is not just a number.

It must feel like:

👉 “A buyer just audited my business in 10 seconds”

# **🔥 FINAL TRUTH**

If this scoring engine is done right:

👉 It becomes your moat

Because over time:

* You learn what drives multiples  
* You refine scoring  
* You outperform brokers

