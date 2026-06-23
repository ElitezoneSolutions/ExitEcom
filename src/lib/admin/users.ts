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

// --- One user's full detail ------------------------------------------------
// Everything we hold about a single account: auth record, profile settings,
// business profile, the full deterministic valuation row, risks, actions, the
// due-diligence document checklist, uploaded files, and every connector's
// status. Secrets (access/refresh tokens, connection keys) are NEVER returned.
export interface AdminConnectorDetail {
  source: string;
  connected: boolean;
  /** The connection path the user took ('direct' | 'oauth' | 'manual' | 'custom_app'). */
  platform: string | null;
  /** A human-readable account identifier (store domain, ad-account id, etc.). */
  label: string | null;
  currency: string | null;
  status: string | null;
  lastSyncedAt: string | null;
  /** Months of persisted insight rows; null for sources without a monthly series (Shopify). */
  monthsOfData: number | null;
}

export interface AdminUploadedFile {
  id: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string | null;
  /** Whether the raw PDF is actually persisted in storage (P&L only). */
  stored: boolean;
}

export interface AdminUserDetail {
  account: {
    id: string;
    email: string;
    fullName: string | null;
    role: "user" | "superadmin";
    createdAt: string | null;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    phone: string | null;
    providers: string[];
  };
  settings: {
    timezone: string | null;
    currency: string | null;
    notificationPrefs: JsonObject;
  };
  business: JsonObject | null;
  valuation: JsonObject | null;
  risks: JsonObject[];
  actions: JsonObject[];
  documents: { category: string; name: string; uploaded: boolean }[];
  bankFiles: AdminUploadedFile[];
  plFiles: AdminUploadedFile[];
  connectors: AdminConnectorDetail[];
}

// Connector account tables. `monthly` is the matching insight series (counted to
// show how much data was pulled); `labelKeys` are tried in order for a display
// label. We select `*` and strip secret columns rather than naming every column,
// because the account tables differ (e.g. shopify_stores has no account_status).
const CONNECTOR_TABLES: {
  table: string;
  source: string;
  monthly: string | null;
  labelKeys: string[];
}[] = [
  {
    table: "shopify_stores",
    source: "Shopify",
    monthly: null,
    labelKeys: ["shop_domain", "name"],
  },
  {
    table: "meta_accounts",
    source: "Meta Ads",
    monthly: "meta_monthly_insights",
    labelKeys: ["name", "ad_account_id"],
  },
  {
    table: "google_accounts",
    source: "Google Ads",
    monthly: "google_monthly_insights",
    labelKeys: ["name", "customer_id"],
  },
  {
    table: "tiktok_accounts",
    source: "TikTok Ads",
    monthly: "tiktok_monthly_insights",
    labelKeys: ["name", "advertiser_id"],
  },
  {
    table: "snapchat_accounts",
    source: "Snapchat Ads",
    monthly: "snapchat_monthly_insights",
    labelKeys: ["name", "ad_account_id"],
  },
  {
    table: "ga4_accounts",
    source: "Google Analytics 4",
    monthly: "ga4_monthly_insights",
    labelKeys: ["name", "property_id"],
  },
];

