import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  Megaphone,
  Target,
  Lock,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { DisconnectButton } from "@/components/ex/DisconnectButton";
import { useBusinessData } from "@/hooks/useBusinessData";
import { computeMetrics } from "@/lib/analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/meta-data")({
  component: MetaData,
});

const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

type Tab = "monthly" | "campaigns";

function MetaData() {
  const {
    isMetaConnected,
    metaAccount,
    metaMonthly,
    metaCampaigns,
    metaLastSyncedAt,
    canResyncMeta,
    resyncMeta,
    disconnectMeta,
    store,
    orders,
    products,
    customers,
    business,
    loading,
  } = useBusinessData();

  const [tab, setTab] = useState<Tab>("monthly");
  const [syncing, setSyncing] = useState(false);
  const autoTried = useRef(false);

  const money = useMemo(() => {
    const code = metaAccount?.currency || "USD";
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
    }
  }, [metaAccount?.currency]);

  // Totals straight from the monthly series (display figures).
  const totals = useMemo(() => {
    const spend = metaMonthly.reduce((s, m) => s + m.spend, 0);
    const conversions = metaMonthly.reduce((s, m) => s + m.conversions, 0);
    const conversionValue = metaMonthly.reduce(
      (s, m) => s + m.conversionValue,
      0,
    );
    return {
      spend,
      conversions,
      conversionValue,
      roas: spend > 0 ? conversionValue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
    };
  }, [metaMonthly]);

  // Blended CAC needs new-customer counts from the store, so run the engine
  // (same path the Exit Score uses) to keep the figure consistent.
  const metrics = useMemo(
    () =>
      computeMetrics({
        store: store
          ? {
              name: store.name,
              currency: store.currency,
              country: store.country,
              shopCreatedAt: store.shopCreatedAt,
            }
          : null,
        orders,
        products,
        customers,
        industry: business.industry || "E-commerce",
        meta: { monthly: metaMonthly, campaigns: metaCampaigns },
      }),
    [
      store,
      orders,
      products,
      customers,
      business.industry,
      metaMonthly,
      metaCampaigns,
    ],
  );

  const totalCampaignSpend = useMemo(
    () => metaCampaigns.reduce((s, c) => s + c.spend, 0),
    [metaCampaigns],
  );

  const runResync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await resyncMeta();
      toast.success(
        `Synced: ${money.format(r.totals.spend)} spend across ${r.campaigns.length} campaigns.`,
      );
    } catch (err) {
      toast.error(
        (err instanceof Error && err.message) || "Could not refresh ad data.",
      );
    } finally {
      setSyncing(false);
    }
  };

  // Auto-refresh on open when the data is stale.
  useEffect(() => {
    if (autoTried.current || loading || !canResyncMeta) return;
    autoTried.current = true;
    const stale =
      !metaLastSyncedAt ||
      Date.now() - new Date(metaLastSyncedAt).getTime() > STALE_MS;
    if (stale) runResync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canResyncMeta, metaLastSyncedAt]);

  if (!isMetaConnected) {
    return (
      <>
        <PageHeader
          title="Meta Ads Data"
          subtitle="We build your marketing efficiency, verified ROAS and blended CAC directly from your ad data. Connect Meta Ads to get started."
        />
        <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
            <Lock className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
            No ad data yet
          </h2>
          <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
            Once your Meta ad account is connected, we pull your spend, ROAS and
            campaign performance to verify marketing efficiency. Nothing here is
            simulated — it is all built from your real ad account.
          </p>
          <Link
            to="/meta-connect"
            className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors"
          >
            Connect Meta Ads <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </>
    );
  }

  const months = metaMonthly.map((m) => m.month).sort();
  const windowLabel =
    months.length > 0 ? `${months[0]} → ${months[months.length - 1]}` : "—";

  return (
    <>
      <PageHeader
        title="Meta Ads Data"
        subtitle="Everything we pulled from your Meta ad account. Reports are computed from this data on demand."
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <DisconnectButton
                name="Meta Ads"
                onConfirm={disconnectMeta}
                variant="button"
              />
              <button
                onClick={runResync}
                disabled={syncing || !canResyncMeta}
                className="btn-primary text-sm disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {metaLastSyncedAt
                ? `Last synced ${new Date(metaLastSyncedAt).toLocaleString("en-GB")}`
                : "Not synced yet"}
            </span>
          </div>
        }
      />

      {/* Account metadata */}
      <div className="card-light p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Field label="Account" value={metaAccount?.name || "—"} />
        <Field
          label="Ad account ID"
          value={metaAccount?.adAccountId || "—"}
          mono
        />
        <Field label="Currency" value={metaAccount?.currency || "—"} />
        <Field label="Timezone" value={metaAccount?.timezone || "—"} />
        <Field label="Status" value={metaAccount?.accountStatus || "—"} />
        <Field label="Reporting window" value={windowLabel} />
        <Field label="Months of data" value={String(metaMonthly.length)} />
        <Field label="Campaigns" value={String(metaCampaigns.length)} />
      </div>

      {/* At-a-glance counts */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Count
          icon={<DollarSign className="w-4 h-4" />}
          label="Spend (window)"
          value={money.format(totals.spend)}
          raw
        />
        <Count
          icon={<TrendingUp className="w-4 h-4" />}
          label="ROAS"
          value={`${totals.roas.toFixed(2)}x`}
          raw
          note="self-reported by Meta"
        />
        <Count
          icon={<Megaphone className="w-4 h-4" />}
          label="Conversions"
          value={Math.round(totals.conversions)}
        />
        <Count
          icon={<Target className="w-4 h-4" />}
          label="Blended CAC"
          value={
            metrics.blendedCac > 0 ? money.format(metrics.blendedCac) : "—"
          }
          raw
          note="ad spend ÷ new customers"
        />
      </div>

      {/* Tabs */}
      <div className="mt-10 flex gap-1 border-b border-[var(--border-warm)]">
        {(["monthly", "campaigns"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t} ({t === "monthly" ? metaMonthly.length : metaCampaigns.length})
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "monthly" && (
          <DataTable
            head={["Month", "Spend", "Conversions", "Conv. value", "ROAS"]}
            empty="No monthly insights synced."
            rows={[...metaMonthly]
              .sort((a, b) => a.month.localeCompare(b.month))
              .map((m) => [
                m.month,
                money.format(m.spend),
                String(Math.round(m.conversions)),
                money.format(m.conversionValue),
                `${m.roas.toFixed(2)}x`,
              ])}
          />
        )}

        {tab === "campaigns" && (
          <DataTable
            head={[
              "Campaign",
              "Objective",
              "Status",
              "Spend",
              "Conversions",
              "ROAS",
              "% of spend",
            ]}
            empty="No campaigns synced."
            rows={metaCampaigns
              .slice(0, 500)
              .map((c) => [
                c.name,
                c.objective ?? "—",
                c.status ?? "—",
                money.format(c.spend),
                String(Math.round(c.conversions)),
                `${c.roas.toFixed(2)}x`,
                totalCampaignSpend > 0
                  ? `${Math.round((c.spend / totalCampaignSpend) * 100)}%`
                  : "0%",
              ])}
            note={
              metaCampaigns.length > 500
                ? `Showing first 500 of ${metaCampaigns.length}.`
                : undefined
            }
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
