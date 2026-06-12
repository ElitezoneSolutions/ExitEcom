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

export const Route = createFileRoute("/_app/tiktok-data")({
  component: TikTokData,
});

const STALE_MS = 6 * 60 * 60 * 1000;

type Tab = "monthly" | "campaigns";

function TikTokData() {
  const {
    isTikTokConnected,
    tikTokAccount,
    tikTokMonthly,
    tikTokCampaigns,
    tikTokLastSyncedAt,
    canResyncTikTok,
    resyncTikTok,
    disconnectTikTok,
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
    const code = tikTokAccount?.currency || "USD";
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
    }
  }, [tikTokAccount?.currency]);

  const totals = useMemo(() => {
    const spend = tikTokMonthly.reduce((s, m) => s + m.spend, 0);
    const conversions = tikTokMonthly.reduce((s, m) => s + m.conversions, 0);
    const conversionValue = tikTokMonthly.reduce((s, m) => s + m.conversionValue, 0);
    return {
      spend,
      conversions,
      conversionValue,
      roas: spend > 0 ? conversionValue / spend : 0,
    };
  }, [tikTokMonthly]);

  const metrics = useMemo(
    () =>
      computeMetrics({
        store: store
          ? { name: store.name, currency: store.currency, country: store.country, shopCreatedAt: store.shopCreatedAt }
          : null,
        orders,
        products,
        customers,
        industry: business.industry || "E-commerce",
        tiktok: { monthly: tikTokMonthly, campaigns: tikTokCampaigns },
      }),
    [store, orders, products, customers, business.industry, tikTokMonthly, tikTokCampaigns],
  );

  const isStale =
    tikTokLastSyncedAt &&
    Date.now() - new Date(tikTokLastSyncedAt).getTime() > STALE_MS;

  useEffect(() => {
    if (autoTried.current || loading || !isTikTokConnected) return;
    if (!tikTokAccount && canResyncTikTok) {
      autoTried.current = true;
      resyncTikTok().catch((err) =>
        console.error("TikTok auto-resync failed:", err),
      );
    }
  }, [loading, isTikTokConnected, tikTokAccount, canResyncTikTok, resyncTikTok]);

  const handleResync = async () => {
    setSyncing(true);
    try {
      await resyncTikTok();
      toast.success("TikTok Ads data refreshed.");
    } catch (err) {
      toast.error((err instanceof Error && err.message) || "Refresh failed.");
    } finally {
      setSyncing(false);
    }
  };

  if (!loading && !isTikTokConnected) {
    return (
      <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center text-center gap-6 my-12">
        <div className="w-14 h-14 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
          <Lock className="w-7 h-7 text-[var(--accent)]" />
        </div>
        <div>
          <h3 className="text-xl font-bold font-display">TikTok Ads not connected</h3>
          <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed max-w-sm mx-auto">
            Connect your TikTok Ads account to see spend, ROAS and campaign performance here.
          </p>
        </div>
        <Link to="/tiktok-connect" className="btn-primary py-3 px-6 rounded-md font-semibold text-sm justify-center">
          Connect TikTok Ads <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="TikTok Ads"
        subtitle={
          tikTokAccount
            ? `${tikTokAccount.name} · ${tikTokAccount.currency} · ${tikTokAccount.accountStatus}`
            : "Loading…"
        }
        right={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResync}
              disabled={syncing || !canResyncTikTok}
              className="btn-ghost-dark py-2 px-4 text-xs font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Refreshing…" : "Refresh"}
            </button>
            <DisconnectButton name="TikTok Ads" onConfirm={disconnectTikTok} />
          </div>
        }
      />

      {tikTokLastSyncedAt && (
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Last synced {new Date(tikTokLastSyncedAt).toLocaleString()}
          {isStale && (
            <span className="ml-2 text-amber-600 font-medium">· data may be stale</span>
          )}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<DollarSign className="w-4 h-4 text-[var(--accent)]" />}
          label="Total Spend"
          value={money.format(totals.spend)}
          sub="trailing 12 months"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-[var(--accent)]" />}
          label="Blended ROAS"
          value={`${totals.roas.toFixed(2)}x`}
          sub="self-reported by TikTok"
        />
        <StatCard
          icon={<Target className="w-4 h-4 text-[var(--accent)]" />}
          label="Conversions"
          value={totals.conversions.toLocaleString()}
          sub="trailing 12 months"
        />
        <StatCard
          icon={<Megaphone className="w-4 h-4 text-[var(--accent)]" />}
          label="Active Campaigns"
          value={tikTokCampaigns
            .filter((c) => c.status?.toLowerCase() === "enable")
            .length.toLocaleString()}
          sub={`of ${tikTokCampaigns.length} total`}
        />
      </div>

      {/* CAC if Shopify connected */}
      {store && metrics.blendedCac > 0 && (
        <div className="card-light p-4 mb-6 flex items-center gap-3 text-sm">
          <Target className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span>
            Estimated blended CAC:{" "}
            <strong>{money.format(metrics.blendedCac)}</strong> — calculated
            from TikTok spend vs new customer acquisition.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex p-1 mb-5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-warm)] gap-1">
        {(["monthly", "campaigns"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors capitalize ${
              tab === t
                ? "bg-white text-[var(--accent)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t === "monthly" ? "Monthly Trends" : "Campaigns"}
          </button>
        ))}
      </div>

      {tab === "monthly" && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-warm)] bg-[var(--bg-secondary)]">
                  {["Month", "Spend", "Impressions", "Clicks", "Conversions", "Conv. Value", "ROAS"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...tikTokMonthly].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-[var(--border-warm)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">{m.month}</td>
                    <td className="px-4 py-3">{money.format(m.spend)}</td>
                    <td className="px-4 py-3">{m.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3">{m.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3">{m.conversions.toLocaleString()}</td>
                    <td className="px-4 py-3">{money.format(m.conversionValue)}</td>
                    <td className="px-4 py-3 font-medium">{m.roas.toFixed(2)}x</td>
                  </tr>
                ))}
                {tikTokMonthly.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      No monthly data yet — refresh to pull the latest figures.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "campaigns" && (
        <div className="card-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-warm)] bg-[var(--bg-secondary)]">
                  {["Campaign", "Objective", "Status", "Spend", "Conversions", "Conv. Value", "ROAS"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tikTokCampaigns.map((c) => (
                  <tr key={c.tikTokCampaignId} className="border-b border-[var(--border-warm)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{c.name}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] capitalize">{c.objectiveType?.toLowerCase().replace(/_/g, " ") ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        c.status?.toLowerCase() === "enable"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {c.status?.toLowerCase() ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{money.format(c.spend)}</td>
                    <td className="px-4 py-3">{c.conversions.toLocaleString()}</td>
                    <td className="px-4 py-3">{money.format(c.conversionValue)}</td>
                    <td className="px-4 py-3 font-medium">{c.roas.toFixed(2)}x</td>
                  </tr>
                ))}
                {tikTokCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      No campaign data yet — refresh to pull the latest figures.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card-light p-5">
      <div className="label-caps flex items-center gap-1.5">{icon} {label}</div>
      <div className="font-display text-3xl font-bold text-[var(--text-primary)] mt-3">{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)] mt-1">{sub}</div>}
    </div>
  );
}
