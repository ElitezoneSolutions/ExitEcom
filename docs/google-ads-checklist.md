# Google Ads connector — go-live checklist

The connector is multi-tenant by design: one developer token (yours) for the whole
app, plus a per-user OAuth flow so each customer connects **their own** Google Ads
account. Their account hierarchy is discovered automatically at connect time and
the right `login-customer-id` is stored per connection — you configure nothing
per-user. See `docs/google-ads-setup.md` for the one-time app/credential setup.

Before the public can connect their own accounts, you must clear **two independent
Google approval gates**. They run in parallel; start both early.

---

## Gate 1 — Developer token: get **Basic access**

Identifies *your application* to the Google Ads API. Shared by every user; it does
**not** grant access to any account by itself.

| Access level | What it can read | Use |

| **Test** (default for a new token) | only *test* accounts | building / sandbox only |
| **Basic** | live accounts, ~15,000 operations/day | launch for a small/medium SaaS |
| **Standard** | live accounts, high limits | apply later if you outgrow Basic |

Steps:
1. Sign in to your **Google Ads Manager (MCC)** account → **Tools → API Center**.
2. Confirm the **developer token** there matches `GOOGLE_ADS_DEVELOPER_TOKEN`.
3. Check the **Access level**. If it says **Test**, click **Apply for Basic access**
   and complete the API access application (this is the form with the design-doc /
   campaign-types questions; the design doc is `docs/ExitEcom-Google-Ads-API-Design-Documentation.rtf`).
4. Wait for Google's approval email. Until then, live accounts return
   `DEVELOPER_TOKEN_NOT_APPROVED` — use the `demo` sandbox to keep building.

**Done when:** API Center shows **Basic access — Approved**.

---

## Gate 2 — OAuth consent screen: **Publish + verify**

Controls *who* is allowed to sign in. The `https://www.googleapis.com/auth/adwords`
scope is **sensitive**, so Google gates public access behind verification.

In **Google Cloud Console → APIs & Services → OAuth consent screen**:

| Publishing status | Who can connect |

| **Testing** (default) | only the **Test users** you add manually (max 100) |
| **In production** (verification pending) | still limited until verification completes |
| **In production + verified** | anyone with a Google Ads account |

Steps:
1. **User type: External.**
2. Fill in the app info Google checks during verification:
   - App name, support email, app logo.
   - **Authorized domain:** `exitecom.com`.
   - **App homepage:** `https://dash.exitecom.com`
   - **Privacy policy:** `https://dash.exitecom.com/privacy`
   - **Terms of service:** `https://dash.exitecom.com/terms`
   - (Data deletion: `https://dash.exitecom.com/data-deletion`)
3. **Scopes:** add `https://www.googleapis.com/auth/adwords` and nothing you don't
   need (extra scopes slow verification).
4. **To test before launch:** keep status **Testing** and add your own Google
   account under **Test users** — then you can connect a real account you have
   access to (still subject to Gate 1).
5. **To go public:** click **Publish app**, then **Prepare for verification** and
   submit. Google reviews brand + domain ownership + the sensitive scope. This
   typically takes from a few days to a few weeks.

**Done when:** publishing status is **In production** and verification is approved.

---

## Combined readiness

| | Test account / `demo` sandbox | Your own real account | Any public user |

| Token = Test, screen = Testing | ✅ | ❌ | ❌ |
| Token = Basic, screen = Testing (you're a test user) | ✅ | ✅ | ❌ |
| Token = Basic, screen = Published + verified | ✅ | ✅ | ✅ |

So: **both gates green → real third-party users can self-serve connect.**

---

## Pre-submit checklist

- [ ] `GOOGLE_ADS_CLIENT_ID` / `_SECRET` / `_DEVELOPER_TOKEN` / `GOOGLE_OAUTH_REDIRECT_URI`
      set in the production host (Vercel), server-side (no `VITE_` prefix).
- [ ] Authorized redirect URI in Google Cloud = `https://dash.exitecom.com/google-oauth-callback` (exact).
- [ ] `/privacy`, `/terms`, `/data-deletion` reachable in production.
- [ ] Latest connector code deployed (per-connection `login-customer-id` + specific
      error parsing).
- [ ] Developer token application submitted (Gate 1).
- [ ] OAuth consent screen submitted for verification (Gate 2).
- [ ] Replace the placeholder `privacy@exitecom.com` with the real contact address
      across `privacy.tsx`, `terms.tsx`, `data-deletion.tsx`, and the design doc.

## While you wait

The connector stays fully usable: the OAuth tab works for **test users on test
accounts**, and the **`demo` sandbox** (connect with a customer id containing
`demo`) renders the entire data view + Exit Score so you can build and demo the
product without either approval.
