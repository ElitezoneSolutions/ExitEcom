# Report approvals

Every computed result now goes through the team before the founder sees it.
This document covers the whole path: submission, review, editing, approval,
publishing and the notification email.

> **Deployment:** this feature needs a migration pushed to the hosted Supabase
> project **and** an Edge Function deployed. See [§8](#8-deploying-it) — neither
> happens by committing code.

---

## 1. What changed

Before, clicking "Run" on a tool page computed the result and published it
immediately. Now:

```
Founder clicks Run
      │
      ├─ computeFullReport() runs client-side, exactly as before
      │
      ├─ the result is INSERTED into report_requests as 'pending'
      │     (nothing is written to valuation_data / risks / actions)
      │
      ▼
Founder sees "We're processing your request — you'll get an email"
      │
      │        ┌──────────────────────────────────────────┐
      └───────▶│  /admin/requests — the team reviews it   │
               │  read everything · edit anything         │
               └───────────────┬──────────────────────────┘
                     approve   │   reject
                               │
      ┌────────────────────────┴──────────────┐
      ▼                                       ▼
publish the tool's slice                 status = rejected
email the founder                        founder sees the note
status = approved                        and can submit again
```

The engine itself is untouched. Approval is a gate in front of publication, not
a change to how anything is computed.

---

## 2. One request per tool

The four tools are approved **independently**: a founder can have an approved
valuation while their risk scan is still in review.

| Tool id | Page | Name |
|---|---|---|
| `exit-score` | `/exit-score` | Exit Readiness Score |
| `risk` | `/risk-scanner` | Risk Scanner |
| `valuation` | `/valuation` | Valuation Engine |
| `optimization` | `/optimization` | Optimization Plan |

`full` is deliberately **not** an approvable tool — the Full Report is a view
over the other four, so it unlocks only once all four are approved. Otherwise it
would hand a buyer a document containing an unreviewed risk register. See
`toolsForReport()`.

**A wrinkle worth knowing.** One run of any tool calls `computeFullReport()`,
which produces score, valuation, risks and actions together — so every request
carries the whole payload even though only one tool's slice is published on
approval. That's why `/reports` submits all four at once ("Generate Reports")
while a tool page submits only its own.

---

## 3. The frozen payload

`report_requests.payload` is the full `computeFullReport()` output **as computed
at submit time**, and it is never recomputed.

That's deliberate. If the document were re-derived at approval time, a Shopify
sync between submission and review would silently move the numbers, and the team
would approve something they never saw. Freezing means what is approved is
exactly what was reviewed.

It also means an approved result is a snapshot. Re-running a tool creates a new
pending request; the founder keeps seeing the previously approved result only
until the new one supersedes it as the latest request for that tool.

---

## 4. The override layer

An admin can edit **anything** — any figure, any line of copy — before
approving. Edits are stored as a sparse patch in `report_requests.overrides`,
never by mutating `payload`:

```ts
{
  score:     { exitScore: 71 },
  valuation: { fairMarket: 120000 },
  risks:     { "0": { description: "…", hidden: true } },
  actions:   { "2": { uplift: 5000 } }
}
```

`applyOverrides(payload, overrides)` in `src/lib/reportRequests.ts` produces the
published result. It is pure, never mutates its arguments, and is the single
definition of "approved with edits" shared by the founder-facing pages, the
admin server functions and the tests.

Three properties this buys:

1. **The engine's original output is always recoverable.** Auditable determinism
   survives — a published figure that differs from the engine can be identified
   as such and traced.
2. **A diff is trivial.** `overrideDiff()` produces before/after pairs, shown in
   the admin's "Changes" panel and written into `admin_audit_log` on approval.
3. **An untouched request publishes byte-identical deterministic output.**

Details that matter:

- **Arrays are patched by index.** Editing risk 1 doesn't restate the others. An
  override never reorders, adds or removes items — only `hidden` suppresses one.
- **Hidden items are removed, not blanked**, so a suppressed risk can't publish
  as an empty row in a buyer-facing document.
- **Score and valuation edits flow into `businessUpdate`**, which is what reaches
  `valuation_data`. Without that, a corrected exit score would show on the report
  and the engine's original on the dashboard.
- **Clearing a field clears the override** rather than writing an empty string,
  so "unedited" and "edited to blank" stay distinguishable.
- **Typing a value back to the engine's own value isn't an edit** and doesn't
  reach the audit log.

---

## 5. Publishing

On approval, `publishToolResult()` writes into the tables the app already reads —
**scoped to the approving tool**:

| Tool | Writes |
|---|---|
| `exit-score` | `valuation_data`: exit score, tier, breakdown, data confidence |
| `valuation` | `valuation_data`: every valuation/multiple column |
| `risk` | `valuation_data`: risk score, value lost — plus the `risks` rows |
| `optimization` | the `actions` rows |

Base metrics (revenue, AOV, repeat rate, ROAS, top-product share) are written on
**every** approval: they're measurements of the store, not the output of a tool.

The scoping is the point. Approving a valuation must not publish an unreviewed
risk register as a side effect of the shared payload.

---

## 6. What the founder sees

| State | Page shows |
|---|---|
| Never run | The existing Run card, now noting the result is reviewed first |
| `pending` | `PendingReviewCard` — "We're processing your request", plus when they submitted |
| `rejected` | `RejectedReviewCard` — the admin's note and a "Submit again" button |
| `approved` | The result, rendered from the approved snapshot |

The pending card deliberately claims nothing about queue position, reviewer or
turnaround time — we don't know any of those, and inventing them would be the
same sin as placeholder data.

A rejection **requires** a note; the admin UI refuses to submit without one,
because that note is the entire explanation the founder receives.

---

## 7. The email

Sent by a **Supabase Edge Function**, `supabase/functions/notify-report-ready`,
invoked with the service role from the approve handler. The function owns the
SMTP credentials, so nothing about mail delivery lives in this app's environment.

Email is **best-effort and never blocks approval**. If SMTP is unconfigured or
delivery fails:

- the result is still approved and visible in the app,
- `notified_at` stays null,
- the admin sees "Approved — but the email didn't send",
- the queue row shows a struck-through mail icon.

An approved result the founder can see but wasn't emailed about is a much better
failure than an approval that rolls back because a mail server was down.

---

## 8. Deploying it

Committing this code changes nothing in production on its own. Three steps:

**1. Push the migration to the hosted project.**

```bash
supabase db push
```

Adds `report_requests` with RLS. Until this runs, submitting a run will fail.

**2. Deploy the Edge Function.**

```bash
supabase functions deploy notify-report-ready
```

**3. Give the function SMTP credentials.**

These are the same credentials configured for your project's auth emails, but
Supabase does **not** expose those to Edge Functions automatically — they have to
be set as function secrets:

```bash
supabase secrets set \
  SMTP_HOST=smtp.example.com \
  SMTP_PORT=465 \
  SMTP_USER=... \
  SMTP_PASS=... \
  SMTP_FROM="ExitEcom <notifications@exitecom.com>"
```

Optionally set `APP_URL` in the **app's** server environment (defaults to
`https://dash.exitecom.com`) — it's the base for the link in the email.

