# Changes log

A simplified list of changes made to ExitEcom. Newest first.

## 2026-08-12 — Approval email sender and Reply-To

The approval email arrived from `exitecomai@gmail.com` rather than the intended
`notifications@exitecom.com`. Not a code bug: Gmail's SMTP sends as the
authenticated account or a verified "Send mail as" alias, and silently rewrites
anything else — no error, so the send reports success while showing the raw
mailbox.

- `SMTP_FROM` now set to `ExitEcom <notifications@exitecom.com>`; it takes effect
  once that address is verified as an alias on the Gmail account, or once the
  domain's own SMTP is used instead.
- Added an optional `SMTP_REPLY_TO` secret. Reply-To isn't policed the way From
  is, so replies reach the right inbox even while the From is being rewritten.
- Documented both, plus why a Gmail account is the wrong long-term sender for a
  business domain (DMARC alignment, deliverability).

## 2026-08-12 — Computed results go through admin approval

Running Exit Readiness Score, Risk Scanner, Valuation Engine or Optimization
Plan no longer publishes the result. Each run is queued for review in
`/admin/requests`; the team reads it, edits anything they want, and approves or
rejects it. On approval the result is published and the founder is emailed. Until
then they see "We're processing your request — you'll get an email when it's
done."

Full write-up in [`report-approvals.md`](report-approvals.md). Highlights:

- **One request per tool.** The four are approved independently, so a founder can
  have an approved valuation while their risk scan is still in review. The Full
  Report unlocks only once all four are approved — otherwise it would hand a
  buyer a document containing an unreviewed risk register.
- **The payload is frozen at submit time.** If it were recomputed at approval, a
  Shopify sync in between would move the numbers and the team would be approving
  something they never saw.
- **Edits are an audited override layer, not a mutation.** Admin edits are stored
  as a sparse patch; `applyOverrides()` lays them over the untouched engine
  payload. The original is always recoverable, `overrideDiff()` shows exactly what
  changed, every approval writes the change list to `admin_audit_log`, and an
  untouched request publishes byte-identical deterministic output.
- **Publishing is scoped to the approving tool.** Every request carries the whole
  `computeFullReport` payload, so approving a valuation would otherwise publish an
  unreviewed risk register as a side effect.
- **Email is best-effort.** Sent by a new `notify-report-ready` Supabase Edge
  Function over SMTP. If it fails the result is still approved and visible,
  `notified_at` stays null, and the admin is told the email didn't send — better
  than rolling back an approval because a mail server was down.
- **A founder cannot approve their own request.** The insert policy allows only
  `status = 'pending'` on a business they own, and there is no owner update or
  delete policy at all. A reviewed request is final; changing a published result
  means re-running the tool.

**Live as of 2026-08-12.** Migration pushed to the hosted project, the Edge
Function deployed, and Gmail SMTP secrets set and verified with a real send.

One fix during deployment: the function first used `denomailer`, which booted
but crashed the worker the moment it opened the SMTP connection — the invoke
returned 503, which is the runtime killing the isolate rather than any of the
function's own error paths. Replaced with `npm:nodemailer`, which negotiates
STARTTLS on port 587 properly.

## 2026-08-12 — Printed reports no longer carry the query string

The browser stamps the page URL into the printed header/footer, so every page of
an exported report read `https://dash.exitecom.com/reports?report=full` — an
internal routing detail on a document meant for buyers and brokers.

`useCleanPrintUrl()` (`src/lib/printUrl.ts`) swaps the URL for the bare origin
on `beforeprint` and restores it on `afterprint`, so the footer reads
`https://dash.exitecom.com`. It hooks the events rather than the button, so
Ctrl/Cmd-P behaves the same, and it calls the native
`History.prototype.replaceState` rather than the router-patched one — otherwise
TanStack Router would treat it as a navigation to `/` and unmount the report
being printed.

## 2026-08-12 — Reports documented

Added [`docs/reports.md`](reports.md), covering the Reports feature end to end:
what a report is (rendered live, never stored), the three gating states, the
five report types and the thirteen sections they slice from, the availability
gating for Marketing and Traffic, URL-based report selection, branding, and how
the print-to-PDF export works — including the two print traps that have already
bitten once (a blanket `nav` rule hiding the document's own contents page, and
backgrounds vanishing without `print-color-adjust: exact`).

Also fixed the report's own Methodology section, which still told the reader
"AI is used only to polish the wording of risk and action descriptions" after
Gemini was removed.

## 2026-08-12 — Onboarding + Profile reworked, Gemini removed

Three changes that ended up related: the profile screens now share one set of
option lists, and removing the AI made the free-text fields they replaced
unnecessary.

### Gemini removed entirely

`src/lib/ai.ts`, the `@google/generative-ai` dependency and `GEMINI_API_KEY` are
gone. ExitEcom now has **no AI integration at all** — figures were already
deterministic, and the risk/action copy is deterministic templating.

- `enrichRiskCopyFn` was dead code — exported but never called from anywhere.
- `normalizeBusinessProfileFn` tidied free-text profile entries (`below 10k
  dollar` → `< $10k`). The profile fields are dropdowns now, so there is nothing
  left to tidy.
- Purged from README, CLAUDE.md, `.env.example`, `docs/env-vars.md`,
  `docs/architecture.md`, `docs/report-calculations.md` and the privacy policy's
  third-party disclosure.

### Business Profile: dropdowns, founder dependency, completeness

