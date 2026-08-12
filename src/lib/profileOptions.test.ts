import { describe, it, expect } from "vitest";
import {
  BUSINESS_AGES,
  CHANNELS,
  COUNTRIES,
  EXIT_TIMEFRAMES,
  INDUSTRIES,
  PAID_AD_MANAGERS,
  REVENUE_BRACKETS,
  SOP_STATES,
  SUPPLIER_MANAGERS,
  businessAgeYears,
  withCurrentValue,
  type SelectOption,
} from "./profileOptions";

const LISTS: [string, readonly SelectOption[]][] = [
  ["INDUSTRIES", INDUSTRIES],
  ["CHANNELS", CHANNELS],
  ["COUNTRIES", COUNTRIES],
  ["BUSINESS_AGES", BUSINESS_AGES],
  ["REVENUE_BRACKETS", REVENUE_BRACKETS],
  ["EXIT_TIMEFRAMES", EXIT_TIMEFRAMES],
  ["PAID_AD_MANAGERS", PAID_AD_MANAGERS],
  ["SUPPLIER_MANAGERS", SUPPLIER_MANAGERS],
  ["SOP_STATES", SOP_STATES],
];

const valueOf = (o: SelectOption) => (typeof o === "string" ? o : o.value);

describe("option lists", () => {
  it.each(LISTS)("%s has no duplicate or blank values", (_name, list) => {
    const values = list.map(valueOf);
    expect(values).not.toContain("");
    expect(new Set(values).size).toBe(values.length);
  });

  it("leaves exactly one channel selectable, since only Shopify syncs", () => {
    const enabled = CHANNELS.filter(
      (c) => typeof c !== "string" && !c.disabled,
    );
    expect(enabled.map(valueOf)).toEqual(["Shopify"]);
  });
});

describe("withCurrentValue", () => {
  it("returns the list unchanged when the value is already an option", () => {
    expect(withCurrentValue(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("returns the list unchanged when there is no value yet", () => {
    expect(withCurrentValue(["a", "b"], "")).toEqual(["a", "b"]);
  });

  // Without this, opening /profile on a row saved before a list changed would
  // show a different option as selected and silently save that instead.
  it("appends an unrecognised stored value so it stays selectable", () => {
    expect(withCurrentValue(["a", "b"], "legacy")).toEqual([
      "a",
      "b",
      "legacy",
    ]);
  });

  it("matches against the value of object options, not the label", () => {
    const opts = [{ value: "Shopify", label: "Shopify (connected)" }];
    expect(withCurrentValue(opts, "Shopify")).toHaveLength(1);
    expect(withCurrentValue(opts, "Shopify (connected)")).toHaveLength(2);
  });
});

describe("businessAgeYears", () => {
  it("reads the conservative end of every shipped age band", () => {
    expect(BUSINESS_AGES.map(businessAgeYears)).toEqual([0, 1, 2, 3, 5]);
  });

  it("returns null for unknown rather than assuming a young business", () => {
    expect(businessAgeYears("")).toBeNull();
    expect(businessAgeYears("   ")).toBeNull();
    expect(businessAgeYears("a while")).toBeNull();
  });

  it("converts a month count to a fraction of a year", () => {
    expect(businessAgeYears("18 months")).toBeCloseTo(1.5);
    expect(businessAgeYears("6 months")).toBeCloseTo(0.5);
  });

  // Free-text values written before the dropdowns existed still have to parse.
  it("handles legacy free-text values", () => {
    expect(businessAgeYears("2 years")).toBe(2);
    expect(businessAgeYears("3.5 years")).toBe(3.5);
    expect(businessAgeYears("5+ years")).toBe(5);
  });
});
