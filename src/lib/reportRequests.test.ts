import { describe, it, expect } from "vitest";
import type { FullReport } from "@/lib/analytics";
import {
  applyOverrides,
  overrideDiff,
  isRequestTool,
  REQUEST_TOOLS,
  TOOL_NAMES,
  TOOL_PATHS,
  type ReportOverrides,
} from "./reportRequests";

function fakeReport(): FullReport {
  return {
    metrics: { revenueTTM: 100000 },
    score: { exitScore: 62, scoreTier: "Developing", dataConfidence: 71 },
    valuation: {
      adjustedEarnings: 40000,
      currentMultiple: 2.4,
      fairMarket: 96000,
      valueGap: 40000,
    },
    risks: [
      {
        title: "Product concentration",
        severity: "high",
        description: "Top product is 62% of revenue.",
        impact: 25000,
        recommendation: "Diversify the range.",
      },
      {
        title: "Thin repeat rate",
        severity: "medium",
        description: "Repeat rate is 11%.",
        impact: 12000,
      },
    ],
    actions: [
      {
        title: "Document SOPs",
        priority: "high",
        uplift: 18000,
        time: "3 weeks",
        problem: "Nothing is written down.",
        steps: ["Record the fulfilment process", "Hand it to a VA"],
      },
    ],
    businessUpdate: {
      exitScore: 62,
      scoreTier: "Developing",
      fairMarket: 96000,
    },
  } as unknown as FullReport;
}

describe("tool constants", () => {
  it("names and paths every approvable tool", () => {
    for (const tool of REQUEST_TOOLS) {
      expect(TOOL_NAMES[tool]).toBeTruthy();
      expect(TOOL_PATHS[tool]).toMatch(/^\//);
    }
  });

  // 'full' is a view over the four tools, never itself submitted for approval.
  it("does not treat the Full Report as an approvable tool", () => {
    expect(isRequestTool("full")).toBe(false);
    expect(isRequestTool("risk")).toBe(true);
    expect(isRequestTool("nonsense")).toBe(false);
    expect(isRequestTool(undefined)).toBe(false);
  });
});

describe("applyOverrides", () => {
  it("returns the engine output unchanged when nothing was edited", () => {
    const payload = fakeReport();
    expect(applyOverrides(payload, {})).toEqual(payload);
    expect(applyOverrides(payload, null)).toEqual(payload);
  });

  it("never mutates the frozen payload", () => {
    const payload = fakeReport();
    const before = JSON.stringify(payload);
    applyOverrides(payload, {
      score: { exitScore: 80 },
      risks: { "0": { hidden: true } },
    });
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("applies score and valuation edits", () => {
    const out = applyOverrides(fakeReport(), {
      score: { exitScore: 71, scoreTier: "Strong" },
      valuation: { fairMarket: 120000 },
    });
    expect(out.score.exitScore).toBe(71);
    expect(out.score.scoreTier).toBe("Strong");
    expect(out.valuation.fairMarket).toBe(120000);
    // Untouched fields survive.
    expect(out.score.dataConfidence).toBe(71);
    expect(out.valuation.currentMultiple).toBe(2.4);
  });

  // businessUpdate is what reaches valuation_data and every page that reads it,
  // so an edited figure that didn't flow through would show the engine's
  // original on the dashboard while the report showed the corrected one.
  it("flows edited figures into businessUpdate", () => {
    const out = applyOverrides(fakeReport(), {
      score: { exitScore: 71, scoreTier: "Strong" },
      valuation: { fairMarket: 120000 },
    });
    expect(out.businessUpdate.exitScore).toBe(71);
    expect(out.businessUpdate.scoreTier).toBe("Strong");
    expect(out.businessUpdate.fairMarket).toBe(120000);
  });

  it("leaves businessUpdate alone when only copy was edited", () => {
    const payload = fakeReport();
    const out = applyOverrides(payload, {
      risks: { "0": { description: "Rewritten." } },
    });
    expect(out.businessUpdate).toEqual(payload.businessUpdate);
  });

  it("patches one array item by index without touching its siblings", () => {
    const out = applyOverrides(fakeReport(), {
      risks: { "1": { severity: "high", impact: 30000 } },
    });
    expect(out.risks[0].title).toBe("Product concentration");
    expect(out.risks[0].severity).toBe("high");
    expect(out.risks[1].severity).toBe("high");
    expect(out.risks[1].impact).toBe(30000);
    // Fields not in the patch are preserved.
    expect(out.risks[1].title).toBe("Thin repeat rate");
  });

  // A suppressed item must disappear, not publish as an empty row in a document
  // that goes to a buyer.
  it("removes hidden risks and actions rather than blanking them", () => {
    const out = applyOverrides(fakeReport(), {
      risks: { "0": { hidden: true } },
      actions: { "0": { hidden: true } },
    });
    expect(out.risks).toHaveLength(1);
    expect(out.risks[0].title).toBe("Thin repeat rate");
    expect(out.actions).toHaveLength(0);
  });

  it("does not leak the hidden flag onto published items", () => {
    const out = applyOverrides(fakeReport(), {
      risks: { "1": { hidden: false, impact: 1 } },
    });
    expect(out.risks[1]).not.toHaveProperty("hidden");
  });

  it("replaces action steps wholesale", () => {
    const out = applyOverrides(fakeReport(), {
      actions: { "0": { steps: ["Just do the one thing"] } },
    });
    expect(out.actions[0].steps).toEqual(["Just do the one thing"]);
  });

  it("ignores an override for an index that no longer exists", () => {
    const out = applyOverrides(fakeReport(), { risks: { "9": { impact: 1 } } });
    expect(out.risks).toHaveLength(2);
  });
});

describe("overrideDiff", () => {
  it("reports nothing when nothing was edited", () => {
    expect(overrideDiff(fakeReport(), {})).toEqual([]);
    expect(overrideDiff(fakeReport(), null)).toEqual([]);
  });

  // Opening a field and typing the same value back isn't an edit, and shouldn't
  // land in the audit log as one.
  it("skips a patch that matches the engine's own value", () => {
    expect(overrideDiff(fakeReport(), { score: { exitScore: 62 } })).toEqual(
      [],
    );
  });

  it("records before and after for a changed figure", () => {
    const diff = overrideDiff(fakeReport(), { score: { exitScore: 71 } });
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      path: "score.exitScore",
      label: "Exit score",
      from: "62",
      to: "71",
    });
  });

  it("labels a hidden item as removed", () => {
    const diff = overrideDiff(fakeReport(), {
      risks: { "0": { hidden: true } },
    });
    expect(diff).toHaveLength(1);
    expect(diff[0].label).toContain("Product concentration");
    expect(diff[0].to).toBe("hidden");
  });

  it("names the item a risk edit belongs to", () => {
    const diff = overrideDiff(fakeReport(), {
      risks: { "1": { description: "Rewritten." } },
    });
    expect(diff[0].label).toBe("Thin repeat rate — description");
    expect(diff[0].from).toBe("Repeat rate is 11%.");
  });

  it("collects edits across every part of the payload", () => {
    const overrides: ReportOverrides = {
      score: { exitScore: 71 },
      valuation: { fairMarket: 120000 },
      risks: { "0": { impact: 1 } },
      actions: { "0": { uplift: 2 } },
    };
    expect(overrideDiff(fakeReport(), overrides)).toHaveLength(4);
  });
});
