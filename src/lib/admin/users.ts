// User-management server functions for the Super Admin Dashboard.
//
// Every function here reads/writes ACROSS users, so each one calls
// requireSuperadmin() first and then uses the service-role client (see
// ./server.ts). Access tokens / connector secrets are NEVER returned to the
// client — only status-level fields. All mutations are written to the audit log.

import { createServerFn } from "@tanstack/react-start";
import {
  getServiceClient,
  logAdminAction,
  requireSuperadmin,
  type JsonObject,
} from "./server";

interface AuthInput {
  accessToken: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: "user" | "superadmin";
  createdAt: string | null;
  lastSignInAt: string | null;
  hasBusiness: boolean;
  businessName: string | null;
  exitScore: number | null;
  connectedSources: string[];
}

// --- List all users --------------------------------------------------------
export const listUsersFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput) => input)
  .handler(async ({ data }): Promise<AdminUserRow[]> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    // auth.users is only reachable via the admin API (service role).
    const { data: authData, error: authErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authErr) throw new Error("Could not load users.");
    const users = authData?.users ?? [];

    const [{ data: profiles }, { data: businesses }, { data: valuations }] =
      await Promise.all([
        db.from("profiles").select("id, full_name, role"),
        db.from("businesses").select("id, owner_id, name"),
        db
          .from("valuation_data")
          .select("business_id, exit_score, connected_sources"),
      ]);

    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id as string, p]),
    );
    // First business per owner (the app is effectively one-business-per-user).
    const bizByOwner = new Map<string, { id: string; name: string }>();
    for (const b of businesses ?? []) {
      if (!bizByOwner.has(b.owner_id as string)) {
        bizByOwner.set(b.owner_id as string, {
          id: b.id as string,
          name: b.name as string,
        });
      }
    }
    const valByBusiness = new Map(
      (valuations ?? []).map((v) => [v.business_id as string, v]),
    );

    return users.map((u): AdminUserRow => {
      const profile = profileById.get(u.id);
      const biz = bizByOwner.get(u.id);
      const val = biz ? valByBusiness.get(biz.id) : undefined;
      return {
        id: u.id,
        email: u.email ?? "",
        fullName: (profile?.full_name as string) ?? null,
        role: profile?.role === "superadmin" ? "superadmin" : "user",
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        hasBusiness: Boolean(biz),
        businessName: biz?.name ?? null,
        exitScore: (val?.exit_score as number) ?? null,
        connectedSources: (val?.connected_sources as string[]) ?? [],
      };
    });
  });

// --- One user's detail -----------------------------------------------------
export interface AdminUserDetail {
  business: JsonObject | null;
  valuation: JsonObject | null;
  connectors: {
    source: string;
    lastSyncedAt: string | null;
    status: string | null;
  }[];
}

// Connector account tables, mapped to a human label. Token columns are never
// selected — only status + last_synced_at.
const CONNECTOR_TABLES: { table: string; source: string }[] = [
  { table: "shopify_stores", source: "Shopify" },
  { table: "meta_accounts", source: "Meta Ads" },
  { table: "google_accounts", source: "Google Ads" },
  { table: "tiktok_accounts", source: "TikTok Ads" },
  { table: "snapchat_accounts", source: "Snapchat Ads" },
  { table: "ga4_accounts", source: "Google Analytics 4" },
];

export const getUserDetailFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput & { userId: string }) => input)
  .handler(async ({ data }): Promise<AdminUserDetail> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const { data: biz } = await db
      .from("businesses")
      .select("*")
      .eq("owner_id", data.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!biz) {
      return { business: null, valuation: null, connectors: [] };
    }

    const { data: valuation } = await db
      .from("valuation_data")
      .select("*")
      .eq("business_id", biz.id)
      .maybeSingle();

    const connectors = await Promise.all(
      CONNECTOR_TABLES.map(async ({ table, source }) => {
        const { data: row } = await db
          .from(table)
          .select("account_status, last_synced_at, synced_at")
          .eq("business_id", biz.id)
          .maybeSingle();
        if (!row) return null;
        return {
          source,
          lastSyncedAt:
            (row.last_synced_at as string) ?? (row.synced_at as string) ?? null,
          status: (row.account_status as string) ?? "connected",
        };
      }),
    );

    return {
      business: biz as JsonObject,
      valuation: (valuation as JsonObject) ?? null,
      connectors: connectors.filter(
        (c): c is NonNullable<typeof c> => c !== null,
      ),
    };
  });

// --- Mutations -------------------------------------------------------------
export const setUserRoleFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: AuthInput & { userId: string; role: "user" | "superadmin" }) =>
      input,
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId: actorId } = await requireSuperadmin(data.accessToken);
    if (data.role !== "user" && data.role !== "superadmin") {
      throw new Error("Invalid role.");
    }
    const db = getServiceClient();
    const { error } = await db
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.userId);
    if (error) throw new Error("Could not update role.");

    await logAdminAction(
      actorId,
      "user.role_changed",
      {
        type: "user",
        id: data.userId,
      },
      { role: data.role },
    );
    return { ok: true };
  });

export const sendPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: AuthInput & { userId: string; email: string }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId: actorId } = await requireSuperadmin(data.accessToken);
    const db = getServiceClient();
    // Triggers Supabase's recovery email to the user.
    const { error } = await db.auth.resetPasswordForEmail(data.email);
    if (error) throw new Error("Could not send the reset email.");

    await logAdminAction(
      actorId,
      "user.password_reset_sent",
      {
        type: "user",
        id: data.userId,
      },
      { email: data.email },
    );
    return { ok: true };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput & { userId: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId: actorId } = await requireSuperadmin(data.accessToken);
    if (data.userId === actorId) {
      throw new Error("You cannot delete your own account here.");
    }
    const db = getServiceClient();
    // Deleting the auth user cascades to profiles + businesses + all child
    // tables (every FK is `on delete cascade` from auth.users / businesses).
    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Could not delete the user.");

    await logAdminAction(actorId, "user.deleted", {
      type: "user",
      id: data.userId,
    });
    return { ok: true };
  });
