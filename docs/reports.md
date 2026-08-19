# Reports

Everything about the Reports feature: what a report is, how one is generated,
what each report contains, how the PDF export works, and how to change any of it
safely.

> **Related:** [`report-calculations.md`](report-calculations.md) explains how
> every individual figure is computed. This document covers the _documents_ —
> how those figures are assembled, sliced and presented. If you're asking "where
> does EBITDA come from?", read that one; if you're asking "why is Marketing
> missing from my PDF?", read this one.

---

## 1. What a report is

A report is a **buyer-grade document rendered live from the deterministic
engine**. It is not a stored file, not a snapshot, and not an export format —
it's the same `computeFullReport()` result you see on `/exit-score`,
`/valuation`, `/risk-scanner` and `/optimization`, laid out as a document a
founder can hand to a broker or an acquirer.

Three properties follow from that, and they're the point of the whole design:

1. **Figures can't disagree.** Reports don't compute anything. Every number is
   read straight off one `FullReport` object, so a valuation on the Full Report
   is the same valuation on the Valuation Engine report and on `/valuation`.
2. **Nothing is stored, so nothing goes stale.** There is no `reports` table.
   Opening a report recomputes it from the raw data already in your account.
   Re-syncing Shopify changes the next report you open, with no cache to bust.
3. **The PDF is the screen.** Export is browser print-to-PDF of the same DOM, so
   the exported document cannot drift from what the founder reviewed.

There are **five** reports. Four are per-tool; the fifth contains everything.

| Report               | Id             | What it's for                                                            |
| -------------------- | -------------- | ------------------------------------------------------------------------ |
| Exit Readiness Score | `exit-score`   | How the business scores across all nine dimensions, and what drives each |
| Valuation Engine     | `valuation`    | What it's worth now and after optimization, with the full earnings basis |
| Risk Scanner         | `risk`         | Every risk diligence will surface, and its modelled valuation impact     |
| Optimization Plan    | `optimization` | Prioritised actions that close the value gap, with steps and £ uplift    |
| Full Report          | `full`         | All thirteen sections as one document                                    |

---

## 2. The files

| File                                        | Responsibility                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `src/routes/_app.reports.tsx`               | The page: gating, the picker, chrome, the sticky contents nav             |
| `src/lib/reportSections.ts`                 | **Single source of truth** for which sections each report contains        |
| `src/components/ex/ReportDocument.tsx`      | The document itself — every section's markup, the cover, colophon         |
| `src/lib/reportSections.test.ts`            | Locks the slicing, numbering and availability rules (8 tests)             |
| `src/components/ex/ReportDocument.test.tsx` | Renders all five reports from a real `computeFullReport` result (5 tests) |
| `src/styles.css`                            | All `report-*` classes plus the `@media print` block                      |
| `src/hooks/useReport.ts`                    | Assembles the analytics input and runs `computeFullReport()`              |
| `src/components/ex/Sidebar.tsx`             | The Reports nav parent and its five deep-linked children                  |

Nothing else needs to know a report exists.

---

## 3. How generation works

```
Shopify + optional ad/GA4 feeds + uploaded docs   (raw rows, RLS tables)
                          │
                useReport() builds AnalyticsInput
                          │
                computeFullReport(input)          ← src/lib/analytics.ts
                { metrics, score, valuation, risks, actions, businessUpdate }
                          │
        reportSections(report, type)  ─── which sections, in what order
                          │
                <ReportDocument report=… type=… />
                          │
              screen  ──────────────  window.print()  ──▶  PDF
```

### Gating — three states before a document appears

`/reports` renders one of three things, in this order:

1. **Not connected to Shopify** → `ConnectShopifyGate`. Nothing can be computed
   without an order feed.
2. **Connected but never run** → `RunReportCard`. Reports are on-demand; one
   click computes all five, because they're slices of one result.
3. **Run** → the picker, then the chosen document.

"Has run" is `business.exitScore > 0 || risks.length > 0` (`useReport`), i.e.
whether a computed result was ever persisted for this business.

### Recompute

`RecomputeButton` re-runs `computeFullReport()` and re-persists
`businessUpdate` / `risks` / `actions` via `saveComputedReport()`. It's shown on
both the picker and inside an open report.

### `generatedAt`

Stamped **once per mount** (`useState(() => new Date())`) so the cover, colophon
and footer all carry the same date, and it doesn't tick over mid-print.

---

## 4. Choosing a report

The picker is a grid of five cards, one per `REPORT_TYPES` entry, each showing
the report's name, description and its live section count for _this_ business
(so a card reads "8 sections" rather than "9" when GA4 isn't connected).

**Which report is open lives in the URL**, not in component state:

```
/reports              → the picker
/reports?report=risk  → the Risk Scanner document
```

This is what makes reports deep-linkable from the sidebar, bookmarkable, and
reload-safe. It's validated in the route:

```ts
validateSearch: (search: Record<string, unknown>) => {
  const requested = search.report;
  const valid = REPORT_TYPES.some((t) => t.id === requested);
  return { report: valid ? (requested as ReportTypeId) : undefined };
};
```

An unrecognised value falls back to the picker rather than erroring.

### Sidebar

The Reports nav parent generates its five children from `REPORT_TYPES`, so the
nav can't drift from the reports that exist. Two consequences worth knowing:

- All five children share the `/reports` pathname, so active-state matching is
  **search-aware** (`useIsActive` in `Sidebar.tsx`) — matching on pathname alone
  would highlight all five at once.
- The children only unfold while you're on `/reports` (the `collapsible: true`
  flag). Unlike Data Sources, these are five views of one page, not five pages.

