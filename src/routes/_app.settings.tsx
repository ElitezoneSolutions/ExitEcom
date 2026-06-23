import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { Field } from "./signup";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

const tabs = ["Profile", "Notifications", "Integrations", "Security"] as const;
type Tab = (typeof tabs)[number];

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "JPY", "INR"] as const;

// The notification toggles surfaced to the user, keyed by the jsonb field we
// persist them under in profiles.notification_prefs.
const NOTIFICATION_FIELDS = [
  { key: "exit_score", label: "Exit Score updates" },
  { key: "new_risk", label: "New risk detected" },
  { key: "valuation_change", label: "Valuation changes" },
  { key: "weekly_summary", label: "Weekly summary" },
] as const;

type NotificationPrefs = Record<string, boolean>;

const DEFAULT_PREFS: NotificationPrefs = {
  exit_score: true,
  new_risk: true,
  valuation_change: true,
  weekly_summary: true,
};

function Settings() {
  const [tab, setTab] = useState<Tab>("Profile");
  // IDs for aria-controls / aria-labelledby wiring
  const panelId = "settings-panel";
  const tabId = (t: Tab) => `settings-tab-${t.toLowerCase()}`;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your account details, notification preferences, and security."
      />

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="border-b border-[var(--border-warm)] flex gap-1"
      >
        {tabs.map((t) => (
          <button
            key={t}
            id={tabId(t)}
            role="tab"
            aria-selected={tab === t}
            aria-controls={panelId}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              // Arrow-key navigation between tabs (ARIA tabs pattern)
              const idx = tabs.indexOf(t);
              if (e.key === "ArrowRight") {
                const next = tabs[(idx + 1) % tabs.length];
                setTab(next);
                document.getElementById(tabId(next))?.focus();
              }
              if (e.key === "ArrowLeft") {
                const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
                setTab(prev);
                document.getElementById(tabId(prev))?.focus();
              }
            }}
            tabIndex={tab === t ? 0 : -1}
            className={`pb-3 px-1 text-sm relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-sm ${
              tab === t
                ? "text-[var(--text-primary)] font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t}
            {tab === t && (
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-[var(--accent)]"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab panel */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="mt-8 card-light p-4 sm:p-8 max-w-2xl"
      >
        {tab === "Profile" && <ProfileTab />}
        {tab === "Notifications" && <NotificationsTab />}
        {tab === "Integrations" && <IntegrationsTab />}
        {tab === "Security" && <SecurityTab />}
      </div>
    </>
  );
}

// --- Profile -----------------------------------------------------------------

function ProfileTab() {
  const { user, isDemoMode } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track original email so we can detect a change and show the confirmation note
  const originalEmail = useRef<string>("");

  useEffect(() => {
    let active = true;
    async function load() {
      const metaName =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined) ??
        "";
      if (active) {
        setFullName(metaName);
        const initialEmail = user?.email ?? "";
        setEmail(initialEmail);
        originalEmail.current = initialEmail;
      }

      if (isSupabaseConfigured && user) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, timezone, currency")
          .eq("id", user.id)
          .maybeSingle();
        if (active && data) {
          if (data.full_name) setFullName(data.full_name);
          setTimezone(data.timezone ?? "");
          setCurrency(data.currency ?? "");
        }
      }
      if (active) setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [user, isDemoMode]);

  const emailChanged = email.trim() !== originalEmail.current;

  async function save() {
    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    setSaving(true);
    try {
      if (!isSupabaseConfigured || !user) {
        toast.success("Profile saved (Demo Mode — not persisted).");
        return;
      }

      // Keep the auth user_metadata in sync — `full_name` there is what the rest
      // of the app reads for the owner's name. Update the email only if changed
      // (Supabase sends a confirmation link before it takes effect).
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
        ...(emailChanged ? { email: email.trim() } : {}),
      });
      if (authErr) throw authErr;

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name: fullName.trim(),
          timezone: timezone || null,
          currency: currency || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (profileErr) throw profileErr;

      if (emailChanged) {
        // Optimistically reset — actual address only changes after confirmation
        originalEmail.current = email.trim();
        toast.success(
          "Profile saved. Check your inbox to confirm the new email address.",
        );
      } else {
        toast.success("Profile saved.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <p className="text-sm text-[var(--text-muted)]" role="status">
        Loading…
      </p>
    );

  return (
    <div className="space-y-4">
      <Field
        label="Full Name"
        type="text"
        value={fullName}
        onChange={setFullName}
        disabled={saving}
        required={false}
      />
      <div>
        <Field
          label="Email Address"
          type="email"
          value={email}
          onChange={setEmail}
          disabled={saving}
          required={false}
        />
        {emailChanged && (
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            A confirmation link will be sent to the new address before it takes
            effect.
          </p>
        )}
      </div>
      <SelectField
        label="Timezone"
        value={timezone}
        onChange={setTimezone}
        disabled={saving}
      >
        <option value="">Not set</option>
        {TIMEZONES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Currency"
        value={currency}
        onChange={setCurrency}
        disabled={saving}
      >
        <option value="">Not set</option>
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
      <button
        onClick={save}
        disabled={saving}
        className="btn-primary mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

// --- Notifications -----------------------------------------------------------

function NotificationsTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (isSupabaseConfigured && user) {
        const { data } = await supabase
          .from("profiles")
          .select("notification_prefs")
          .eq("id", user.id)
          .maybeSingle();
        if (active && data?.notification_prefs) {
          setPrefs({
            ...DEFAULT_PREFS,
            ...(data.notification_prefs as NotificationPrefs),
          });
        }
      }
      if (active) setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [user]);

  async function save() {
    setSaving(true);
    try {
      if (!isSupabaseConfigured || !user) {
        toast.success("Preferences saved (Demo Mode — not persisted).");
        return;
      }
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          notification_prefs: prefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      toast.success("Notification preferences saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <p className="text-sm text-[var(--text-muted)]" role="status">
        Loading…
      </p>
    );

  return (
    <fieldset disabled={saving} className="space-y-0 border-0 p-0 m-0">
      <legend className="sr-only">Notification preferences</legend>
      <div className="divide-y divide-[var(--border-warm)]">
        {NOTIFICATION_FIELDS.map(({ key, label }) => {
          const inputId = `notif-${key}`;
          return (
            <div
              key={key}
              className="flex items-center justify-between py-3 text-sm"
            >
              <label
                htmlFor={inputId}
                className="flex-1 cursor-pointer text-[var(--text-primary)]"
              >
                {label}
              </label>
              <input
                id={inputId}
                type="checkbox"
                checked={prefs[key] ?? false}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, [key]: e.target.checked }))
                }
                className="accent-[var(--accent)] w-4 h-4 cursor-pointer"
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn-primary mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </fieldset>
  );
}

// --- Integrations ------------------------------------------------------------

function IntegrationsTab() {
  return (
    <div className="space-y-4 text-sm text-[var(--text-secondary)]">
      <p>
        Connect, refresh and disconnect your data sources (Shopify, Meta,
        Google, TikTok, Snapchat, GA4) from the Data Sources page.
      </p>
      <Link to="/data-sources" className="btn-ghost-light inline-flex">
        Manage Data Sources
      </Link>
    </div>
  );
}

// --- Security ----------------------------------------------------------------

function SecurityTab() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // The first field in the open form — focus it when the form opens
  const firstFieldRef = useRef<HTMLDivElement>(null);
  // The trigger button — return focus here when the form closes
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Detect whether this account uses a password provider (vs. Google-only).
  // Supabase populates `user.identities` with one entry per auth method.
  const hasPasswordProvider = user?.identities?.some(
    (id) => id.provider === "email",
  );
  const isGoogleOnly =
    user !== null && user?.identities !== undefined && !hasPasswordProvider;

  function openForm() {
    setOpen(true);
    // Defer focus until after the form renders
    setTimeout(() => {
      firstFieldRef.current?.querySelector("input")?.focus();
    }, 0);
  }

  function reset() {
    setOpen(false);
    setPassword("");
    setConfirm("");
    // Return focus to the trigger
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  }

  async function changePassword() {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      if (!isSupabaseConfigured || !user) {
        toast.success("Password updated (Demo Mode — not persisted).");
        reset();
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated.");
      reset();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 text-sm">
      {isGoogleOnly ? (
        <div className="rounded-md bg-[var(--bg-secondary)] border border-[var(--border-warm)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Your account uses Google Sign-In. Password management is handled by
          Google — you cannot set a separate ExitEcom password.
        </div>
      ) : !open ? (
        <button ref={triggerRef} onClick={openForm} className="btn-ghost-light">
          Change Password
        </button>
      ) : (
        <div className="space-y-4">
          <div ref={firstFieldRef}>
            <Field
              label="New Password"
              type="password"
              value={password}
              onChange={setPassword}
              disabled={saving}
              required={false}
            />
          </div>
          <Field
            label="Confirm New Password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            disabled={saving}
            required={false}
          />
          <p className="text-xs text-[var(--text-muted)]">
            Must be at least 8 characters.
          </p>
          <div className="flex gap-3">
            <button
              onClick={changePassword}
              disabled={saving}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Updating…" : "Update Password"}
            </button>
            <button onClick={reset} className="btn-ghost-light">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- shared ------------------------------------------------------------------

// A <select> styled to match the signin page's Field inputs.
function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-caps">{label}</span>
      <div className="relative mt-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full appearance-none !bg-transparent border rounded-md pl-3.5 pr-10 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none transition-colors border-[var(--border-warm)] focus:border-[var(--accent)] disabled:opacity-50"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </label>
  );
}
