---
name: state-handling-conventions
description: Loading, empty, gated, and error state patterns used across the ExitEcom app
metadata:
  type: reference
---

## Loading states
- Full-page loading: centered `<RefreshCw animate-spin>` + `<p>Loading…</p>` inside `min-h-[400px] flex flex-col items-center justify-center gap-4`
- Inline/small loading: `<p role="status" className="text-sm text-[var(--text-muted)]">Loading…</p>`
- Button submitting: `disabled={saving}` + `className="... disabled:opacity-50 disabled:cursor-not-allowed"` + text switches to "Saving…" / "Updating…"

## Gated (Shopify not connected) state
`<ConnectShopifyGate title="..." feature="..." />` from `src/components/ex/ConnectShopifyGate.tsx`. Use for any page that requires Shopify data.

## Empty state
Inline contextual empty copy inside the same layout shell (no blank page). Example: Dashboard shows feature launcher cards when no report has been run.

## Error states
`toast.error(err instanceof Error ? err.message : "Fallback message.")` — always use the real error message from Supabase/API, never swallow silently.

## No dummy data rule
All data-bearing UI must handle real-data, empty, gated, loading, and error states. Hardcoded strings that imply live data (e.g. "No active sessions other than this device") are a defect — replace with either a real fetch or an honest "not available" note.

## Demo mode pattern
`isSupabaseConfigured` (from `src/lib/supabase`) is false in demo mode. Guard server calls behind `if (!isSupabaseConfigured || !user) { toast.success("... (Demo Mode — not persisted)."); return; }`.
