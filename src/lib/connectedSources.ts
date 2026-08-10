import { supabase } from "@/lib/supabase";

/**
 * `valuation_data.connected_sources` is the array that drives every "Connected"
 * badge in the app. It is denormalised — the real proof that a connector is
 * usable is a row in the matching `*_accounts` table holding the token — so the
 * two can drift apart. Two rules keep them honest:
 *
 *  1. **Never write the array from in-memory state.** A connector commit used to
 *     upsert `[...business.connectedSources, "google"]`, taken from React state.
 *     In an OAuth popup — a fresh page load, and on a new device with no
 *     localStorage cache — that array is often still `[]` when the commit runs,
 *     so the upsert **overwrote** the stored list with just `["google"]` and
 *     silently disconnected every other connector. Read-modify-write against the
 *     database instead, so a stale tab can only ever add its own source.
 *
 *  2. **Reconcile on load** (see `deriveConnectedSources`). If the array has
 *     already drifted, the presence of the account rows repairs it, so a user
 *     signing in months later or on another device sees what they actually
 *     connected.
 */

/** Add one source to the stored list without disturbing the others. */
export async function addConnectedSource(
  businessId: string,
  source: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("valuation_data")
    .select("connected_sources")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;

  const current: string[] = data?.connected_sources ?? [];
  if (current.some((s) => s.toLowerCase() === source.toLowerCase())) {
    return current;
  }

  const merged = [...current, source];
  const { error: upsertError } = await supabase
    .from("valuation_data")
    .upsert(
      { business_id: businessId, connected_sources: merged },
      { onConflict: "business_id" },
    );
  if (upsertError) throw upsertError;
  return merged;
}

/** Remove one source from the stored list without disturbing the others. */
export async function removeConnectedSource(
  businessId: string,
  matches: (source: string) => boolean,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("valuation_data")
    .select("connected_sources")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;

  const current: string[] = data?.connected_sources ?? [];
  const remaining = current.filter((s) => !matches(s));
  if (remaining.length === current.length) return current;

  const { error: upsertError } = await supabase
    .from("valuation_data")
    .upsert(
      { business_id: businessId, connected_sources: remaining },
      { onConflict: "business_id" },
    );
  if (upsertError) throw upsertError;
  return remaining;
}

/** Which connectors actually have a persisted account/upload row right now. */
export interface ConnectorPresence {
  shopify: boolean;
  meta: boolean;
  google: boolean;
  tiktok: boolean;
  snapchat: boolean;
  ga4: boolean;
  bank_statements: boolean;
  pl_upload: boolean;
}

/**
 * Repairs the stored list from what's actually persisted.
 *
 * Deliberately **additive only**: a source present in the database but missing
 * from the array is restored, but a source in the array whose row we couldn't
 * see is left alone. A transient RLS error or an unmigrated table must never
 * cause a working connector to be marked disconnected — removal is only ever
 * done explicitly, by the disconnect actions.
 */
export function reconcileConnectedSources(
  stored: string[],
  presence: Partial<ConnectorPresence>,
): string[] {
  const result = [...stored];
  const has = (name: string) =>
    result.some((s) => s.toLowerCase() === name.toLowerCase());
  for (const [name, present] of Object.entries(presence)) {
    if (present && !has(name)) result.push(name);
  }
  return result;
}
