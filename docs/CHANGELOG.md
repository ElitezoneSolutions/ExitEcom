# Changes log

A simplified list of changes made to ExitEcom. Newest first.

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
- [ ] Add an **auth guard** so `/app/*` and `/onboarding` redirect to `/login` when not signed in.
- [ ] Wire each gated result page to **real Shopify-derived data** when Shopify Connect is built (see `docs/DATA-DISPLAY.md` TODO list).
- [ ] Consider a transactional email provider (e.g. Resend) so emails send from `otp@exitecom.com` rather than the Gmail account.
