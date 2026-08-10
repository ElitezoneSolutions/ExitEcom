import { describe, it, expect } from "vitest";
import { reconcileConnectedSources } from "./connectedSources";

describe("reconcileConnectedSources", () => {
  it("restores connectors whose rows exist but were dropped from the array", () => {
    // The exact corruption the old commit path caused: an OAuth popup with
    // stale state overwrote the array with only the source it just connected.
    const repaired = reconcileConnectedSources(["google"], {
      shopify: true,
      meta: true,
      google: true,
    });
    expect(repaired).toEqual(["google", "shopify", "meta"]);
  });

  it("is a no-op when the array already matches", () => {
    const stored = ["shopify", "google"];
    expect(
      reconcileConnectedSources(stored, { shopify: true, google: true }),
    ).toEqual(stored);
  });

  it("never removes a source whose row it couldn't see", () => {
    // A transient RLS error or unmigrated table must not disconnect a working
    // connector — removal is only ever explicit.
    expect(
      reconcileConnectedSources(["shopify", "meta"], {
        shopify: true,
        meta: false,
      }),
    ).toEqual(["shopify", "meta"]);
  });

  it("does not duplicate an entry that differs only by case", () => {
    expect(reconcileConnectedSources(["Google"], { google: true })).toEqual([
      "Google",
    ]);
  });

  it("handles an empty stored array", () => {
    expect(
      reconcileConnectedSources([], { google: true, bank_statements: true }),
    ).toEqual(["google", "bank_statements"]);
  });

  it("adds nothing when no connector has a row", () => {
    expect(reconcileConnectedSources([], { google: false })).toEqual([]);
  });
});
