import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, ShoppingCart, Package, Users, Store } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { ConnectShopifyGate } from "@/components/ex/ConnectShopifyGate";
import { DisconnectButton } from "@/components/ex/DisconnectButton";
import { useBusinessData } from "@/hooks/useBusinessData";
import { computeMetrics } from "@/lib/analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/store-data")({
  component: StoreData,
});

const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

type Tab = "orders" | "products" | "customers";

function StoreData() {
  const {
    isShopifyConnected,
    store,
    orders,
    products,
    customers,
    lastSyncedAt,
    canResync,
    resyncStore,
    disconnectShopify,
    business,
    loading,
  } = useBusinessData();

  const [tab, setTab] = useState<Tab>("orders");
  const [syncing, setSyncing] = useState(false);
  const autoTried = useRef(false);

  const money = useMemo(() => {
    const code = store?.currency || "USD";
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
    }
  }, [store?.currency]);

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
      }),
    [store, orders, products, customers, business.industry],
  );

  // Per-product revenue lookup (derived from real line items).
  const productRev = useMemo(() => {
    const byId = new Map<string, { revenue: number; share: number }>();
    for (const pr of metrics.productRevenue) {
      if (pr.productId)
        byId.set(pr.productId, { revenue: pr.revenue, share: pr.share });
    }
    return byId;
  }, [metrics.productRevenue]);

  const runResync = async (incremental: boolean) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await resyncStore(incremental);
      toast.success(
        `Synced: ${r.counts.orders} orders, ${r.counts.products} products, ${r.counts.customers} customers.`,
      );
    } catch (err) {
      toast.error(
        (err instanceof Error && err.message) ||
          "Could not refresh store data.",
      );
    } finally {
      setSyncing(false);
    }
  };

  // Auto-refresh on open when the data is stale.
  useEffect(() => {
    if (autoTried.current || loading || !canResync) return;
    autoTried.current = true;
    const stale =
      !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > STALE_MS;
    if (stale) runResync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canResync, lastSyncedAt]);

  if (!isShopifyConnected) {
    return (
      <ConnectShopifyGate
        title="Store Data"
        feature="a full view of your orders, products and customers"
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Store Data"
        subtitle="Everything we pulled from your Shopify store. Reports are computed from this data on demand."
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <DisconnectButton
                name="Shopify"
                onConfirm={disconnectShopify}
                variant="button"
              />
              <button
                onClick={() => runResync(false)}
                disabled={syncing || !canResync}
                className="btn-primary text-sm disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleString("en-GB")}`
                : "Not synced yet"}
            </span>
          </div>
        }
      />

      {/* Store metadata */}
      <div className="card-light p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Meta label="Store" value={store?.name || "—"} />
        <Meta label="Domain" value={store?.shopDomain || "—"} mono />
        <Meta label="Currency" value={store?.currency || "—"} />
        <Meta label="Country" value={store?.country || "—"} />
        <Meta
          label="Store opened"
          value={
            store?.shopCreatedAt
              ? new Date(store.shopCreatedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"
          }
        />
        <Meta label="Plan" value={store?.plan || "—"} />
        <Meta label="Business age" value={metrics.businessAge} />
        <Meta label="Revenue (TTM)" value={money.format(metrics.revenueTTM)} />
      </div>

      {/* At-a-glance counts */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Count
          icon={<ShoppingCart className="w-4 h-4" />}
          label="Orders"
          value={orders.length}
        />
        <Count
          icon={<Package className="w-4 h-4" />}
          label="Products"
          value={products.length}
        />
        <Count
          icon={<Users className="w-4 h-4" />}
          label="Customers"
          value={customers.length}
        />
        <Count
          icon={<Store className="w-4 h-4" />}
          label="Avg Order Value"
          value={money.format(metrics.avgOrderValue)}
          raw
        />
      </div>

      {/* Tabs */}
      <div className="mt-10 flex gap-1 border-b border-[var(--border-warm)]">
        {(["orders", "products", "customers"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t} (
            {t === "orders"
              ? orders.length
              : t === "products"
                ? products.length
                : customers.length}
            )
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "orders" && (
          <DataTable
            head={["Order", "Date", "Customer", "Items", "Total"]}
            empty="No orders synced."
            rows={orders
              .slice(0, 500)
              .map((o) => [
                o.orderNumber || o.shopifyOrderId,
                o.createdAt
                  ? new Date(o.createdAt).toLocaleDateString("en-GB")
                  : "—",
                o.customerId ?? "Guest",
                String(o.lineItems.reduce((s, li) => s + li.quantity, 0)),
                money.format(o.totalPrice),
              ])}
            note={
              orders.length > 500
                ? `Showing first 500 of ${orders.length}.`
                : undefined
            }
          />
        )}

        {tab === "products" && (
          <DataTable
            head={["Product", "Created", "Variants", "Revenue", "% of revenue"]}
            empty="No products synced."
            rows={products.slice(0, 500).map((p) => {
              const r = productRev.get(p.shopifyProductId);
              return [
                p.title,
                p.createdAt
                  ? new Date(p.createdAt).toLocaleDateString("en-GB")
                  : "—",
                String(p.variants.length),
                r ? money.format(r.revenue) : money.format(0),
                r ? `${Math.round(r.share * 100)}%` : "0%",
              ];
            })}
            note={
              products.length > 500
                ? `Showing first 500 of ${products.length}.`
                : undefined
            }
          />
        )}

        {tab === "customers" && (
          <DataTable
            head={[
              "Customer",
              "Orders",
              "Total spent",
              "First seen",
              "Last order",
              "Repeat",
            ]}
            empty="No customers synced."
            rows={customers
              .slice(0, 500)
              .map((c) => [
                [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                  c.email ||
                  c.shopifyCustomerId,
                String(c.ordersCount),
                money.format(c.totalSpent),
                c.createdAt
                  ? new Date(c.createdAt).toLocaleDateString("en-GB")
                  : "—",
                c.lastOrderAt
                  ? new Date(c.lastOrderAt).toLocaleDateString("en-GB")
                  : "—",
                c.ordersCount > 1 ? "Yes" : "No",
              ])}
            note={
              customers.length > 500
                ? `Showing first 500 of ${customers.length}.`
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}

function Meta({
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  raw?: boolean;
}) {
  return (
    <div className="card-light px-5 py-4">
      <div className="label-caps flex items-center gap-1.5 text-[var(--accent)]">
        {icon} {label}
      </div>
      <div className="font-display text-2xl mt-2">
        {raw ? value : Number(value).toLocaleString()}
      </div>
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