---

## 5. Sections

Thirteen sections exist. Each report names the subset it wants, in the order it
wants them.

| Id            | Title                              | Appears in                    | Gated on              |
| ------------- | ---------------------------------- | ----------------------------- | --------------------- |
| `summary`     | Executive Summary                  | all five                      | —                     |
| `sources`     | Data Sources & Confidence          | all but optimization          | —                     |
| `overview`    | Business Overview                  | full, exit-score              | —                     |
| `financials`  | Financial Performance              | full, valuation               | —                     |
| `customers`   | Customers & Retention              | full, exit-score              | —                     |
| `products`    | Product Concentration              | full, exit-score              | —                     |
| `marketing`   | Marketing Efficiency               | full, exit-score              | **`adSpendVerified`** |
| `traffic`     | Traffic & Acquisition              | full, exit-score              | **`ga4Connected`**    |
| `score`       | Exit Readiness Score               | full, exit-score              | —                     |
| `valuation`   | Valuation                          | full, valuation, optimization | —                     |
| `risks`       | Risk Register                      | full, risk                    | —                     |
| `plan`        | Optimization Plan                  | full, optimization            | —                     |
| `methodology` | Methodology & Basis of Preparation | all five                      | —                     |

Every report **opens with `summary` and closes with `methodology`** — a test
enforces this, so a reader always gets the headline and the caveats regardless
of which document they were handed.

### Availability gating

Two sections depend on optional feeds:

```ts
function sectionAvailable(id: string, report: FullReport): boolean {
  if (id === "marketing") return report.metrics.adSpendVerified;
  if (id === "traffic") return report.metrics.ga4Connected;
  return true;
}
```

A gated-out section is **removed, not stubbed** — this is the no-dummy-data rule
applied to documents. A buyer must never see an empty Marketing table implying
zero spend. Where the absence changes how a figure should be read, the document
says so explicitly instead: with no ad platform connected, Data Sources states
that spend is a benchmark estimate and that ROAS cannot be stated.

### Numbering

Numbers are **computed, not fixed**:

```ts
.sections.filter((id) => sectionAvailable(id, report))
.map((id, i) => ({
  id,
  label: SECTION_TITLES[id],
  number: i + 1,
  title: `${i + 1}. ${SECTION_TITLES[id]}`,
}));
```

So numbering is always contiguous from 1 within whichever report you opened, and
sections close up when a gated one drops out. The Full Report is 13 sections
with everything connected, 11 with neither ad feed nor GA4.

Each section is handed out three ways because its consumers need different
things: `title` is numbered, for the contents list and the page's sticky nav;
`label` and `number` are separate, because the document puts the number in the
section eyebrow and the heading would otherwise carry it twice.

---

## 6. The document

`ReportDocument.tsx` writes each section's markup once into a
`Record<string, ReactNode>` called `bodies`, then renders whatever
`reportSections(report, type)` returns:

```tsx
{
  sections.map((s) => (
    <Section key={s.id} section={s}>
      {bodies[s.id]}
    </Section>
  ));
}
```

That's the load-bearing idea: **five reports, one implementation**. A section is
written once and appears in every report that names it, so two reports can't
present the same figure differently.

Structure of any report:

```
Cover        masthead (logo + exitecom.com), "ExitEcom | Confidential <report>",
             store name, industry · country · prepared date,
             hero panel: Exit Score /100 + tier, then a 4-figure strip
Contents     two-column linked table of contents (a <nav>, and it prints)
Sections     the slice for this report type, each under a "Section NN" eyebrow
Colophon     "Prepared by ExitEcom", generated-for line, domain, confidentiality
Footer       fixed running footer, print-only
```

**The hero owns the score.** The Exit Score and its tier are the hero panel on
every report, so `coverStats()` deliberately does _not_ repeat them — it returns
the four figures that _frame_ the score, and those are per-report: the Risk
Scanner leads with risks found and valuation at risk; the Valuation Engine with
the exit range and current multiple; Optimization with action count and total
uplift.

### Branding

Reports are ExitEcom documents wherever they end up, and they're meant to end up
in front of buyers and brokers. `exitecom.com` appears in three places — the
cover masthead, the colophon, and the running footer on **every printed page**.
The domain is a single constant, `BRAND_DOMAIN`, at the top of
`ReportDocument.tsx`.

The document has its own scoped palette — the `--rp-*` variables at the top of
the `.report-doc` block in `styles.css`, every one of them an alias onto an app
token. Filled panels (hero, executive verdict, table heads) carry the brand blue
`--accent`; headings on white stay `--text-primary` navy so dense tables don't
become a wall of accent colour; labels on a filled panel use `--blue-200`, which
brand blue itself is too dark to provide. Re-theming the document means editing
that one block, not hunting colours through the markup.

