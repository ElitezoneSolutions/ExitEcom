export const mockBusiness = {
  name: "NovaSkin Co.",
  ownerName: "Eleanor",
  industry: "Beauty & Skincare",
  channel: "Shopify + Meta",
  age: "2.4 years",
  country: "United Kingdom",
  url: "novaskin.co",

  revenueTTM: 420000,
  revenueMonthly: [
    { m: "Jan", v: 32000 }, { m: "Feb", v: 34000 }, { m: "Mar", v: 31000 },
    { m: "Apr", v: 38000 }, { m: "May", v: 40000 }, { m: "Jun", v: 42000 },
    { m: "Jul", v: 39000 }, { m: "Aug", v: 41000 }, { m: "Sep", v: 45000 },
    { m: "Oct", v: 44000 }, { m: "Nov", v: 47000 }, { m: "Dec", v: 49000 },
  ],
  ebitda: 84000,
  sde: 130400,
  grossMargin: 0.54,
  netMargin: 0.20,
  adSpend: 96000,
  cogs: 168000,
  grossProfit: 230400,
  opex: 120000,
  grossRevenue: 420000,
  netRevenue: 398400,

  exitScore: 62,
  scoreTier: "Strong Asset",
  scoreBreakdown: [
    { key: "financialQuality", name: "Financial Quality", score: 11, max: 15, status: "amber" },
    { key: "revenueQuality", name: "Revenue Quality", score: 7, max: 10, status: "amber" },
    { key: "marketingEfficiency", name: "Marketing Efficiency & Stability", score: 10, max: 15, status: "amber" },
    { key: "customerEconomics", name: "Customer Economics", score: 5, max: 10, status: "amber" },
    { key: "productSupplyRisk", name: "Product & Supply Risk", score: 4, max: 10, status: "red" },
    { key: "operationalMaturity", name: "Operational Maturity", score: 6, max: 10, status: "amber" },
    { key: "founderDependency", name: "Founder Dependency", score: 3, max: 10, status: "red" },
    { key: "growthTrajectory", name: "Growth Trajectory & Potential", score: 8, max: 10, status: "green" },
    { key: "platformChannelRisk", name: "Platform & Channel Risk", score: 8, max: 10, status: "green" },
  ] as const,

  valuationLow: 180000,
  valuationMid: 220000,
  valuationHigh: 260000,
  valuationOptimised: 340000,
  currentMultiple: 1.6,
  optimisedMultiple: 2.4,
  quickSale: 90000,
  fairMarket: 220000,
  optimised: 340000,
  adjustedEarnings: 100000,
  valueGap: 80000,

  repeatRate: 0.24,
  avgOrderValue: 68,
  roas: 2.8,

  topProductShare: 0.72,
  riskScore: 48,
  totalValueLost: 120000,

  dataConfidence: 72,
  connectedSources: ["shopify", "meta_ads", "google_ads"],
  missingSources: ["ga4", "pl_upload", "stripe"],
};

export const topRisks = [
  {
    title: "Product Concentration",
    severity: "high" as const,
    description: "72% of revenue comes from a single SKU.",
    impact: -45000,
    buyerSees: "A single-product business with no resilience to category shifts or supplier issues.",
    buyerFears: "If demand for the hero SKU softens by 20%, valuation collapses.",
    buyerDoes: "Lower offer by 0.3x or insert a 24-month earnout tied to product diversification.",
    recommendation: "Launch 2 adjacent SKUs within 90 days and rebalance ad spend to drive trial.",
  },
  {
    title: "Founder Dependency",
    severity: "high" as const,
    description: "Founder personally manages ads, ops and supplier relationships.",
    impact: -35000,
    buyerSees: "A job, not a transferable asset. The business is the founder.",
    buyerFears: "Operations stall the moment the founder steps away post-close.",
    buyerDoes: "Demand a 6-12 month transition agreement or walk away.",
    recommendation: "Document SOPs across the 5 highest-leverage workflows and assign deputies.",
  },
  {
    title: "Marketing Channel Risk",
    severity: "medium" as const,
    description: "85% of acquisition is paid Meta, with no organic moat.",
    impact: -40000,
    buyerSees: "A business renting attention, not owning it.",
    buyerFears: "iOS, algorithm or auction shifts erase margin overnight.",
    buyerDoes: "Discount EBITDA multiple or require channel diversification proof.",
    recommendation: "Stand up an SEO content engine and email/SMS lifecycle in 60 days.",
  },
];