`/profile` was seven free-text boxes, so "beauty", "Beauty" and "Beauty &
Skincare" were three different industries and nothing matched what onboarding
had saved.

- Every field except Business Name is now a **dropdown** — industry, primary
  channel, country, business age, monthly revenue, exit timeframe — sourced from
  the new `src/lib/profileOptions.ts`, which onboarding imports too.
- **The three founder-dependency answers are now editable.** Onboarding has
  always asked who runs paid ads, who handles suppliers and whether SOPs are
  documented, written all three to `businesses` — and then never read them back.
  They weren't loaded into `BusinessData`, shown anywhere, or updatable. Now they
  are all three.
- Fields are grouped (Business Basics / Exit Intent / Founder Dependency), Save
  is disabled until something actually changes, and a **Profile Completeness**
  card names the fields still blank.
- Fixed the business-age warning: it ran `parseFloat("Under 12 months")` → `NaN`,
  so the "under 3 years compresses your multiple" hint never fired for the
  youngest businesses. `businessAgeYears()` reads the conservative end of each
  band ("3–5 years" → 3) and returns `null` for unknown.
- A stored value outside the current list stays selectable (`withCurrentValue`),
  so opening the page can't silently rewrite an older answer.

### Onboarding

- **No pre-filled guesses.** Industry, age, exit timeframe and the founder
  questions used to arrive pre-selected, so skimming the form saved answers we
  invented. All start blank and are required.
- **A Back button.** The flow was one-way: a typo on step 1 could only be fixed
  after finishing.
- **Answers survive a refresh** via a `localStorage` draft, cleared on save.
- **A failed save no longer shows "You're all set."** It toasted an error and
  then displayed the success screen anyway, dropping the founder on an empty
  dashboard with no idea their answers were lost. There's now a retry state.
- Step 2's copy claimed the answers feed "our AI" — they don't, and there is no
  AI. It now explains why founder dependency matters to a buyer.
- Monthly revenue is brackets only; the free-typed custom amount is gone, since
  every calculation uses real Shopify figures rather than this field.
- Shared `Input`/`Select` moved to `src/components/ex/FormField.tsx` so both
  screens use the same controls.

No migration: all four columns already exist in `20260525000000_init.sql`.

## 2026-08-12 — Sidebar Reports nav tells the truth

The Reports group offered **Saved Reports** and **Downloads**. Both pointed at
the same `/reports` route, and neither feature existed — nothing is saved, and
the PDF is print-on-demand rather than a stored file. Two labels, one
destination, both promising something the app doesn't do.

Replaced with a single **Reports** parent that expands to the five reports —
Exit Readiness Score, Valuation Engine, Risk Scanner, Optimization Plan, Full
Report — matching the existing Data Sources parent/children pattern.

- **Which report is open now lives in the URL** (`/reports?report=risk`) instead
  of component state, so the sidebar can link straight to one and a report can
  be bookmarked, shared or reloaded without bouncing back to the picker. An
  unrecognised value falls back to the picker rather than erroring.
- **Active-state detection is search-aware.** All five children share the
  `/reports` path, so matching on pathname alone would light up all of them at
  once; an entry with a `search` matches only that value, and one without
  matches only the bare route.
- **The children are generated from `REPORT_TYPES`**, so the nav can't drift
  from the reports that actually exist.
- Full Report moved to the end of `REPORT_TYPES` (tools first, then the
  everything document), which also reorders the picker cards.
  `reportTypeById`'s fallback now names "full" explicitly rather than relying on
  it being first.
- Removed four dead lucide imports (`Bookmark`, `Download`, and the
  already-unused `BarChart3`, `Folder`).

## 2026-08-12 — Reports carry ExitEcom branding

These documents are meant to be handed to buyers and brokers, so they now say
where they came from in three places:

- **Masthead** on the cover — the ExitEcom logo and `exitecom.com`, above the
  confidentiality line.
- **Colophon** closing the document — "Prepared by ExitEcom — pre-exit
  intelligence for e-commerce founders", the business it was generated for, the
  date, and the domain.
- **Running footer on every printed page** — the business name, which report it
  is, and `ExitEcom · exitecom.com`. Implemented as a `position: fixed` element
  in the print block (fixed elements repeat per page), with the sheet reserving
  bottom padding so content can't run underneath it. Hidden on screen, where the
  masthead and colophon already carry the brand.

The domain lives in one constant (`BRAND_DOMAIN` in `ReportDocument.tsx`), and
the logo reuses the existing `Logo` component rather than a second wordmark.

## 2026-08-12 — Reports is a picker first

Opening Reports no longer drops you into a document. The page now lists the
five reports as cards — name, what it covers, section count, and a **View
Report** button — and renders nothing below them. Choosing one replaces the
grid with that report alone, headed by its own title and an "All reports"
control to go back. Recompute is available from both views; Download PDF sits
with the open report, so the export is unambiguously the one on screen.

## 2026-08-12 — Printed reports keep their bars, dots and colours

The PDF was dropping things that were plainly visible on screen. Two causes,
both in the `@media print` block in `styles.css`:

- **Backgrounds were being stripped.** Browsers discard `background-color` when
  printing unless a page opts in, so everything coloured by background —
  the monthly-revenue bars, the severity dots on risks/actions/score rows, and
  the contents, note and stat panels — printed blank, while text-coloured
  elements survived. Fixed with `print-color-adjust: exact` on all elements.