---

## 7. PDF export

The "Download PDF" button calls `window.print()`. There is no PDF library.

That was a deliberate trade: a library would let us control pagination precisely,
but it would mean maintaining a second rendering of every section — and the
moment those two renderings diverge, the founder reviews one document and the
buyer receives another. Print-to-PDF makes divergence impossible.

The `@media print` block in `src/styles.css` does the work:

| Rule                                                           | Why                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@page { size: A4; margin: 16mm 14mm }`                        | Page geometry                                                                                                                                                                                                                                      |
| `print-color-adjust: exact` on `*`                             | **Browsers strip background colours when printing unless told not to.** Without this the revenue bars, severity dots and the contents/note/stat panels print blank — anything coloured by `background-color` rather than `color` silently vanishes |
| `aside:not(.report-doc *), .report-chrome` hidden              | Removes app chrome. Deliberately **not** a blanket `nav` — the document's own contents page is a `<nav class="report-contents">` and must print                                                                                                    |
| `.grid:not(.report-doc *) { display: block }`                  | Collapses the page's sidebar/document columns without flattening grids _inside_ the document                                                                                                                                                       |
| `main`, `main > div` constraints removed                       | Lets the sheet span the page                                                                                                                                                                                                                       |
| `break-inside: avoid` on sections, items, tables, stats, notes | Stops a risk or a table splitting across pages                                                                                                                                                                                                     |
| `.report-print-footer` fixed to the bottom                     | The per-page running footer                                                                                                                                                                                                                        |

Two traps to remember if you touch this block:

- **Anything you hide with a broad selector may hide part of the document.** The
  `nav` bug above shipped once and silently removed the contents page from every
  PDF.
- **Colour is opt-in.** Any new element coloured by background needs the page to
  keep `print-color-adjust: exact`; remove it and the report loses its bars,
  dots and panels in export while still looking correct on screen.

`.report-chrome` is the marker class for screen-only furniture — the back
button, the page header with its buttons, and the sticky contents nav. Add it to
anything new that shouldn't print.

### The browser's own header/footer

Separately from our footer, the browser stamps the page title and the full URL
around every printed page. Left alone that reads
`https://dash.exitecom.com/reports?report=full` — internal routing detail, on a
document that goes to buyers.

It isn't reachable from CSS (it's browser chrome, not part of the document), so
`useCleanPrintUrl()` (`src/lib/printUrl.ts`) swaps the URL for the bare origin
on `beforeprint` and restores it on `afterprint`. It hooks the events rather
than the button, so Ctrl/Cmd-P behaves the same.

It calls the **native** `History.prototype.replaceState`, deliberately not
`window.history.replaceState` — TanStack Router patches history to track
navigation, and going through the patched method would tell the router we'd
navigated to `/`, unmounting the report mid-print.

The reader can still switch headers and footers off entirely in the print
dialog; this just makes the default acceptable.

### Known limitation

The running footer relies on `position: fixed` repeating on every printed page.
That's reliable in Chrome and Safari and less consistent in Firefox. Chrome's
print preview is the reference.

---

## 8. Adding or changing a report

**Add a section:**

1. Add its id + title to `SECTION_TITLES` in `reportSections.ts`.
2. Add its markup to `bodies` in `ReportDocument.tsx`, keyed by the same id.
3. Add the id to the `sections` array of every report that should include it.
4. If it depends on an optional feed, extend `sectionAvailable()`.

Numbering, the contents page and the sticky nav all follow automatically.

**Add a report:** add an entry to `REPORT_TYPES` and a matching `ReportTypeId`.
The picker card, the sidebar child, the route's `validateSearch` and the deep
link all derive from that array. Consider a `coverStats()` case too, or it falls
back to the Full Report's four.

**Rules to keep:**

- **Never compute in the document.** If a value isn't on `FullReport`, add it to
  the engine. A figure computed in `ReportDocument.tsx` is a figure that can
  disagree with the page it came from.
- **Never stub a section.** No data behind it → gate it out, or state plainly
  why it's unavailable.
- **Never route a number through an LLM.** There is no AI in this product at
  all, in the figures or the copy, and the Methodology section tells the reader
  so. Don't make that a lie.
- Keep `reportTypeById`'s fallback pointing at `"full"` by id, not by position —
  it used to return `REPORT_TYPES[0]` and silently became `exit-score` when the
  array was reordered.

---

## 9. Deliberate non-features

**No saved reports.** Nothing is persisted as a document. A report history would
need a new RLS-protected table and a migration pushed to hosted Supabase; the
current design recomputes from raw data instead, which means reports are always
current and there's no stale-snapshot problem. If saved snapshots are ever
wanted, they're a genuine feature with a migration, not a quick addition — and
"Saved Reports" must not appear in the nav before they exist. (It did once,
alongside a "Downloads" entry; both pointed at `/reports` and neither feature
existed.)

**No email/share links.** Export is print-to-PDF; the founder distributes it.

**No server-side rendering to PDF.** Same reasoning as the library: one
rendering, no drift.
