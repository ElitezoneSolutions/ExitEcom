import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// The suite runs on plain Node (see vitest.config.ts), so give the module the
// two browser globals it touches rather than pulling in a full DOM.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem = (k: string) => this.store.get(k) ?? null;
  setItem = (k: string, v: string) => void this.store.set(k, String(v));
  removeItem = (k: string) => void this.store.delete(k);
  clear = () => this.store.clear();
}
const memoryStorage = new MemoryStorage();
vi.stubGlobal("localStorage", memoryStorage);
vi.stubGlobal("window", { localStorage: memoryStorage });

import {
  OAUTH_RESULT_KEY,
  clearLastOAuthError,
  clearOAuthResult,
  consumeOAuthState,
  readLastOAuthError,
  readOAuthResult,
  rememberOAuthState,
  writeOAuthResult,
} from "./oauthResult";

const STATE_KEY = "google_oauth_state";

describe("oauth result record", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("round-trips a success record for the matching provider", () => {
    writeOAuthResult({ provider: "google", status: "success", stage: "done" });
    expect(readOAuthResult("google")?.status).toBe("success");
  });

  it("ignores a record belonging to a different provider", () => {
    writeOAuthResult({ provider: "meta", status: "success", stage: "done" });
    expect(readOAuthResult("google")).toBeNull();
  });

  it("ignores a stale record so it can't resolve a fresh attempt", () => {
    vi.useFakeTimers();
    writeOAuthResult({ provider: "google", status: "success", stage: "done" });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(readOAuthResult("google")).toBeNull();
  });

  it("ignores malformed JSON rather than throwing", () => {
    localStorage.setItem(OAUTH_RESULT_KEY, "{not json");
    expect(readOAuthResult("google")).toBeNull();
  });

  it("persists failures separately, and a later success clears them", () => {
    writeOAuthResult({
      provider: "google",
      status: "error",
      stage: "committing",
      message: "column does not exist",
    });
    expect(readLastOAuthError("google")?.stage).toBe("committing");

    writeOAuthResult({ provider: "google", status: "success", stage: "done" });
    expect(readLastOAuthError("google")).toBeNull();
  });

  it("clears cleanly", () => {
    writeOAuthResult({ provider: "google", status: "success", stage: "done" });
    clearOAuthResult();
    clearLastOAuthError();
    expect(readOAuthResult("google")).toBeNull();
    expect(readLastOAuthError("google")).toBeNull();
  });
});

describe("oauth CSRF state", () => {
  beforeEach(() => localStorage.clear());

  it("accepts the state it issued", () => {
    rememberOAuthState(STATE_KEY, "abc");
    expect(consumeOAuthState(STATE_KEY, "abc")).toBe(true);
  });

  it("rejects an unknown state", () => {
    rememberOAuthState(STATE_KEY, "abc");
    expect(consumeOAuthState(STATE_KEY, "wrong")).toBe(false);
  });

  it("rejects a missing state", () => {
    rememberOAuthState(STATE_KEY, "abc");
    expect(consumeOAuthState(STATE_KEY, undefined)).toBe(false);
  });

  it("still accepts an earlier state after the page remounts and re-mints", () => {
    rememberOAuthState(STATE_KEY, "first");
    rememberOAuthState(STATE_KEY, "second");
    // The popup was opened with "first" — a remount must not invalidate it.
    expect(consumeOAuthState(STATE_KEY, "first")).toBe(true);
  });

  it("only remembers a bounded window of states", () => {
    for (const s of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      rememberOAuthState(STATE_KEY, s);
    }
    expect(consumeOAuthState(STATE_KEY, "s1")).toBe(false);
  });

  it("consumes the state so it can't be replayed", () => {
    rememberOAuthState(STATE_KEY, "abc");
    expect(consumeOAuthState(STATE_KEY, "abc")).toBe(true);
    expect(consumeOAuthState(STATE_KEY, "abc")).toBe(false);
  });

  it("accepts the legacy bare-string format from before this change", () => {
    localStorage.setItem(STATE_KEY, "legacy-state");
    expect(consumeOAuthState(STATE_KEY, "legacy-state")).toBe(true);
  });
});