- **The contents page was hidden.** The rule hiding screen chrome hid every
  `<nav>`, and the document's own table of contents *is* a
  `<nav class="report-contents">`. Hiding is now scoped to `.report-chrome` and
  the app sidebar.

Also: grids inside the document keep their columns when printing (only the
page's sidebar/document columns collapse), and the revenue-bar track is
outlined, so the chart still reads if the user unticks "Background graphics" in
the print dialog.

## 2026-08-12 — Reports offers a report per tool

Reports now has five documents rather than one, so a founder can take a single
tool's output to a buyer instead of the whole book:

- **Exit Readiness Score** — the nine dimensions and what drives each
- **Valuation Engine** — earnings basis, scenarios, every multiple driver
- **Risk Scanner** — the full risk register with the buyer-lens fields
- **Optimization Plan** — prioritised actions, steps, £ uplift
- **Full Report** — everything

Picked from cards at the top of the page; the chosen report renders below with
its own contents list, section nav and cover (title and headline stats follow
the report — the Risk Scanner leads with risks found and valuation at risk, the
Optimization Plan with total uplift).

They are not five implementations. Each section's markup is written once in
`ReportDocument`, and `REPORT_TYPES` in `src/lib/reportSections.ts` declares
which sections each report includes and in what order — so a figure cannot
disagree between two reports, and adding a section to one is a one-line change.
Section numbering is computed per report, and optional-feed sections (Marketing,
Traffic) still drop out with the numbering closing up.
`src/lib/reportSections.test.ts` covers the slicing, the numbering and the
guard against a report naming a section the document can't render.

## 2026-08-12 — Reports is a real, complete document

`/reports` was the last page still showing invented content: three hardcoded
rows with fake timestamps ("Today", "Yesterday", "3 days ago"), three fake
report types, and buttons that did nothing. It is now a single buyer-grade
**Exit Readiness Report** containing everything the deterministic engine
computes.

- **One document, not a list of report types.** Cover, contents, executive
  summary, data sources & confidence, business overview, financial performance
  (gross/net revenue, COGS, gross profit, opex, EBITDA, SDE, adjusted earnings,
  growth, AOV, monthly revenue), customers & retention, product concentration
  (top 15), marketing efficiency, traffic & acquisition, the 9-dimension exit
  score, valuation scenarios and drivers, the full risk register with the
  buyer-lens fields, the full optimization plan with steps and £ uplift, and a
  methodology section stating how each figure is derived.
  New: `src/components/ex/ReportDocument.tsx`.
- **Every number comes straight off `computeFullReport`.** The page reads
  `useReport()` and renders — it computes nothing of its own, so the figures are
  identical to the Exit Score, Valuation, Risk Scanner and Optimization pages.
- **Optional feeds are omitted, never estimated.** Marketing Efficiency renders
  only when an ad platform is connected (`adSpendVerified`) and Traffic only
  with GA4; section numbering closes up around them. When no ad feed exists,
  Data Sources says plainly that spend is a benchmark estimate and ROAS cannot
  be stated.
- **PDF by print, with no new dependency.** "Download PDF" calls
  `window.print()`; a `@media print` block in `styles.css` drops the sidebar,
  page header and section nav, removes the sheet's frame, sets A4 margins and
  applies `break-inside: avoid` so sections, tables and risk/action items don't
  split across pages. The export therefore can't drift from the on-screen
  version the way a second hand-built PDF layout would.
- **Gating matches the other report pages** — `ConnectShopifyGate`, then
  `RunReportCard` until the user generates, then the document with a
  `RecomputeButton`.

No migration, no server function and no AI is involved in any figure.

## 2026-08-11 — Connections are durable and cross-device

Connecting a source now sticks: sign in months later, or on a different device,
and it still reads as connected. Two problems were making connections look lost.

- **A connector commit could disconnect every *other* connector.** Each
  `commit*Sync` wrote `valuation_data.connected_sources` as
  `[...business.connectedSources, "<source>"]` — taken from **React state**. In
  an OAuth popup (a fresh page load, and on a new device with no localStorage
  cache) that array is often still `[]` when the commit runs, so the upsert
  overwrote the stored list with just the one source and silently wiped the
  rest. All 16 add/remove sites now go through `addConnectedSource` /
  `removeConnectedSource` (`src/lib/connectedSources.ts`), which read-modify-write
  against the database — a stale tab can only ever add its own source.
- **Drifted lists are now repaired on load.** The tokens in the `*_accounts`
  tables are the real proof a connector works; the array is a denormalised copy.
  On every load the app checks which connector rows actually exist and folds any
  missing ones back into the array (and persists the repair), so users already
  affected by the bug above get their connectors back without reconnecting. The
  reconcile is deliberately **additive only** — a transient RLS error or an
  unmigrated table can never mark a working connector as disconnected; removal
  stays explicit, via the disconnect actions.

Nothing needed to change about storage itself: every connector already persists
its credentials server-side in RLS-protected tables (`shopify_stores`,
`meta_accounts`, `google_accounts`, `tiktok_accounts`, `snapchat_accounts`,
`ga4_accounts`), and the browser caches are only a first-paint optimisation
seeded from Supabase.

**Known platform limit:** Google, GA4 and Snapchat store a refresh token and
renew themselves indefinitely; TikTok's tokens are long-lived. **Meta** is the
exception — the Graph API issues a ~60-day long-lived token with no refresh
token, so a Meta connection genuinely does need re-authorising every couple of
months. That's a Meta constraint, not a storage bug.

## 2026-08-11 — Connector OAuth: stop losing connections silently

Connecting Google Ads via OAuth could appear to work and then be gone after a
refresh, with no error shown anywhere. Three separate defects combined to make a
failure indistinguishable from a success:

- **A connector could write nothing and still report success.** Every commit
  function bailed out with `toast.success("… synced (local sandbox).")` when
  `business.id` wasn't in state — including in a fully configured production
  environment, where that is a real failure, not a sandbox. TikTok and GA4 had
  each been patched with a copy-pasted business-id lookup; Google, Meta,
  Snapchat and Shopify had not. All six now share `resolveBusinessId`
  (`src/lib/businessId.ts`), which returns `null` **only** when Supabase is
  unconfigured and otherwise either returns a real id or throws. The "local
  sandbox" message is now unreachable in production by construction.
- **The parent page could silently discard the popup's result.** It polled
  `popup.closed` every 500ms while also listening for a `postMessage`. The popup
  posts and then immediately closes; `closed` flips synchronously while the
  message is still queued, so the poll could win, tear down the listener and
  reset the UI to idle — throwing away error messages. The popup now records its
  outcome to `localStorage` **before** closing, and the new `useOAuthPopup` hook
  resolves from whichever of three signals arrives first (postMessage, a
  `storage` event, or its own close-detection), latching so the others are
  no-ops. If the popup closes leaving no result at all, the parent queries the
  database instead of guessing.
- **Success navigated without refetching.** `/google-data` renders from provider
  state, so it showed "not connected" until a manual refresh. Every connector now
  refetches before navigating.

Also: OAuth failures now name the step that broke (`exchanging`, `listing`,
`picking`, `pulling`, `committing`) in the popup's error card and in a
persisted "last attempt failed at …" panel on the connect page, so a lost popup
still leaves an explanation. `[oauth:<provider>]` console breadcrumbs trace the
whole flow. The popup also renders an in-tab success/error card if the browser
refuses to close it — which is what happens when Google's COOP header severs
`window.opener`. Finally, the CSRF state check now accepts any of the last few
issued states, so a connect-page remount no longer invalidates an authorization
already in flight. Applies to Google, Meta, TikTok, Snapchat and GA4.

## 2026-06-24 — Exit engine: wire missing feeds + guard "no data ≠ perfect"

Three core-engine bug fixes:

- **TikTok, Snapchat, bank statements and P&L now actually reach the report.**
  `useReport` (the hook that drives the on-demand Exit Score / Valuation / Risk /
  Optimization pages) was only passing Meta, Google and GA4 into
  `computeFullReport`. The engine and the per-connector data pages already
  supported the other four inputs, so connected TikTok/Snapchat feeds and
  uploaded financial documents were silently dropped from the saved report —
  Marketing Efficiency, ROAS, blended CAC and Data Confidence were all computed
  as if those sources didn't exist. They're now wired in (Snapchat passes its
  campaign-summed `conversionValueTotal`, matching the data-page wiring).
- **Single-month ad feeds no longer read as perfectly stable.** `spendStability`
  used the variance of the monthly-spend series; with one row that variance is 0,
  which awarded full marks and inflated Marketing Efficiency for brand-new
  accounts. Stability now requires ≥2 months, else stays neutral (0.5).
- **Missing line-item data no longer scores Product & Supply Risk as perfect.**
  With no attributable line items `topProductShare` is 0, which made the risk
  dimension award full marks (and the Risk Scanner report a misleading "0%"). The
  dimension is now held neutral (0.5) and the risk flagged medium "can't verify"
  when there are no product-revenue rows — matching the existing GA4
  channel-concentration guard.

## 2026-06-24 — Document verification status shown to founders

The team's review decision on each uploaded financial document
(`document_reviews`) is now surfaced to the founder who uploaded it, not just on
the admin dashboard. A shared `DocumentStatusBadge`
(`src/components/ex/DocumentStatusBadge.tsx`) renders the three states with
founder-facing labels — **Pending Verification** (default on upload),
**Approved**, **Rejected** — and is used on both the founder Bank Statements /
P&L pages (`_app.bank-statements-data`, `_app.pl-data`) and the admin documents
table. `useBusinessData` now joins `document_reviews` onto each loaded
bank-statement / P&L file (`reviewStatus`, defaulting to `pending`). A new
migration adds an
owner-scoped select policy so a founder can read reviews for files they own
(`20260624110000_document_reviews_owner_read.sql`).

## 2026-06-24 — Admin: fix document preview (downloaded instead of rendering)

Opening a document for verification (`/admin/documents`) showed a loading state
then prompted to download the PDF instead of rendering it inline. The dialog now
fetches the signed URL, re-wraps the bytes as an `application/pdf` blob, and
points the `<iframe>` at that object URL — which forces an inline preview
regardless of the stored object's content-type/disposition. The object URL is
revoked on close (`src/routes/_app.admin.documents.tsx`).

## 2026-06-24 — Admin: polish the user detail page

Refined the full-page user view (`src/routes/_app.admin-user.$userId.tsx`) to use
the product's real visual language: a dashboard-style hero (Exit Readiness with
`ScoreRing` + tier badge, Estimated Value Range on a `card-dark`, and a
`surface-accent` "Value Left on the Table" card), a formatted "Key metrics"
snapshot grid (money as £, ratios as %, multiples as ×) replacing the raw column
dump, and connector rows with a live-status dot + `connected` badge plus
"Not connected" badges for the engine's missing sources.

