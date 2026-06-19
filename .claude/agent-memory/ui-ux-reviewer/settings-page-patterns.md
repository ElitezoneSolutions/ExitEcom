---
name: settings-page-patterns
description: Patterns established in the settings page rewrite (2026-06-19): ARIA tabs, focus management, Google-only account detection
metadata:
  type: project
---

## File
`src/routes/_app.settings.tsx`

## ARIA tabs pattern
The tab bar uses `role="tablist"` with `aria-label`. Each tab button has `role="tab"`, `aria-selected`, `aria-controls={panelId}`, and `tabIndex={active ? 0 : -1}`. Arrow-key navigation is implemented via `onKeyDown` (ArrowRight/ArrowLeft wraps around). The panel div has `role="tabpanel"` and `aria-labelledby={tabId(activeTab)}`.

**Why:** Keyboard and screen-reader users expect ARIA tabs semantics; without them Tab key and arrow keys do not work correctly.

## Focus management for reveal/hide patterns
When a form opens (e.g. change-password), `setTimeout(() => firstFieldRef.current?.querySelector("input")?.focus(), 0)` moves focus in.  
When it closes (Cancel), `setTimeout(() => triggerRef.current?.focus(), 0)` returns focus to the trigger.

## Google-only account detection
`user?.identities?.some((id) => id.provider === "email")` determines if the account has a password. If `identities` is non-null and no email provider exists, the account is Google-only. Show an informational message instead of the change-password form.

```tsx
const hasPasswordProvider = user?.identities?.some((id) => id.provider === "email");
const isGoogleOnly = user !== null && user?.identities !== undefined && !hasPasswordProvider;
```

## Email-change confirmation inline hint
Track `originalEmail.current` (a `useRef`) set once on load. Compute `emailChanged = email.trim() !== originalEmail.current`. Show a `<p>` hint below the email field when `emailChanged` is true: "A confirmation link will be sent to the new address before it takes effect." Reset `originalEmail.current` after a successful save.

## Notification checkboxes
Use `fieldset`/`legend` (legend is sr-only) + `disabled={saving}` on the fieldset to disable all inputs at once. Each row is a plain div; the `<label>` has `htmlFor={inputId}` and the `<input>` has `id={inputId}`. Use `divide-y divide-[var(--border-warm)]` on the container instead of `border-b` on each row (avoids a trailing border on the last item).

## SelectField disabled prop
`SelectField` now accepts and passes through `disabled` so it grays out during save operations, consistent with `Field`.
