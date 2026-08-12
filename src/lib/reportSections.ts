import type { FullReport } from "@/lib/analytics";

// Which sections make up each report the user can generate.
//
// The Reports page offers one report per tool — Exit Readiness Score, Risk
// Scanner, Valuation Engine, Optimization Plan — plus the Full Report that
// contains everything. They are all the same document component rendering a
// different slice of `computeFullReport`, so a figure can never disagree
// between two of them.
//
// Lives apart from ReportDocument so the document, the page's report picker and
// its sticky nav can all read the same list. Numbering is computed rather than
// fixed: sections are numbered in the order the chosen report includes them,
// and sections backed by an optional feed (Marketing needs a connected ad
// platform, Traffic needs GA4) are dropped when that feed is absent, with the
// sections after them closing up.

export interface ReportSection {
  id: string;
  title: string;
}

export type ReportTypeId =
  | "full"
  | "exit-score"
  | "risk"
  | "valuation"
  | "optimization";

export interface ReportType {
  id: ReportTypeId;
  name: string;
  /** Shown on the picker card and used as the document's cover title. */
  description: string;
  /** Section ids, in the order this report presents them. */
  sections: string[];
}

/** Untitled section headings, before per-report numbering is applied. */
const SECTION_TITLES: Record<string, string> = {
  summary: "Executive Summary",
  sources: "Data Sources & Confidence",
  overview: "Business Overview",
  financials: "Financial Performance",
  customers: "Customers & Retention",
  products: "Product Concentration",
  marketing: "Marketing Efficiency",
  traffic: "Traffic & Acquisition",
  score: "Exit Readiness Score",
  valuation: "Valuation",
  risks: "Risk Register",
  plan: "Optimization Plan",
  methodology: "Methodology & Basis of Preparation",
};

export const REPORT_TYPES: ReportType[] = [
  {
    id: "exit-score",
    name: "Exit Readiness Score",
    description:
      "How the business scores across all nine buyer-grade dimensions, and what drives each one.",
    sections: [
      "summary",
      "sources",
      "overview",
      "score",
      "customers",
      "products",
      "marketing",
      "traffic",
      "methodology",
    ],
  },
  {
    id: "valuation",
    name: "Valuation Engine",
    description:
      "What the business is worth today and after optimization, with the full earnings basis and every multiple driver.",
    sections: ["summary", "sources", "financials", "valuation", "methodology"],
  },
  {
    id: "risk",
    name: "Risk Scanner",
    description:
      "Every risk a buyer will find in diligence, what they will infer from it, and its modelled valuation impact.",
    sections: ["summary", "sources", "risks", "methodology"],
  },
  {
    id: "optimization",
    name: "Optimization Plan",
    description:
      "The prioritised actions that close your value gap, each with the steps to execute and the £ uplift it unlocks.",
    sections: ["summary", "valuation", "plan", "methodology"],
  },
  {
    id: "full",
    name: "Full Report",
    description:
      "Every figure we hold, as one buyer-grade document — financials, retention, product mix, marketing, score, valuation, risks and plan.",
    sections: [
      "summary",
      "sources",
      "overview",
      "financials",
      "customers",
      "products",
      "marketing",
      "traffic",
      "score",
      "valuation",
      "risks",
      "plan",
      "methodology",
    ],
  },
];

export function reportTypeById(id: ReportTypeId): ReportType {
  return (
    REPORT_TYPES.find((t) => t.id === id) ??
    REPORT_TYPES.find((t) => t.id === "full")!
  );
}

/** True when the underlying feed for an optional section is connected. */
function sectionAvailable(id: string, report: FullReport): boolean {
  if (id === "marketing") return report.metrics.adSpendVerified;
  if (id === "traffic") return report.metrics.ga4Connected;
  return true;
}

/**
 * Numbered section list for one report — the table of contents, and the source
 * of truth for which sections the document renders.
 */
export function reportSections(
  report: FullReport,
  typeId: ReportTypeId = "full",
): ReportSection[] {
  return reportTypeById(typeId)
    .sections.filter((id) => sectionAvailable(id, report))
    .map((id, i) => ({ id, title: `${i + 1}. ${SECTION_TITLES[id]}` }));
}