## 2026-06-24 — Admin: user detail is now a full page

The per-user drill-down moved from a popup dialog to a dedicated full-bleed page
at `/admin-user/$userId` (`src/routes/_app.admin-user.$userId.tsx`). Clicking a row
in `/admin/users` now navigates there. On that page the admin sidebar is **replaced
by a user-context sidebar** — the selected user's avatar/name/email, a role badge,
their business-name chip, quick facts (exit score, risk score, connectors, docs
uploaded, joined, last seen), in-page section links, and the admin actions
(promote/demote, send password reset, delete).

The main area renders **everything using the app's real components** instead of a
generic key/value dump: an Overview hero with `ScoreRing` + valuation range + risk
score, account/preferences, business profile, the full valuation row, connectors,
risks via `RiskCard`, optimization actions via `ActionCard`, the due-diligence
checklist, and uploaded-file metadata.

- `src/routes/_app.tsx` suppresses the global sidebar + centered container on
  `/admin-user/*` (the page owns the whole viewport) and treats it as an admin
  route so superadmins aren't bounced to `/admin`.
- `src/routes/_app.admin.users.tsx` dropped the dialog; the row click navigates.
- No server/DB changes — `getUserDetailFn` already returns the full payload.

## 2026-06-24 — Billing: Stripe subscription paywall

