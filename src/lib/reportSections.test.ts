import { describe, it, expect } from "vitest";
import type { FullReport } from "@/lib/analytics";
import {
  REPORT_TYPES,
  reportSections,
  reportTypeById,
  type ReportTypeId,
} from "@/lib/reportSections";

// Only the two flags that gate an optional section matter here — the rest of
// FullReport is irrelevant to which sections a report contains.
function fakeReport(opts: {
  adSpendVerified?: boolean;
  ga4Connected?: boolean;
}) {
  return {
    metrics: {
      adSpendVerified: opts.adSpendVerified ?? false,
      ga4Connected: opts.ga4Connected ?? false,
    },
  } as unknown as FullReport;
}

const ALL_FEEDS = fakeReport({ adSpendVerified: true, ga4Connected: true });
const NO_FEEDS = fakeReport({});
const ids = (r: FullReport, t: ReportTypeId) =>
  reportSections(r, t).map((s) => s.id);

describe("reportSections", () => {
  it("defaults to the full report", () => {
    expect(reportSections(ALL_FEEDS)).toEqual(
      reportSections(ALL_FEEDS, "full"),
    );
  });

  it("gives the full report every section when all feeds are connected", () => {
    expect(ids(ALL_FEEDS, "full")).toEqual([
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
    ]);
  });

  it("drops Marketing without an ad feed and Traffic without GA4", () => {
    expect(ids(NO_FEEDS, "full")).not.toContain("marketing");
    expect(ids(NO_FEEDS, "full")).not.toContain("traffic");
    expect(ids(fakeReport({ adSpendVerified: true }), "full")).toContain(
      "marketing",
    );
    expect(ids(fakeReport({ ga4Connected: true }), "full")).toContain(
      "traffic",
    );
  });

  it("numbers sections contiguously from 1, closing up around dropped ones", () => {
    for (const t of REPORT_TYPES) {
      for (const r of [ALL_FEEDS, NO_FEEDS]) {
        const numbers = reportSections(r, t.id).map((s) =>
          Number(s.title.split(".")[0]),
        );
        expect(numbers).toEqual(numbers.map((_, i) => i + 1));
      }
    }
  });

  it("scopes each tool's report to its own subject", () => {
    expect(ids(NO_FEEDS, "exit-score")).toContain("score");
    expect(ids(NO_FEEDS, "exit-score")).not.toContain("risks");

    expect(ids(NO_FEEDS, "valuation")).toContain("valuation");
    expect(ids(NO_FEEDS, "valuation")).not.toContain("plan");

    expect(ids(NO_FEEDS, "risk")).toContain("risks");
    expect(ids(NO_FEEDS, "risk")).not.toContain("score");

    expect(ids(NO_FEEDS, "optimization")).toContain("plan");
    expect(ids(NO_FEEDS, "optimization")).not.toContain("risks");
  });

  it("always opens with a summary and closes with methodology", () => {
    for (const t of REPORT_TYPES) {
      const list = ids(ALL_FEEDS, t.id);
      expect(list[0]).toBe("summary");
      expect(list[list.length - 1]).toBe("methodology");
    }
  });

  it("only references sections the document knows how to render", () => {
    // Guards against a typo'd id silently rendering an empty section.
    const known = new Set(reportSections(ALL_FEEDS, "full").map((s) => s.id));
    for (const t of REPORT_TYPES) {
      for (const id of t.sections) expect(known.has(id)).toBe(true);
    }
  });

  it("falls back to the full report for an unknown id", () => {
    expect(reportTypeById("nope" as ReportTypeId).id).toBe("full");
  });
});
