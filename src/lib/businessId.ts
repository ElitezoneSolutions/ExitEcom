import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Thrown when a signed-in user has no `businesses` row. Distinct from a lookup
 * failure so callers can point the user at onboarding rather than at a retry.
 */
export class NoBusinessError extends Error {
  constructor(label: string) {
    super(
      `${label}: no business profile found for your account. Finish onboarding, then connect again.`,
    );
    this.name = "NoBusinessError";
  }
}

/**
 * Resolves the business id a connector write should be attributed to.
 *
 * Returns `null` **only** when Supabase isn't configured — the genuine local
 * sandbox, where callers legitimately skip persistence. In a configured
 * environment this either returns a real id or throws: a connector must never
 * report success for a write it silently skipped, which is exactly the bug that
 * made OAuth connections appear to work and then vanish on refresh.
 *
 * `cachedId` is the id already in provider state. It's used as-is when present;
 * the Supabase lookup is the fallback for the OAuth-popup case, where the tab is
 * a fresh page load and the business fetch may not have resolved yet.
 */
export async function resolveBusinessId(
  user: User | null,
  cachedId: string | undefined,
  label: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  if (!user) {
    throw new Error(`${label}: you're not signed in. Sign in and try again.`);
  }
  if (cachedId) return cachedId;

  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `${label}: couldn't look up your business profile (${error.message}).`,
    );
  }
  if (!data?.id) throw new NoBusinessError(label);
  return data.id;
}