The whole app is now gated behind an active **Stripe** subscription
(£199/mo "Professional"). A signed-in user without an active plan is redirected
to the new `/subscribe` page; `/subscribe` and `/billing` are exempt so the
upsell and post-checkout return always render. Superadmins bypass the gate.

- **Checkout & portal** — `src/lib/billing.ts` adds `createCheckoutSessionFn`
  (Stripe-hosted Checkout, `mode: subscription`, no `payment_method_types` so
  Stripe picks methods dynamically) and `createPortalSessionFn` (Stripe-hosted
  Customer Portal for card/invoices/cancellation). The Stripe SDK is dynamically
  imported so it never enters the client bundle.
- **Webhook is the only writer** — `src/lib/stripe-webhook.ts`, mounted in
  `src/server.ts` at `POST /api/stripe-webhook` (intercepted before TanStack so
  the raw body survives signature verification), upserts the `subscriptions`
  table via the service-role client. The browser can only read its own row (RLS,
  SELECT-only), so a user can never grant themselves a plan.
- **Status source of truth** — `getBillingStatusFn` + `useSubscription` report
  whether billing is configured and whether the caller has access. Blank Stripe
  env = paywall disabled (Demo-mode parity); status lookups fail open.
- **Migration** `20260624100000_subscriptions.sql` adds the `subscriptions`
  table and **grandfathers all existing users** with a `comp` (complimentary)
  status so the new paywall never locks out current accounts.
- `/billing` replaced its hardcoded mock (plan, fake card, dummy invoices) with
  real subscription data + a "Manage billing" button to the Stripe portal.

Setup, env vars, and local testing: `docs/billing-setup.md`. Created the test
product/price/webhook via `scripts/setup-stripe.sh`.

## 2026-06-24 — Admin: full per-user drill-down

Selecting a user in the Super Admin dashboard (`/admin/users`) now shows
**everything** ExitEcom holds on that account, not just name/role/exit-score.
`getUserDetailFn` (`src/lib/admin/users.ts`) now returns: the auth record (email
confirmed, phone, sign-in providers, joined/last-seen), profile preferences
(timezone, currency, notifications), the full business profile, the complete
deterministic valuation row, all risks and optimization actions, the
due-diligence document checklist, uploaded bank-statement/P&L file metadata, and
every connector's status (account label, connection path, currency, last sync,
months of data pulled). The detail dialog (`src/routes/_app.admin.users.tsx`) is
now a wide, scrollable, sectioned panel rendering all of it.

Secrets are still never returned: connector account rows are read with `select
*` server-side but only non-secret fields are mapped into the response — access
tokens, refresh tokens, and connection keys never leave the server. Also fixes a
latent bug where the old code selected `account_status` from `shopify_stores`
(which has no such column), so Shopify never appeared as connected.

## 2026-06-24 — Google Ads: report the account's whole history

The connector pulled a fixed last-365-days window. It now reports the account's
**entire history** — from the earliest date with any campaign data through today
(`src/lib/google.ts`). Google Ads has no account-creation field, so the first
dated row is used as the window start, discovered via a cheap
`SELECT segments.date FROM campaign ORDER BY segments.date ASC LIMIT 1`. Falls
back to the 365-day window if the account has no data yet or discovery fails, so a
sync always succeeds. The returned `range` and the monthly series now span the
full window, which also widens the ad-spend-stability basis in `analytics.ts`.

## 2026-06-24 — Google Ads: fix invalid LAST_365_DAYS date literal

The monthly + per-campaign GAQL queries filtered on `segments.date DURING
LAST_365_DAYS`, but `DURING` accepts only a fixed set of literals (LAST_7_DAYS,
LAST_30_DAYS, THIS_MONTH, …) — there is no `LAST_365_DAYS` — so every live pull
failed with `400 INVALID_VALUE_WITH_DURING_OPERATOR`. Replaced both with an
explicit `BETWEEN '<since>' AND '<until>'` one-year range computed in `pull()`
(`src/lib/google.ts`), and reused those dates for the returned `range`.