export const additionalRisks = [
  { title: "Limited Operating History", severity: "medium" as const, description: "Under 3 years of trading history caps comparable multiples.", impact: -15000 },
  { title: "Thin Margin Buffer", severity: "low" as const, description: "Net margin sits 4 pts below category benchmark.", impact: -8000 },
  { title: "Single Fulfilment Partner", severity: "medium" as const, description: "All shipping concentrated through one 3PL.", impact: -12000 },
];

export const topActions = [
  {
    title: "Reduce Product Concentration",
    priority: "high" as const,
    uplift: 45000,
    time: "2–6 weeks",
    problem: "72% of revenue from 1 product suppresses multiple by 0.3x.",
    steps: [
      "Identify 2 adjacent SKUs with overlapping customer intent.",
      "Allocate 25% of monthly ad budget to launch trials.",
      "Track per-SKU contribution margin weekly for 90 days.",
    ],
  },
  {
    title: "Document SOPs & Reduce Founder Dependency",
    priority: "high" as const,
    uplift: 35000,
    time: "3–6 weeks",
    problem: "Founder is the single point of failure across ads, ops and suppliers.",
    steps: [
      "Map the 10 most repeated workflows owned by founder.",
      "Record loom-based SOPs for each and store in the data room.",
      "Assign a deputy for each workflow and shadow for two weeks.",
    ],
  },
  {
    title: "Diversify Marketing Channels",
    priority: "medium" as const,
    uplift: 40000,
    time: "4–8 weeks",
    problem: "85% paid acquisition with no organic moat suppresses defensibility.",
    steps: [
      "Stand up a 12-piece SEO content roadmap targeting category intent.",
      "Launch a 6-step email lifecycle covering welcome, browse, post-purchase.",
      "Open a TikTok organic channel with 4 posts/week to build owned audience.",
    ],
  },
];

export const positiveDrivers = [
  { name: "Consistent revenue history", impact: "+0.2x" },
  { name: "Strong growth trajectory (+18% YoY)", impact: "+0.3x" },
  { name: "Healthy gross margin (54%)", impact: "+0.2x" },
  { name: "Diversified channels", impact: "+0.1x" },
];

export const negativeDrivers = [
  { name: "Founder dependency", impact: "-0.3x" },
  { name: "Product concentration", impact: "-0.3x" },
  { name: "Limited operating history", impact: "-0.2x" },
  { name: "Paid-acquisition reliance", impact: "-0.2x" },
];

export const addBacks = [
  { item: "Owner salary above market", amount: 30000, type: "Owner-related" },
  { item: "One-time legal cost", amount: 5000, type: "One-time" },
  { item: "Personal expense (travel)", amount: 3200, type: "Owner-related" },
];

export const dataRoomCategories = [
  {
    name: "Financial Documents",
    items: [
      { name: "Profit & Loss Statement (12 months)", uploaded: true },
      { name: "Revenue by Channel", uploaded: true },
      { name: "Ad Spend Report", uploaded: true },
      { name: "Balance Sheet", uploaded: false },
      { name: "Bank Statements (3 months)", uploaded: false },
      { name: "Tax Returns", uploaded: false },
      { name: "COGS Documentation", uploaded: false },
    ],
  },
  {
    name: "Operations Documents",
    items: [
      { name: "Product Catalog", uploaded: true },
      { name: "Supplier Contracts", uploaded: false },
      { name: "SOP Documentation", uploaded: false },
      { name: "Team Structure", uploaded: false },
      { name: "Technology Stack Overview", uploaded: false },
    ],
  },
  {
    name: "Marketing Evidence",
    items: [
      { name: "Meta Ads Performance", uploaded: true },
      { name: "Google Ads Performance", uploaded: true },
      { name: "Shopify Analytics Export", uploaded: true },
      { name: "Email Marketing Stats", uploaded: false },
    ],
  },
  {
    name: "Legal Documents",
    items: [
      { name: "Articles of Incorporation", uploaded: false },
      { name: "Trademark Registrations", uploaded: false },
      { name: "Material Contracts", uploaded: false },
    ],
  },
];

export const fmtGBP = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

export const fmtGBPk = (n: number) => {
  if (Math.abs(n) >= 1000) return `£${(n / 1000).toFixed(0)}k`;
  return fmtGBP(n);
};
