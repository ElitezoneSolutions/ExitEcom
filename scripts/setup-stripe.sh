#!/usr/bin/env bash
#
# setup-stripe.sh — create ExitEcom's Stripe billing objects via the Stripe CLI.
#
# Idempotent: re-running reuses existing objects instead of creating duplicates
# (it matches the product by name, the price by lookup_key, and the webhook by
# URL). Prints the env block to paste into .env at the end.
#
# Prerequisites:
#   - Stripe CLI installed (brew install stripe/stripe-cli/stripe)
#   - `stripe login` already run (this script can't do the interactive login)
#
# Usage:
#   ./scripts/setup-stripe.sh                 # TEST mode (default)
#   ./scripts/setup-stripe.sh --live          # LIVE mode (real money!)
#   WEBHOOK_URL=https://example.com/api/stripe-webhook ./scripts/setup-stripe.sh
#
set -euo pipefail

# ---- config ---------------------------------------------------------------
PRODUCT_NAME="Professional"
PRICE_LOOKUP_KEY="professional_monthly_gbp"
PRICE_AMOUNT=19900          # £199.00 in pence
PRICE_CURRENCY="gbp"
WEBHOOK_URL="${WEBHOOK_URL:-https://dash.exitecom.com/api/stripe-webhook}"
# Each event must be passed as its own `-d enabled_events[]=...` arg — a single
# comma-joined string is rejected by the API as one invalid event name.
WEBHOOK_EVENTS=(
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.payment_failed
)

# TEST mode unless --live is passed. The flag is appended to every CLI call.
LIVE_FLAG=""
MODE="TEST"
if [[ "${1:-}" == "--live" ]]; then
  LIVE_FLAG="--live"
  MODE="LIVE"
fi

stripe_cli() { stripe $LIVE_FLAG "$@"; }

echo "==> Stripe setup (${MODE} mode)"

# ---- preflight: ensure the CLI is installed and logged in ------------------
if ! command -v stripe >/dev/null 2>&1; then
  echo "ERROR: Stripe CLI not found. Install it: brew install stripe/stripe-cli/stripe" >&2
  exit 1
fi
if ! stripe_cli products list --limit 1 >/dev/null 2>&1; then
  echo "ERROR: Stripe CLI is not authenticated for ${MODE} mode. Run: stripe login" >&2
  exit 1
fi

# ---- 1. Product ------------------------------------------------------------
echo "==> Ensuring product \"${PRODUCT_NAME}\"..."
PRODUCT_ID=$(stripe_cli products search --query "name:'${PRODUCT_NAME}'" 2>/dev/null \
  | jq -r '.data[0].id // empty')

if [[ -z "$PRODUCT_ID" ]]; then
  PRODUCT_ID=$(stripe_cli products create \
    --name "$PRODUCT_NAME" \
    --description "ExitEcom Professional — full ExitOS dashboard, valuation engine, risk scanner, optimization plan." \
    | jq -r '.id')
  echo "    created product: $PRODUCT_ID"
else
  echo "    reusing product: $PRODUCT_ID"
fi

# ---- 2. Price (£199/mo, recurring) -----------------------------------------
echo "==> Ensuring price (lookup_key=${PRICE_LOOKUP_KEY})..."
PRICE_ID=$(stripe_cli prices list --lookup-keys "$PRICE_LOOKUP_KEY" --limit 1 2>/dev/null \
  | jq -r '.data[0].id // empty')

if [[ -z "$PRICE_ID" ]]; then
  PRICE_ID=$(stripe_cli prices create \
    --product "$PRODUCT_ID" \
    --unit-amount "$PRICE_AMOUNT" \
    --currency "$PRICE_CURRENCY" \
    -d "recurring[interval]=month" \
    --lookup-key "$PRICE_LOOKUP_KEY" \
    | jq -r '.id')
  echo "    created price: $PRICE_ID"
else
  echo "    reusing price: $PRICE_ID"
fi

# ---- 3. Webhook endpoint ---------------------------------------------------
# Note: for LOCAL development use `stripe listen --forward-to
# localhost:8080/api/stripe-webhook` instead — this endpoint is the deployed one.
echo "==> Ensuring webhook endpoint (${WEBHOOK_URL})..."
WEBHOOK_EXISTS=$(stripe_cli webhook_endpoints list --limit 100 2>/dev/null \
  | jq -r --arg url "$WEBHOOK_URL" '.data[] | select(.url == $url) | .id' | head -n1)

WEBHOOK_SECRET=""
if [[ -z "$WEBHOOK_EXISTS" ]]; then
  # The signing secret is only returned at creation time.
  EVENT_ARGS=()
  for ev in "${WEBHOOK_EVENTS[@]}"; do
    EVENT_ARGS+=(-d "enabled_events[]=$ev")
  done
  CREATE_OUT=$(stripe_cli webhook_endpoints create \
    --url "$WEBHOOK_URL" \
    "${EVENT_ARGS[@]}")
  WEBHOOK_ID=$(echo "$CREATE_OUT" | jq -r '.id')
  WEBHOOK_SECRET=$(echo "$CREATE_OUT" | jq -r '.secret // empty')
  echo "    created webhook: $WEBHOOK_ID"
else
  echo "    reusing webhook: $WEBHOOK_EXISTS (signing secret not re-shown — see dashboard)"
fi

# ---- 4. Output -------------------------------------------------------------
SECRET_KEY=$(stripe_cli config --list 2>/dev/null \
  | awk -F"'" '/test_mode_api_key|live_mode_api_key/{print $2; exit}')

echo
echo "============================================================"
echo " Stripe ${MODE} objects ready. Add these to .env:"
echo "============================================================"
echo "STRIPE_SECRET_KEY=${SECRET_KEY:-<your ${MODE,,}-mode secret key>}"
echo "STRIPE_PRICE_PROFESSIONAL=${PRICE_ID}"
if [[ -n "$WEBHOOK_SECRET" ]]; then
  echo "STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}"
else
  echo "# STRIPE_WEBHOOK_SECRET — reused existing endpoint; for LOCAL dev run:"
  echo "#   stripe listen --forward-to localhost:8080/api/stripe-webhook"
  echo "#   (and use the whsec_... it prints)"
fi
echo "============================================================"
