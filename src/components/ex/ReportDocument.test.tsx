import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDocument } from "./ReportDocument";
import { computeFullReport, type AnalyticsInput } from "@/lib/analytics";
import { REPORT_TYPES, reportSections } from "@/lib/reportSections";
import type { BusinessData } from "@/hooks/useBusinessData";

// Renders every report end to end against a real `computeFullReport` result.
//
// The section-slicing rules are covered by reportSections.test.ts; this is the
// other half — that the document actually renders each slice, that no section
// body is missing, and that nothing reaches a buyer as "undefined" or "NaN".
// It renders to static markup rather than asserting on layout, so it survives
// restyling while still catching a section wired to an id the document doesn't
// know, or a figure formatted from a missing field.

/** React escapes `&` in text nodes, so assertions on titles have to match. */
const esc = (s: string) => s.replace(/&/g, "&amp;");

const MONTHS = 14;
const day = (monthsAgo: number, d: number) => {
  const t = new Date(Date.UTC(2026, 7, 12));
  t.setUTCMonth(t.getUTCMonth() - monthsAgo);
  t.setUTCDate(d);
  return t.toISOString();
};

const input: AnalyticsInput = {
  store: {
    name: "Velvety Skin Co.",
    currency: "GBP",
    country: "GB",
    shopCreatedAt: day(48, 1),
  },
  orders: Array.from({ length: MONTHS * 6 }, (_, i) => {
    const monthsAgo = Math.floor(i / 6);
    return {
      totalPrice: 40 + (i % 5) * 12,
      createdAt: day(monthsAgo, (i % 27) + 1),
      customerId: `c${i % 30}`,
      lineItems: [
        {
          title: i % 3 === 0 ? "Hero Serum" : "Day Cream",
          quantity: 1,
          price: 40 + (i % 5) * 12,
          productId: i % 3 === 0 ? "p1" : "p2",
        },
      ],
    };
  }),
  products: [
    { shopifyProductId: "p1", title: "Hero Serum", createdAt: day(40, 1) },
    { shopifyProductId: "p2", title: "Day Cream", createdAt: day(30, 1) },
  ],
  customers: Array.from({ length: 30 }, (_, i) => ({
    shopifyCustomerId: `c${i}`,
    ordersCount: (i % 3) + 1,
    totalSpent: 100 + i * 10,
    createdAt: day(20 - (i % 18), 1),
  })),
  industry: "Health & Beauty",
  meta: {
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, "0")}`,
      spend: 2000 + i * 25,
      conversions: 120,
      conversionValue: 8000,
      roas: 4,
    })),
    campaigns: [
      { name: "Prospecting", spend: 15000 },
      { name: "Retargeting", spend: 9000 },
    ],
  },
  ga4: {
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, "0")}`,
      sessions: 20000 + i * 300,
      conversions: 400,
    })),
    channels: [
      { channel: "Organic Social", sessions: 180000, sessionShare: 0.82 },
      { channel: "Direct", sessions: 40000, sessionShare: 0.18 },
    ],
  },
  bankStatements: { fileCount: 6 },
  pl: { fileCount: 2 },
};

const business = {
  name: "Velvety Skin Co.",
  industry: "Health & Beauty",
  channel: "DTC",
  country: "United Kingdom",
  exitTimeframe: "12 months",
} as BusinessData;

const report = computeFullReport(input);
const markup = (type: (typeof REPORT_TYPES)[number]["id"]) =>
  renderToStaticMarkup(
    <ReportDocument
      report={report}
      business={business}
      storeName="Velvety Skin Co."
      generatedAt={new Date(Date.UTC(2026, 7, 12))}
      type={type}
    />,
  );

describe("ReportDocument", () => {
  it("renders every report type without a missing section body", () => {
    for (const t of REPORT_TYPES) {
      const html = markup(t.id);
      for (const s of reportSections(report, t.id)) {
        // The anchor exists, and the heading is the unnumbered label — the
        // number belongs to the eyebrow, so it must not appear twice.
        const label = esc(s.label);
        expect(html).toContain(`id="${s.id}"`);
        expect(html).toContain(`>${label}</h2>`);
        expect(html).not.toContain(`>${s.number}. ${label}</h2>`);
      }
    }
  });

  it("numbers each section once, in the eyebrow", () => {
    const html = markup("full");
    for (const s of reportSections(report, "full")) {
      const eyebrow = `Section ${String(s.number).padStart(2, "0")}`;
      expect(html.split(eyebrow).length - 1).toBe(1);
    }
  });

  it("leads with the hero score on every report", () => {
    for (const t of REPORT_TYPES) {
      const html = markup(t.id);
      expect(html).toContain("Exit Readiness Score");
      expect(html).toContain(`${report.score.exitScore} / 100`);
      expect(html).toContain(report.score.scoreTier);
    }
  });

  it("never prints an unresolved value to a buyer", () => {
    for (const t of REPORT_TYPES) {
      const html = markup(t.id);
      expect(html).not.toMatch(/undefined|NaN|\[object Object\]/);
    }
  });

  it("carries the ExitEcom credit and the store name into the print footer", () => {
    const html = markup("full");
    expect(html).toContain("report-print-footer");
    expect(html).toContain("exitecom.com");
    expect(html).toContain("Velvety Skin Co.");
  });
});