---

## 9. Security

- **Founders can insert only pending rows, for a business they own.** The insert
  policy checks `auth.uid() = owner_id`, `status = 'pending'` and business
  ownership. Without the status check, a crafted insert could publish an
  approved result without review.
- **Founders have no update or delete policy at all.** They cannot approve their
  own request, edit a frozen payload, or delete an awkward one.
- Every review mutation goes through the service role behind
  `requireSuperadmin()`, exactly like the rest of `src/lib/admin/`.
- **A reviewed request is final.** Approve/reject/edit all reject a row that
  isn't `pending`, which guards a double-click and two reviewers racing. To
  change a published result, the founder re-runs the tool.
- Approvals, rejections and saved edits are all written to `admin_audit_log`,
  approvals carrying the full change list.

---

## 10. Files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260812000000_report_approvals.sql` | The table and its RLS |
| `src/lib/reportRequests.ts` | Shared types, `applyOverrides`, `overrideDiff`, `toolsForReport` |
| `src/lib/reportRequests.test.ts` | 18 tests over the override logic |
| `src/hooks/useReportRequests.tsx` | Founder-side reads and submission (anon client, RLS) |
| `src/hooks/useReport.ts` | Per-tool status; `report` is now the approved snapshot |
| `src/components/ex/ReviewStateCard.tsx` | Pending and rejected states |
| `src/lib/admin/reportRequests.ts` | Queue, detail, edit, approve/reject, publish, notify |
| `src/routes/_app.admin.requests.tsx` | The review queue and the editor |
| `supabase/functions/notify-report-ready/index.ts` | The email (Deno, deployed separately) |
