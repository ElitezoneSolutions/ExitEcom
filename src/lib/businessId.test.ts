import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the module factory below can close over them.
const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return mocks.isSupabaseConfigured;
  },
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: mocks.maybeSingle }),
          }),
        }),
      }),
    }),
  },
}));

const { resolveBusinessId, NoBusinessError } = await import("./businessId");

const user = { id: "user-1" } as never;

describe("resolveBusinessId", () => {
  beforeEach(() => {
    mocks.isSupabaseConfigured = true;
    mocks.maybeSingle.mockReset();
  });

  it("returns null in the local sandbox so callers can skip persistence", async () => {
    mocks.isSupabaseConfigured = false;
    await expect(resolveBusinessId(null, "", "Google Ads")).resolves.toBeNull();
  });

  it("throws when configured but signed out — never a silent skip", async () => {
    await expect(resolveBusinessId(null, "", "Google Ads")).rejects.toThrow(
      /not signed in/i,
    );
  });

  it("uses the cached id without hitting the database", async () => {
    await expect(resolveBusinessId(user, "biz-1", "Google Ads")).resolves.toBe(
      "biz-1",
    );
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("falls back to a lookup when the id isn't in state yet (the OAuth popup case)", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "biz-2" }, error: null });
    await expect(resolveBusinessId(user, "", "Google Ads")).resolves.toBe(
      "biz-2",
    );
  });

  it("throws NoBusinessError when the user has no business row", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveBusinessId(user, "", "Google Ads")).rejects.toThrow(
      NoBusinessError,
    );
  });

  it("surfaces a lookup failure rather than reporting success", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(resolveBusinessId(user, "", "Google Ads")).rejects.toThrow(
      /permission denied/,
    );
  });
});
