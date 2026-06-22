// Server-only admin data path.
//
// Every other table in the app is RLS-scoped to `auth.uid() = owner_id`, so the
// browser anon client can never read another user's data. Admin features need to
// read ACROSS users, so they go through the Supabase SERVICE-ROLE key, which
// bypasses RLS. That key is dangerous, so it lives only here, only in
// `process.env` (never VITE_-prefixed, never in the client bundle), and every
// admin server function MUST call `requireSuperadmin()` as its first line before
// touching the service client.
//
// This module imports `@supabase/supabase-js` directly and is only ever used
// inside `createServerFn` handlers — it must never be imported into client code.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * JSON-serializable value types. Server-function return values are validated as
 * serializable by TanStack Start, so admin payloads that carry arbitrary DB rows
 * use these instead of `Record<string, unknown>` (which fails that check).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * Service-role Supabase client. Bypasses RLS — handle with care. Reads project
 * URL + service-role key from server env only. Falls back to the public URL var
 * for the project URL (same project, just not exposed as a secret), but the
 * service-role key has no public fallback by design.
 */
let cached: SupabaseClient | null = null;
export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceKey) {
    throw new Error(
      "Admin features are not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Verifies that the caller's access token belongs to a `superadmin`. Every admin
 * server function calls this FIRST and aborts on failure, so the service client
 * is only ever reached by a confirmed superadmin.
 *
 * @param accessToken the Supabase session access token (from useAuth().session)
 * @returns the verified caller's user id
 * @throws if the token is missing/invalid or the user is not a superadmin
 */
export async function requireSuperadmin(
  accessToken: string | undefined | null,
): Promise<{ userId: string }> {
  const token = accessToken?.trim();
  if (!token) throw new Error("Not authorized.");

  const db = getServiceClient();

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error("Not authorized.");

  const userId = userData.user.id;
  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr || profile?.role !== "superadmin") {
    throw new Error("Not authorized.");
  }

  return { userId };
}

/**
 * Appends a row to admin_audit_log via the service client. Best-effort: a logging
 * failure must never block the underlying admin action, so errors are swallowed
 * (and surfaced to the server console) rather than thrown.
 */
export async function logAdminAction(
  actorId: string,
  action: string,
  target: { type?: string; id?: string } = {},
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from("admin_audit_log").insert({
      actor_id: actorId,
      action,
      target_type: target.type ?? null,
      target_id: target.id ?? null,
      metadata,
    });
  } catch (err) {
    console.error("[admin] failed to write audit log", action, err);
  }
}