export const getUserDetailFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput & { userId: string }) => input)
  .handler(async ({ data }): Promise<AdminUserDetail> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    // Account (auth) + profile/settings.
    const [{ data: authData }, { data: profile }] = await Promise.all([
      db.auth.admin.getUserById(data.userId),
      db
        .from("profiles")
        .select("full_name, role, timezone, currency, notification_prefs")
        .eq("id", data.userId)
        .maybeSingle(),
    ]);

    const u = authData?.user;
    const appMeta = (u?.app_metadata ?? {}) as {
      provider?: string;
      providers?: string[];
    };
    const providers = Array.isArray(appMeta.providers)
      ? appMeta.providers
      : appMeta.provider
        ? [appMeta.provider]
        : [];

    const account: AdminUserDetail["account"] = {
      id: data.userId,
      email: u?.email ?? "",
      fullName: (profile?.full_name as string) ?? null,
      role: profile?.role === "superadmin" ? "superadmin" : "user",
      createdAt: u?.created_at ?? null,
      lastSignInAt: u?.last_sign_in_at ?? null,
      emailConfirmedAt: u?.email_confirmed_at ?? null,
      phone: u?.phone ?? null,
      providers,
    };

    const settings: AdminUserDetail["settings"] = {
      timezone: (profile?.timezone as string) ?? null,
      currency: (profile?.currency as string) ?? null,
      notificationPrefs: (profile?.notification_prefs as JsonObject) ?? {},
    };

    const empty: AdminUserDetail = {
      account,
      settings,
      business: null,
      valuation: null,
      risks: [],
      actions: [],
      documents: [],
      bankFiles: [],
      plFiles: [],
      connectors: [],
    };

    const { data: biz } = await db
      .from("businesses")
      .select("*")
      .eq("owner_id", data.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!biz) return empty;
    const businessId = biz.id as string;

    const [
      { data: valuation },
      { data: risks },
      { data: actions },
      { data: documents },
      { data: bankFiles },
      { data: plFiles },
    ] = await Promise.all([
      db
        .from("valuation_data")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle(),
      db
        .from("risks")
        .select("*")
        .eq("business_id", businessId)
        .order("impact", { ascending: true }),
      db
        .from("actions")
        .select("*")
        .eq("business_id", businessId)
        .order("uplift", { ascending: false }),
      db
        .from("documents")
        .select("category, name, uploaded")
        .eq("business_id", businessId)
        .order("category", { ascending: true }),
      db
        .from("bank_statement_files")
        .select("id, file_name, file_size, synced_at")
        .eq("business_id", businessId)
        .order("synced_at", { ascending: false }),
      db
        .from("pl_files")
        .select("id, file_name, file_size, file_path, synced_at")
        .eq("business_id", businessId)
        .order("synced_at", { ascending: false }),
    ]);

    const connectors = await Promise.all(
      CONNECTOR_TABLES.map(
        async ({
          table,
          source,
          monthly,
          labelKeys,
        }): Promise<AdminConnectorDetail | null> => {
          const { data: row } = await db
            .from(table)
            .select("*")
            .eq("business_id", businessId)
            .maybeSingle();
          if (!row) return null;
          const r = row as Record<string, unknown>;
          const label =
            (labelKeys
              .map((k) => r[k])
              .find((v) => typeof v === "string" && v) as string) ?? null;
          let monthsOfData: number | null = null;
          if (monthly) {
            const { count } = await db
              .from(monthly)
              .select("id", { count: "exact", head: true })
              .eq("business_id", businessId);
            monthsOfData = count ?? 0;
          }
          return {
            source,
            connected: true,
            platform: (r.source as string) ?? null,
            label,
            currency: (r.currency as string) ?? null,
            status: (r.account_status as string) ?? "connected",
            lastSyncedAt:
              (r.last_synced_at as string) ?? (r.synced_at as string) ?? null,
            monthsOfData,
          };
        },
      ),
    );

    type FileRow = {
      id: string;
      file_name: string;
      file_size: number | null;
      file_path?: string | null;
      synced_at: string | null;
    };
    const mapFile = (f: FileRow): AdminUploadedFile => ({
      id: f.id,
      fileName: f.file_name,
      fileSize: f.file_size ?? null,
      uploadedAt: f.synced_at ?? null,
      stored: Boolean(f.file_path),
    });

    return {
      account,
      settings,
      business: biz as JsonObject,
      valuation: (valuation as JsonObject) ?? null,
      risks: (risks as JsonObject[]) ?? [],
      actions: (actions as JsonObject[]) ?? [],
      documents:
        (documents as {
          category: string;
          name: string;
          uploaded: boolean;
        }[]) ?? [],
      bankFiles: ((bankFiles as FileRow[]) ?? []).map(mapFile),
      plFiles: ((plFiles as FileRow[]) ?? []).map(mapFile),
      connectors: connectors.filter(
        (c): c is AdminConnectorDetail => c !== null,
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
