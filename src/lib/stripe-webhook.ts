// Stripe webhook handler — the SINGLE writer of the subscriptions table.
//
// Mounted in src/server.ts, which routes POST /api/stripe-webhook here BEFORE
// delegating to TanStack, so the raw request body is preserved (signature
// verification requires the exact bytes Stripe signed). Every event is verified
// against STRIPE_WEBHOOK_SECRET — an unverified/forged POST is rejected with 400.
//
// Server-only: imports the Stripe SDK + service-role Supabase client. Never
// import into client code.

import type Stripe from "stripe";
import { getStripe, isBillingConfigured } from "./billing";
import { getServiceClient } from "./admin/server";

const WEBHOOK_PATH = "/api/stripe-webhook";

/** True for the request the webhook handler should claim. */
export function isStripeWebhookRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  return new URL(request.url).pathname === WEBHOOK_PATH;
}

// `current_period_end` historically lived on the Subscription; newer API
// versions moved it onto each subscription item. Read whichever is present.
function periodEndISO(sub: Stripe.Subscription): string | null {
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const item = sub.items?.data?.[0] as unknown as {
    current_period_end?: number;
  };
  const ts = top ?? item?.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000).toISOString() : null;
}

// Resolve the app user for a Stripe subscription: prefer the id we stamped in
// metadata at checkout; fall back to matching the stored customer id.
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await getServiceClient()
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

// Upsert the user's row from a Stripe Subscription. Stripe's status is written
// verbatim (active/trialing/past_due/canceled/…); the app decides which grant
// access (see ACCESS_GRANTING_STATUSES).
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserId(sub);
  if (!userId) {
    console.warn(`[stripe-webhook] no user for subscription ${sub.id}`);
    return;
  }
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  await getServiceClient()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: sub.id,
        status: sub.status,
        price_id: sub.items?.data?.[0]?.price?.id ?? null,
        current_period_end: periodEndISO(sub),
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

/**
 * Verify and process a Stripe webhook request. Always resolves to a Response
 * (never throws) so the server entry can return it directly.
 */
export async function handleStripeWebhook(request: Request): Promise<Response> {
  // No secret configured → nothing to verify. Ack so Stripe doesn't retry.
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!isBillingConfigured() || !secret) {
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const payload = await request.text();
  const stripe = await getStripe();

  let event: Stripe.Event;
  try {
    // Async variant uses Web Crypto — works in the fetch/worker runtime.
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        // The matching customer.subscription.updated (status → past_due/unpaid)
        // carries the authoritative state, so nothing extra to do here.
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Log and 500 so Stripe retries — a transient DB error shouldn't drop the event.
    console.error(`[stripe-webhook] handler error for ${event.type}`, err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