## 2026-06-24 — Google Ads connector is now truly multi-tenant

Removed the global `GOOGLE_LOGIN_CUSTOMER_ID` env var and its fallback in
`searchStream` (`src/lib/google.ts`). It forced **every** tenant's queries through
one Manager (MCC) `login-customer-id`, so any user connecting an account that MCC
didn't manage failed with `403 USER_PERMISSION_DENIED`.

- **Per-connection only.** The `login-customer-id` is now always the connecting
  user's own manager, discovered during OAuth and stored per connection
  (`google_accounts.login_customer_id`); directly-owned accounts send no header.
  No app-owned/global id is ever imposed on a tenant's query.
- **Docs.** Clarified in `docs/env-vars.md` / `docs/google-ads-setup.md` that the
  developer token only identifies the app (it does **not** require users' accounts
  to live in your MCC — access comes from each user's OAuth), and removed the var
  from `.env.example`.

## 2026-06-24 — Removed the ExitEcom Analytic Shopify connector

Shopify now connects **only** via a merchant's own custom-app Admin API token. The
ExitEcom Analytic connection-key path (which exchanged a key with a separate
ExitEcom-hosted OAuth service) has been removed end-to-end.

- **Server fn gone.** Deleted `syncViaConnectionKeyFn` + `AnalyticSyncInput` and the
  `SHOPIFY_ANALYTIC_APP_URL` usage from `src/lib/shopify.ts`.
- **Hook simplified.** `useBusinessData` dropped `syncStoreViaKey`, the
  `connectionKey`/`source: 'analytic'` Shopify creds, and the analytic refresh
  branch; `storeCreds` is now just `{ shopDomain, accessToken }`.
- **Connect UI.** `shopify-connect` no longer has the method selector / "ExitEcom
  Analytic key" tab — it shows the custom-app form directly.
- **Env.** Removed `SHOPIFY_ANALYTIC_APP_URL` from `.env.example` and `docs/env-vars.md`.
- **DB.** Migration `20260624000000_remove_shopify_analytic_connector.sql` drops the
  now-unused `shopify_stores.connection_key` column (must be pushed live). Stores
  previously connected via the analytic key must reconnect with a custom-app token.

## 2026-06-24 — Google Ads: never query a Manager (MCC) account for metrics

Fixed a Google Ads OAuth bug where connecting with a Manager (MCC) account
auto-selected the manager itself and then failed with a cryptic
`INVALID_ARGUMENT` (`REQUESTED_METRICS_FOR_MANAGER`) during data pull — a manager
serves no ads, so it has no metrics. (`src/lib/google.ts`.)

- **OAuth expansion.** `exchangeGoogleOAuthCodeFn` now expands a manager — _or any
  seed it can't positively confirm as a standalone account_ (introspection
  returned no usable customer row) — into its non-manager client accounts, so the
  MCC is never offered or auto-picked directly.
- **Fail fast on a manager.** `pull()` fetches the account first and throws a
  clear, actionable error if `customer.manager` is true, instead of letting the
  metrics queries reject with an opaque 400.
- **Better error hint.** Added `REQUESTED_METRICS_FOR_MANAGER` /
  `METRICS_INCOMPATIBLE_WITH_MANAGER` to `hintForCode` so any future occurrence
  reads "pick one of the ad accounts under this manager."

## 2026-06-22 — Super Admin Dashboard

Added a role-gated admin control panel at `/admin`, the first role concept in the
app.

- **Roles & access.** New `profiles.role` column (`'user' | 'superadmin'`, default
  `user`) + `public.is_superadmin()` helper. New migration
  `20260622000000_admin_roles.sql` (must be pushed live), which also seeds
  `iam@exitecom.com` as the first superadmin once that account exists. `useAuth`
  now exposes `role`; new `RequireSuperAdmin` guard bounces non-admins to
  `/dashboard`; the sidebar shows an **Admin** group only for superadmins.
- **Server-only cross-user reads.** All admin data goes through `createServerFn`
  handlers in `src/lib/admin/*` that call `requireSuperadmin()` first, then use a
  **service-role** Supabase client (`src/lib/admin/server.ts`) to bypass RLS. The
  service-role key is server-only (`SUPABASE_SERVICE_ROLE_KEY`, never `VITE_`).
  Connector access/refresh tokens are never returned to the client.
- **Modules.** Overview (deterministic platform analytics: users, signups,
  connector adoption, exit-score distribution), Users (search/sort/CSV, role
  change, password-reset email, delete), Documents (all bank-statement & P&L PDFs,
  signed-URL inline preview, verify/reject/pending status via new
  `document_reviews` table), and an Audit Log (every admin mutation → new
  `admin_audit_log` table, filterable + CSV export).
- **New env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (see
  `docs/env-vars.md`).

## 2026-06-19 — Data pages design consistency

Unified the UI across all eight data pages (`store-data`,
`bank-statements-data`, `pl-data`, `meta-data`, `google-data`, `tiktok-data`,
`snapchat-data`, `ga4-data`) onto one design language. `store/meta/google/ga4`
were already the reference; the others were brought in line.

