# Stripe Billing — Setup Guide

ExitEcom's billing is a real **Stripe Billing** subscription handled **entirely
inside this app** — no external billing portal of our own to build. The Stripe
secret key and webhook secret live in this app's server environment and are used
only inside `createServerFn` handlers (`src/lib/billing.ts`) and the webhook
intercept in `src/server.ts`; checkout and "manage billing" both hand off to
**Stripe-hosted** pages, so no card data ever touches our browser bundle.

Subscription state is stored in Supabase (`subscriptions`, RLS-protected). The
**webhook is the single source of truth** — the browser only ever *reads* a
user's row, it can never write `status`, so a client can't fake an active plan.

The whole app is gated: a signed-in user without an active subscription is
bounced to `/subscribe`. When the Stripe env vars are blank the paywall is
**disabled** (consistent with the "every connector is optional / Demo Mode"
convention), so local and demo flows are never locked out.

Four parts:
1. **Stripe dashboard setup** — product, price, API key
2. **Webhook** — the endpoint that syncs subscription status
3. **App configuration** — env vars + how it works
4. **Verify / go live / troubleshoot**

---

## Part 1: Stripe dashboard setup

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com). Use **Test mode**
   (toggle, top-right) while developing; repeat in live mode for production.
2. **Products → Add product** → name it **Professional**. Add a **recurring**
   price: **£199.00 / month**, currency **GBP**. Save and copy the **Price ID**
   (`price_...`).
3. **Developers → API keys** → copy the **Secret key** (`sk_test_...` in test,
   `sk_live_...` in live). This is server-side only — never expose it.
4. **Settings → Billing → Customer portal** → activate it. Enable: update payment
   method, view invoice history, and cancel subscription (cancel at period end).
   This Stripe-hosted portal is the entire "manage billing" UI.

---

## Part 2: Webhook (required)

Stripe must tell the app when a subscription starts, renews, lapses, or is
cancelled. Without this, the app never learns a user paid.

1. **Developers → Webhooks → Add endpoint.**
2. **Endpoint URL:**
   ```
   https://dash.exitecom.com/api/stripe-webhook     # prod
   ```
   For local testing, use the Stripe CLI instead (see Part 4) rather than a
   public URL.
3. **Events to send** — select at minimum:
   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.payment_failed
   ```
4. Save, then copy the endpoint's **Signing secret** (`whsec_...`). The handler
   verifies every request against this with `stripe.webhooks.constructEvent`, so
   a forged POST is rejected.

---

## Part 3: Configure this app

Set these in `.env` (and in the hosting platform's env for production). They are
**server-side only — never `VITE_`-prefixed** (that would inline the secret into
the browser bundle). See `.env.example`.

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
STRIPE_PRICE_PROFESSIONAL=price_your_professional_price_id
```

The success/cancel and portal-return URLs are derived from the request origin
(same pattern as the OAuth redirect URIs), so no extra URL vars are needed.

### How it works

- **Subscribe** — `/subscribe` calls `createCheckoutSessionFn`, which finds or
  creates the user's Stripe customer, opens a Checkout Session for the
  Professional price, and returns its URL. The browser redirects to Stripe.
- **Pay** — the user pays on Stripe's hosted Checkout. Stripe fires
  `checkout.session.completed` → our webhook upserts the user's `subscriptions`
  row to `active` via the service-role client (bypassing RLS, the only writer).
- **Gate** — `_app` reads the user's row via RLS (`useSubscription`). No active
  status → redirect to `/subscribe`. Superadmins bypass the gate.
- **Manage** — `/billing` shows the real plan, renewal date, and cancel state,
  plus a button that calls `createPortalSessionFn` and redirects to the
  Stripe-hosted Customer Portal for card changes, invoices, and cancellation.
- **Lifecycle** — renewals, failed payments, and cancellations all arrive as
  `customer.subscription.*` / `invoice.payment_failed` webhook events that keep
  the `subscriptions` row in sync.

### Data model

The `subscriptions` table is RLS-scoped to the owner (`user_id = auth.uid()`),
**SELECT only** for the client — there is no client INSERT/UPDATE policy, so
status is writable solely by the service-role webhook.

| column                  | meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| `user_id`               | PK → `auth.users(id)`                                |
| `stripe_customer_id`    | the user's Stripe customer (`cus_...`)               |
| `stripe_subscription_id`| active subscription (`sub_...`)                      |
| `status`                | `none` / `trialing` / `active` / `past_due` / `canceled` / `incomplete` |
| `price_id`              | the subscribed price                                 |
| `current_period_end`    | renewal / access-until date                          |
| `cancel_at_period_end`  | true once the user cancels (access until period end) |
| `updated_at`            | last webhook sync                                    |

> **Migration must be applied to the live hosted Supabase project**, not just
> committed: run `supabase db push`. Editing the migration file alone changes
> nothing in production.

---

## Part 4: Verify, go live, troubleshoot

### Test locally with the Stripe CLI

```bash
stripe login
stripe listen --forward-to localhost:8080/api/stripe-webhook
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET, restart the dev server
```

Then subscribe from `/subscribe` using a Stripe **test card**:

```
4242 4242 4242 4242   any future expiry   any CVC   any postcode
```

You can also replay events: `stripe trigger checkout.session.completed`.

### Verify

- After a successful test checkout, the user's `subscriptions` row shows
  `status = active` and a future `current_period_end`.
- `/subscribe` no longer gates the user; `/billing` shows the real plan and a
  working "Manage billing" button.
- Cancelling in the portal sets `cancel_at_period_end = true`; access remains
  until `current_period_end`, then a `customer.subscription.deleted` event flips
  `status` to `canceled` and the gate returns.

### Go live

1. Switch the Stripe dashboard to **live mode** and repeat Part 1 (product +
   price) and Part 2 (webhook) — live mode has its own keys, prices, and webhook
   secret.
2. Set the **live** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
   `STRIPE_PRICE_PROFESSIONAL` in the production environment.
3. Confirm the production webhook endpoint URL is reachable and returns 200.

### Troubleshoot

| Symptom                                  | Likely cause                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Paid but still gated at `/subscribe`     | Webhook not received/verified — check the endpoint URL and `STRIPE_WEBHOOK_SECRET`; inspect **Developers → Webhooks → recent deliveries**. |
| Webhook returns 400 "signature"          | Wrong `STRIPE_WEBHOOK_SECRET`, or the raw body was altered before verification. |
| Checkout button does nothing             | `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PROFESSIONAL` unset — paywall is disabled and no session can be created. |
| "No such price"                          | Price ID is from the other mode (test vs live) than the secret key.          |
| Everyone has free access                 | Stripe env vars are blank → paywall intentionally disabled (Demo-mode parity).|

---

_Related: `docs/env-vars.md` (all env vars), `docs/architecture.md` (paywall +
webhook wiring), `docs/data-display.md` (billing page is real data)._
