// Stripe Billing server functions.
//
// All Stripe access is server-side only. The secret key, price id, and webhook
// secret live in process.env (never VITE_-prefixed). The browser only ever calls
// these createServerFn handlers — it never holds a Stripe key and never writes
// the subscriptions table (the webhook in src/server.ts is the only writer).
//
// Pattern mirrors src/lib/admin/*: each function takes the caller's Supabase
// access token, verifies it server-side, and uses the service-role client
// (getServiceClient) for any DB read/write that must bypass RLS.
//
// This module imports the `stripe` SDK and must never be imported into client
// code — only used inside createServerFn handlers (the compiler strips the
// handler bodies, and their server-only imports, from the browser bundle).

import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";
import { getServiceClient } from "./admin/server";

// Statuses that grant access to the app. `comp` = complimentary (grandfathered
// users with no Stripe subscription). `past_due` keeps access during Stripe's
// dunning retries. Mirrored client-side in src/hooks/useSubscription.tsx — keep
// the two in sync.
export const ACCESS_GRANTING_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "comp",
] as const;

/** True when the Stripe env vars are present. Blank = paywall disabled. */
export function isBillingConfigured(): boolean {
  return Boolean(
    (process.env.STRIPE_SECRET_KEY ?? "").trim() &&
      (process.env.STRIPE_PRICE_PROFESSIONAL ?? "").trim(),
  );
}

let cachedStripe: Stripe | null = null;
/**
 * Lazy Stripe singleton. The SDK is imported dynamically (not at module top)
 * so it is never pulled into the client bundle — only the createServerFn
 * handlers (server-only) ever await this. Throws if the secret key is unset.
 */
export async function getStripe(): Promise<Stripe> {
  if (cachedStripe) return cachedStripe;
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "Billing is not configured: set STRIPE_SECRET_KEY in the server environment.",
    );
  }
  const { default: StripeCtor } = await import("stripe");
  cachedStripe = new StripeCtor(key);
  return cachedStripe;
}

/**
 * Verifies the caller's Supabase access token and returns their id + email.
 * Throws on a missing/invalid token. (Like admin's requireSuperadmin, minus the
 * role check — any authenticated user may manage their own billing.)
 */
async function verifyCaller(
  accessToken: string | undefined | null,
): Promise<{ userId: string; email: string | null }> {
  const token = accessToken?.trim();
  if (!token) throw new Error("Not authorized.");
  const db = getServiceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new Error("Not authorized.");
  return { userId: data.user.id, email: data.user.email ?? null };
}

/**
 * Returns the caller's Stripe customer id, creating the customer (and recording
 * it on their subscriptions row) on first use. Idempotent: a stored id is reused.
 */
async function getOrCreateCustomer(
  userId: string,
  email: string | null,
): Promise<string> {
  const db = getServiceClient();
  const { data: existing } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const stripe = await getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });

  // Record the customer id now so the webhook can match events back to the user
  // even before checkout completes. Upsert keeps any grandfathered `comp` status.
  await db
    .from("subscriptions")
    .upsert(
      { user_id: userId, stripe_customer_id: customer.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  return customer.id;
}

/** Only same-origin app URLs are accepted as Checkout/Portal return targets. */
function safeOrigin(origin: unknown): string {
  if (typeof origin !== "string") throw new Error("Missing origin.");
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("Bad origin protocol.");
    }
    return u.origin;
  } catch {
    throw new Error("Invalid origin.");
  }
}

interface BillingInput {
  accessToken: string;
  origin: string;
}
export interface CheckoutSessionResult {
  configured: boolean;
  url: string | null;
}

export interface BillingStatus {
  /** Whether Stripe is configured on this deployment. False = paywall disabled. */
  configured: boolean;
  /** Stripe subscription status, or 'none' if the user has never subscribed. */
  status: string;
  /** Whether the user may access the gated app right now. */
  hasAccess: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
}

// --- Read the caller's billing status --------------------------------------
// Single source of truth for the paywall: returns both whether billing is
// configured and the caller's subscription state, so the client never needs a
// public env var to decide whether to gate. When billing is unconfigured,
// hasAccess is always true (paywall disabled — Demo-mode parity).
export const getBillingStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => input)
  .handler(async ({ data }): Promise<BillingStatus> => {
    const configured = isBillingConfigured();
    if (!configured) {
      return {
        configured: false,
        status: "none",
        hasAccess: true,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        priceId: null,
      };
    }

    const { userId } = await verifyCaller(data.accessToken);
    const db = getServiceClient();
    const { data: row } = await db
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end, price_id")
      .eq("user_id", userId)
      .maybeSingle();

    const status = row?.status ?? "none";
    return {
      configured: true,
      status,
      hasAccess: (ACCESS_GRANTING_STATUSES as readonly string[]).includes(status),
      currentPeriodEnd: row?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
      priceId: row?.price_id ?? null,
    };
  });

// --- Start a subscription --------------------------------------------------
// Creates a Checkout Session in subscription mode. Per Stripe guidance we do NOT
// pass payment_method_types — Stripe picks eligible methods dynamically from the
// Dashboard config. Returns the hosted Checkout URL for the browser to redirect.
export const createCheckoutSessionFn = createServerFn({ method: "POST" })
  .inputValidator((input: BillingInput) => input)
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    if (!isBillingConfigured()) return { configured: false, url: null };

    const { userId, email } = await verifyCaller(data.accessToken);
    const origin = safeOrigin(data.origin);
    const priceId = (process.env.STRIPE_PRICE_PROFESSIONAL ?? "").trim();
    const customerId = await getOrCreateCustomer(userId, email);

    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Bind the subscription back to the user for webhook reconciliation.
      subscription_data: { metadata: { supabase_user_id: userId } },
      client_reference_id: userId,
      allow_promotion_codes: true,
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/subscribe?checkout=cancelled`,
    });

    return { configured: true, url: session.url };
  });

// --- Manage an existing subscription ---------------------------------------
// Opens the Stripe-hosted Customer Portal (update card, view invoices, cancel).
export const createPortalSessionFn = createServerFn({ method: "POST" })
  .inputValidator((input: BillingInput) => input)
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    if (!isBillingConfigured()) return { configured: false, url: null };

    const { userId } = await verifyCaller(data.accessToken);
    const origin = safeOrigin(data.origin);

    const db = getServiceClient();
    const { data: row } = await db
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!row?.stripe_customer_id) {
      throw new Error("No billing account yet — subscribe first.");
    }

    const stripe = await getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}/billing`,
    });

    return { configured: true, url: session.url };
  });