- **`tiktok-data` / `snapchat-data`** rebuilt to match the reference layout:
  descriptive `PageHeader` (account details moved into the metadata grid),
  header `Sync now` (`btn-primary`) + `Disconnect` (`variant="button"`) with a
  `Last synced` line, a 4-up account-metadata grid (`Field`), 4 at-a-glance
  `Count` cards (incl. blended CAC, replacing the old inline banner), underline
  tabs, and the shared `DataTable`. They now auto-resync when data is stale (6h)
  like the others, instead of only on first load. Snapchat keeps its
  account-level-spend-only monthly note.
- **`bank-statements-data` / `pl-data`** empty states now use the reference gate
  card (circle icon, `font-display` headline, accent CTA) with a `PageHeader`;
  the header action row matches (`Disconnect` `variant="button"` + primary
  `Upload more` + `Last updated` line).

## 2026-06-19 — "Continue with Google" button polish

Visual + UX upgrade to the OAuth button on `/login` and `/signup`
(`src/routes/signup.tsx`).

- Added the official multi-colour Google "G" logo (inline SVG).
- Dedicated `googleLoading` state: the button shows a spinner +
  "Connecting to Google…" while the redirect kicks off, independent of the
  email form's submit state; both buttons disable during either action.
- Added a real hover state to `btn-ghost-light` (`src/styles.css`) and a
  `not-allowed` cursor when disabled.

## 2026-06-19 — Settings page made functional

The Settings page (`src/routes/_app.settings.tsx`) was entirely non-functional —
every field was a static placeholder with no state, no save handler and no
backing store. It now reads and persists real data.

