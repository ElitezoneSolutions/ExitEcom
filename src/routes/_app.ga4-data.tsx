import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  RefreshCw,
  Users,
  Target,
  BarChart3,
  TrendingUp,
  Lock,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { DisconnectButton } from "@/components/ex/DisconnectButton";
import { useBusinessData } from "@/hooks/useBusinessData";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ga4-data")({
  component: GA4Data,
});

const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

type Tab = "monthly" | "channels";

function GA4Data() {
  const {
    isGA4Connected,
    ga4Account,
    ga4Monthly,
    ga4Channels,
    ga4LastSyncedAt,
    canResyncGA4,
    resyncGA4,
    disconnectGA4,
    loading,
  } = useBusinessData();

  const [tab, setTab] = useState<Tab>("monthly");
  const [syncing, setSyncing] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const autoTried = useRef(false);

  // Years present in the synced monthly data, newest first.
  const years = useMemo(
    () =>
      Array.from(new Set(ga4Monthly.map((m) => m.month.slice(0, 4)))).sort(
        (a, b) => b.localeCompare(a),
      ),
    [ga4Monthly],
  );
  // Fall back to "all" if a previously-selected year is gone after a resync.
  const activeYear =
    yearFilter === "all" || years.includes(yearFilter) ? yearFilter : "all";
  const filteredMonthly = useMemo(
    () =>
      activeYear === "all"
        ? ga4Monthly
        : ga4Monthly.filter((m) => m.month.startsWith(activeYear)),
    [ga4Monthly, activeYear],
  );

  const money = useMemo(() => {
    const code = ga4Account?.currency || "USD";
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
    }
  }, [ga4Account?.currency]);

  const totals = useMemo(() => {
    const sessions = filteredMonthly.reduce((s, m) => s + m.sessions, 0);
    const conversions = filteredMonthly.reduce((s, m) => s + m.conversions, 0);
    const purchaseRevenue = filteredMonthly.reduce(
      (s, m) => s + m.purchaseRevenue,
      0,
    );
    const transactions = filteredMonthly.reduce(
      (s, m) => s + m.transactions,
      0,
    );
    return {
      sessions,
      conversions,
      purchaseRevenue,
      transactions,
      conversionRate: sessions > 0 ? conversions / sessions : 0,
    };
  }, [filteredMonthly]);

  // Session growth: trailing 3 months vs the prior 3 (matches the Exit Score's
  // growth-trajectory signal in src/lib/analytics.ts).
  const sessionGrowth = useMemo(() => {
    const sorted = [...filteredMonthly].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    if (sorted.length < 6) return null;
    const last3 = sorted.slice(-3).reduce((s, m) => s + m.sessions, 0);
    const prior3 = sorted.slice(-6, -3).reduce((s, m) => s + m.sessions, 0);
    return prior3 > 0 ? (last3 - prior3) / prior3 : null;
  }, [filteredMonthly]);

  const runResync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await resyncGA4();
      toast.success(
        `Synced: ${r.totals.sessions.toLocaleString()} sessions across ${r.channels.length} channels.`,
      );
    } catch (err) {
      toast.error(
        (err instanceof Error && err.message) ||
          "Could not refresh traffic data.",
      );
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (autoTried.current || loading || !canResyncGA4) return;
    autoTried.current = true;
    const stale =
      !ga4LastSyncedAt ||
      Date.now() - new Date(ga4LastSyncedAt).getTime() > STALE_MS;
    if (stale) runResync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canResyncGA4, ga4LastSyncedAt]);

  if (!isGA4Connected) {
    return (
      <>
        <PageHeader
          title="Google Analytics 4 Data"
          subtitle="We show buyers your traffic quality, conversion rate and channel diversification directly from your GA4 property. Connect GA4 to get started."
        />
        <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
            <Lock className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
            No traffic data yet
          </h2>
          <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
            Once your GA4 property is connected, we pull your sessions,
            conversions and traffic-channel mix to show your traffic quality and
            diversification. Nothing here is simulated — it is all built from
            your real Analytics property.
          </p>
          <Link
            to="/ga4-connect"
            className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors"
          >
            Connect Google Analytics 4 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </>
    );
  }

  const months = filteredMonthly.map((m) => m.month).sort();
  const windowLabel =
    months.length > 0 ? `${months[0]} → ${months[months.length - 1]}` : "—";
  const totalChannelSessions = ga4Channels.reduce((s, c) => s + c.sessions, 0);

  return (
    <>
      <PageHeader
        title="Google Analytics 4 Data"
        subtitle="Everything we pulled from your GA4 property. Reports are computed from this data on demand."
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <DisconnectButton
                name="Google Analytics 4"
                onConfirm={disconnectGA4}
                variant="button"
              />
              <button
                onClick={runResync}
                disabled={syncing || !canResyncGA4}
                className="btn-primary text-sm disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {ga4LastSyncedAt
                ? `Last synced ${new Date(ga4LastSyncedAt).toLocaleString("en-GB")}`
                : "Not synced yet"}
            </span>
          </div>
        }
      />

      {/* Property metadata */}
      <div className="card-light p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Field label="Property" value={ga4Account?.name || "—"} />
        <Field label="Property ID" value={ga4Account?.propertyId || "—"} mono />
        <Field label="Currency" value={ga4Account?.currency || "—"} />
        <Field label="Timezone" value={ga4Account?.timezone || "—"} />
        <Field label="Type" value={ga4Account?.propertyType || "—"} />
        <Field label="Reporting window" value={windowLabel} />
        <Field label="Months of data" value={String(filteredMonthly.length)} />
        <Field label="Channels" value={String(ga4Channels.length)} />
      </div>

      {/* Year filter — applies to the headline counts and the monthly table.
          Channel mix has no time dimension here, so it stays all-time. */}
      {years.length > 1 && (
        <div className="mt-5 flex items-center gap-2">
          <label
            htmlFor="ga4-year"
            className="label-caps text-[var(--text-muted)]"
          >
            Year
          </label>
          <select
            id="ga4-year"
            value={activeYear}
            onChange={(e) => setYearFilter(e.target.value)}
            className="border border-[var(--border-warm)] rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* At-a-glance counts */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Count
          icon={<Users className="w-4 h-4" />}
          label="Sessions (window)"
          value={Math.round(totals.sessions)}
        />
        <Count
          icon={<Target className="w-4 h-4" />}
          label="Conversion rate"
          value={`${(totals.conversionRate * 100).toFixed(1)}%`}
          raw
          note="conversions ÷ sessions"
        />
        <Count
          icon={<TrendingUp className="w-4 h-4" />}
          label="Session growth"
          value={
            sessionGrowth === null
              ? "—"
              : `${sessionGrowth >= 0 ? "+" : ""}${(sessionGrowth * 100).toFixed(0)}%`
          }
          raw
          note="last 3mo vs prior 3mo"
        />
        <Count
          icon={<BarChart3 className="w-4 h-4" />}
          label="Purchase revenue"
          value={money.format(totals.purchaseRevenue)}
          raw
          note="reported by GA4"
        />
      </div>

      {/* Tabs */}
      <div className="mt-10 flex gap-1 border-b border-[var(--border-warm)]">
        {(["monthly", "channels"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t} ({t === "monthly" ? filteredMonthly.length : ga4Channels.length}
            )
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "monthly" && (
          <DataTable
            head={[
              "Month",
              "Sessions",
              "Total users",
              "New users",
              "Conversions",
              "Conv. rate",
              "Revenue",
            ]}
            empty="No monthly insights synced."
            rows={[...filteredMonthly]
              .sort((a, b) => a.month.localeCompare(b.month))
              .map((m) => [
                m.month,
                Math.round(m.sessions).toLocaleString(),
                Math.round(m.totalUsers).toLocaleString(),
                Math.round(m.newUsers).toLocaleString(),
                Math.round(m.conversions).toLocaleString(),
                `${(m.conversionRate * 100).toFixed(1)}%`,
                money.format(m.purchaseRevenue),
              ])}
          />
        )}

        {tab === "channels" && (
          <DataTable
            head={[
              "Channel",
              "Sessions",
              "Conversions",
              "Revenue",
              "% of sessions",
            ]}
            empty="No channels synced."
            note={
              activeYear !== "all"
                ? "Channel mix covers all synced history; it isn't broken down by year."
                : undefined
            }
            rows={ga4Channels.map((c) => [
              c.channel,
              Math.round(c.sessions).toLocaleString(),
              Math.round(c.conversions).toLocaleString(),
              money.format(c.purchaseRevenue),
              totalChannelSessions > 0
                ? `${Math.round((c.sessions / totalChannelSessions) * 100)}%`
                : "0%",
            ])}
          />
        )}
      </div>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="label-caps" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div
        className={`text-sm mt-1.5 text-[var(--text-primary)] truncate ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Count({
  icon,
  label,
  value,
  raw,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  raw?: boolean;
  note?: string;
}) {
  return (
    <div className="card-light px-5 py-4">
      <div className="label-caps flex items-center gap-1.5 text-[var(--accent)]">
        {icon} {label}
      </div>
      <div className="font-display text-2xl mt-2">
        {raw ? value : Number(value).toLocaleString()}
      </div>
      {note && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">{note}</div>
      )}
    </div>
  );
}

function DataTable({
  head,
  rows,
  empty,
  note,
}: {
  head: string[];
  rows: string[][];
  empty: string;
  note?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card-light p-10 text-center text-sm text-[var(--text-muted)]">
        {empty}
      </div>
    );
  }
  return (
    <div className="card-light overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-warm)] text-left">
            {head.map((h) => (
              <th
                key={h}
                className="px-5 py-3 label-caps font-semibold text-[var(--text-muted)] whitespace-nowrap"
                style={{ fontSize: 10 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-b border-[var(--border-warm)] last:border-0 hover:bg-[var(--bg-primary)]"
            >
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="px-5 py-3 text-[var(--text-secondary)] whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <div className="px-5 py-3 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-warm)]">
          {note}
        </div>
      )}
    </div>
  );
}