- **Profile tab** loads the current full name/email from the auth user and the
  timezone/currency from `profiles`. Save writes `full_name` to both the auth
  `user_metadata` (what the app reads for the owner's name) and the `profiles`
  row, persists timezone/currency, and triggers Supabase's email-change
  confirmation when the email is edited.
- **Notifications tab** binds the four toggles to `profiles.notification_prefs`
  (jsonb) and persists them.
- **Integrations tab** now links to the Data Sources page.
- **Security tab** — Change Password opens an inline form that calls
  `supabase.auth.updateUser({ password })`. **Two-factor authentication was
  removed.**
- Demo Mode (no Supabase) degrades gracefully with a non-persisting toast.
- Migration `20260619000000_profile_settings.sql` adds `timezone`, `currency`
  and `notification_prefs` to `profiles` (applied to the hosted project).

## 2026-06-19 — Google sign-in: onboarding routing + display name

Fixes two issues seen after a first "Continue with Google" sign-up: onboarding
was skipped (straight to the dashboard) and the owner's name was blank.

- **New users now reach onboarding wherever the OAuth round-trip lands.** The
  onboarding-vs-app decision moved into a shared `resolvePostAuthDestination()`
  (`src/components/auth/RouteGuards.tsx`), used by both `/auth-callback` and
  `RequireGuest`. So even if Supabase falls back to its Site URL (landing on a
  guest page instead of the callback), a profile-less user is still sent to
  `/onboarding` rather than bounced to `/dashboard`.
- **Display name now resolves for Google users.** `ownerName`
  (`useBusinessData`) falls back to `user_metadata.name` (Google's claim) when
  `full_name` is absent, so the dashboard greeting and sidebar show the name.

## 2026-06-19 — "Continue with Google" sign-in completed

The Google sign-in button on `/login` and `/signup` now drives a full OAuth
round-trip with proper landing logic.

- `signInWithGoogle(redirectTo?)` (`src/hooks/useAuth.tsx`) now passes an
  explicit `redirectTo` so Google returns to our own callback rather than the
  project's default Site URL.
- New public route `src/routes/auth-callback.tsx` resolves the Supabase session
  from the redirect, then routes: **new** Google users (no business profile) →
  `/onboarding`, **returning** users → their saved `redirect` target or
  `/dashboard`; denied/failed consent → `/login` with a toast.
- The user's intended destination (`?redirect=`) is carried through Google and
  honoured on return.
- **Supabase config required** (not code): enable the Google provider in
  Auth → Providers, and add `<app-origin>/auth-callback` (prod + localhost) to
  Auth → URL Configuration → Redirect URLs, or the `redirectTo` is rejected.

## 2026-06 — Ad-platform & analytics connectors

Real marketing data now feeds the Exit Score, beyond Shopify. Each connector
authenticates, pulls raw data, stores it (RLS-protected), and surfaces it on its
own data page; the figures flow into `src/lib/analytics.ts` via a shared
`adFeeds` pipeline (Meta / Google / TikTok / Snapchat) plus a separate GA4
traffic signal.

- **Meta Ads** (`src/lib/meta.ts`, migration `..._meta_raw_data.sql`) — spend,
  ROAS, per-campaign breakdown.
- **Google Ads** (`src/lib/google.ts`, `..._google_raw_data.sql` +
  `..._google_login_customer_id.sql`) — GAQL monthly + per-campaign; `cost_micros ÷ 1M`.
- **TikTok Ads** (`src/lib/tiktok.ts`, `..._tiktok_raw_data.sql`) — `Access-Token`
  header, code-`0` envelope, daily reports bucketed to months; in-app OAuth.
- **Snapchat Ads** (`src/lib/snapchat.ts`, `..._snapchat_raw_data.sql`) — OAuth
  with 1-hour tokens + auto-refresh. **Account-level stats expose only `spend`**,
  so the monthly series comes from account-level DAY spend (≤28-day, timezone-
  aligned windows) and conversions/value come from per-campaign TOTAL stats; the
  monthly table shows "—" for per-month conversions. The real period conversion
  value reaches the score via the feed's `conversionValueTotal`. See
  [snapchat-ads-setup.md](snapchat-ads-setup.md).
- **GA4** (`src/lib/ga4.ts`, `..._ga4_raw_data.sql`) — web-analytics traffic
  signal (session growth + channel concentration), **not** an ad feed (no
  spend/ROAS). Pulls full property history; the data page has a year filter.
- **Bank statements** (`..._bank_statements.sql` + `..._bank_statements_storage.sql`)
  and **P&L upload** (`..._pl_upload.sql`) — verified-financials inputs.

### Scoring & confidence updates (`src/lib/analytics.ts`)
- **Marketing Efficiency & Stability** (dim 3) now uses real per-platform
  ROAS + spend-stability when any ad feed is connected (`adSpendVerified`),
  falling back to the repeat-rate proxy otherwise.
- **Growth Trajectory** (dim 8) folds in GA4 session growth only when ≥6 months
  of history exist; **Platform & Channel Risk** (dim 9) scores GA4 traffic-channel
  concentration when a real channel mix is present.
- **Data Confidence** gains +10 each for a verified ad feed, a connected GA4
  property, bank statements on file, and a P&L on file (still capped at 95).

## 2026-06 — Deterministic engine, raw data store & on-demand reports

### Sync and reporting are now decoupled
- **Connecting a store no longer auto-generates a report.** It only
  authenticates, pulls, stores raw data, and confirms (counts only — no score or
  valuation on the success screen).
- New server fn `syncShopifyStoreFn` (`src/lib/shopify.ts`) pulls **all history**
  (orders capped ~5k, products ~2k, customers ~5k) via cursor pagination. Real
  credential failures now throw real errors; the sandbox path is reserved for
  explicit `*test/demo/sandbox*` creds.

### Numbers are deterministic — AI is cosmetic only
- New deterministic engine `src/lib/analytics.ts` computes metrics, the 9-dimension
  exit score, valuation, risks and actions from the **full** raw dataset (real line
  items). Same data → same numbers, fully auditable.
- **Removed Gemini from every numeric path.** Gemini (`src/lib/ai.ts`,
  `enrichRiskCopyFn`) now only polishes the _prose_ of risk/action copy and is
  optional. Removed `VITE_GEMINI_API_KEY` (browser-leak risk); the key is
  server-only via `process.env.GEMINI_API_KEY`.
- Reports run **on demand** via `useReport` (`run()` / "Re-compute") on the four
  result pages, which now render **real computed values** (no more `mock.ts`).

### Raw data store + Store Data page
- New migration `20260606000000_shopify_raw_data.sql`: `shopify_stores`,
  `shopify_orders`, `shopify_products`, `shopify_customers` (all RLS-protected,
  idempotent upserts) + new `valuation_data` columns. Applied live.
- New page `/store-data` displays everything pulled (orders / products /
  customers / store metadata) with **Sync now** + auto-stale (>6h) refresh.
- Sidebar **Data Sources** is now an always-expanded parent: **Connections** +
  **Store Data**.
- Raw data is cached in `localStorage` (`exitecom_shopify_raw_v1`) for instant
  paint and zero-network warm loads. The Admin API token is **never** cached — it
  is lazily re-fetched from `shopify_stores` at sync time.
- Fixed a spurious "Failed to load live backend data" toast on login: raw-data
  loading is isolated in its own try/catch that degrades silently.

## 2026-06 — Auth, real data & cleanup

### Email OTP sign-up
- Sign-up now verifies the account with a **6-digit code emailed to the user** (instead of a magic link), then enters onboarding with a real session.
- Added a "Verify your email" code screen with **Resend** and **Use a different email**.
- Mounted global toast notifications (success / error / warning) — the app now gives feedback on every auth/onboarding action.
- Supabase config (dashboard/API): custom SMTP enabled, email OTP length set to 6, "Confirm signup" template sends `{{ .Token }}`.

### Real data only (no dummy/placeholder)
- New migration so sign-up seeds **only a user profile** — no more fake "NovaSkin Co." business/valuation/connections.
- Onboarding now **saves the user's answers to Supabase** (business profile) instead of faking it.
- Onboarding "Connect Data" step is **info-only** (Shopify + "Coming soon"); removed the fake "Connected" toggles.
- **Profile** page reads/saves the user's real Supabase data.
- Removed the mock-data fallback from the data layer; empty state is shown until real data exists.
- **Dashboard + all result pages are gated** behind "Connect Shopify" until a store is connected.
- Migration applied live to the hosted Supabase project.
- Doc: `docs/DATA-DISPLAY.md` (data contract + how/where results are shown).

### Data Sources page
- **Shopify** is the only active integration; everything else shows a **"COMING SOON"** badge.

### Cleanup & docs
- Removed the marketing landing page — `/` now redirects to `/signup`.
- Fixed all TypeScript errors and lint issues; removed dead assets and an unused component.
- Added `README.md`, `docs/ARCHITECTURE.md`, and `.env.example`.

## Known follow-ups
- [ ] Add an **auth guard** so `/*` and `/onboarding` redirect to `/login` when not signed in.
- [ ] Wire each gated result page to **real Shopify-derived data** when Shopify Connect is built (see `docs/DATA-DISPLAY.md` TODO list).
- [ ] Consider a transactional email provider (e.g. Resend) so emails send from `otp@exitecom.com` rather than the Gmail account.
