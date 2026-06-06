import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ShoppingCart,
  Package,
  Users,
  Store,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import type { ShopifySyncResult } from "@/lib/shopify";
import { toast } from "sonner";

type ConnectMethod = "key" | "custom";

export const Route = createFileRoute("/_app/shopify-connect")({
  component: ShopifyConnect,
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ShopifyConnect() {
  const navigate = useNavigate();
  const { syncStore } = useBusinessData();

  const [method, setMethod] = useState<ConnectMethod>("custom");

  // Custom-app credentials (Shopify Admin API access token + store domain).
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const [syncStatus, setSyncStatus] = useState<
    "idle" | "connecting" | "fetching" | "saving" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<ShopifySyncResult | null>(null);

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDomain.trim() || !accessToken.trim()) {
      toast.error("Enter both your store domain and Admin API access token.");
      return;
    }

    try {
      setErrorMessage("");
      setSyncStatus("connecting");
      await delay(700);
      setSyncStatus("fetching");

      const result = await syncStore(shopDomain.trim(), accessToken.trim());

      setSyncStatus("saving");
      await delay(500);

      setSummary(result);
      setSyncStatus("success");
      toast.success("Shopify store connected. Data synced.");
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage(
        (err instanceof Error && err.message) ||
          "Could not connect to Shopify. Please check your credentials.",
      );
      toast.error("Connection failed. Check the domain, token and scopes.");
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/data-sources"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Data Sources
        </Link>
      </div>

      <PageHeader
        title="Connect Shopify"
        subtitle="We authenticate, pull your full order, product and customer history, and store it securely. No report is generated until you run one."
      />

      {syncStatus === "idle" && (
        <>
          {/* Method selector */}
          <div className="inline-flex p-1 mb-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-warm)] gap-1">
            <button
              type="button"
              onClick={() => setMethod("custom")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                method === "custom"
                  ? "bg-white text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Shopify custom app
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="px-4 py-2 text-xs font-semibold rounded-md text-[var(--text-muted)] opacity-50 cursor-not-allowed inline-flex items-center gap-1.5"
            >
              ExitEcom Analytic key
              <span className="text-[9px] uppercase tracking-wider font-bold bg-[var(--border-warm)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded">
                Soon
              </span>
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-start">
            {/* Form */}
            <div className="lg:col-span-5 card-light p-6 md:p-8 flex flex-col gap-6">
              <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-warm)]">
                <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center text-[var(--accent)] font-semibold text-lg">
                  S
                </div>
                <div>
                  <h3 className="text-lg font-semibold leading-tight">
                    Custom App Credentials
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Use an Admin API token from your own Shopify app
                  </p>
                </div>
              </div>

              <form onSubmit={handleSync} className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                    Store Domain
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="your-store.myshopify.com"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    className="w-full font-mono"
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                    Your <code>.myshopify.com</code> domain (Settings &rarr;
                    Domains).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                    Admin API Access Token
                    <span className="text-[10px] text-[var(--text-muted)] normal-case font-normal">
                      starts with shpat_
                    </span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="w-full font-mono"
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                    Generated when you install your custom app (see the guide on
                    the right).
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full btn-primary justify-center py-3 text-sm rounded-md shadow-md mt-2"
                >
                  <Sparkles className="w-4 h-4 text-white" /> Connect & Pull
                  Data
                </button>
              </form>

              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] justify-center pt-2 text-center">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                Read-only. We only request order, product, and customer read
                scopes.
              </div>
            </div>

            {/* Guide */}
            <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
              <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
                How to create a Shopify custom app
              </h3>

              <div className="flex flex-col gap-5">
                {[
                  {
                    n: 1,
                    h: "Open app development",
                    b: (
                      <>
                        In your Shopify admin, go to <strong>Settings</strong>{" "}
                        &rarr; <strong>Apps and sales channels</strong> &rarr;{" "}
                        <strong>Develop apps</strong>, then{" "}
                        <strong>Create an app</strong>.
                      </>
                    ),
                  },
                  {
                    n: 2,
                    h: "Grant read-only scopes",
                    b: (
                      <>
                        Under <strong>Configuration</strong> &rarr;{" "}
                        <strong>Admin API integration</strong>, enable{" "}
                        <code>read_orders</code>, <code>read_products</code> and{" "}
                        <code>read_customers</code>.
                      </>
                    ),
                  },
                  {
                    n: 3,
                    h: "Install & reveal the token",
                    b: (
                      <>
                        Click <strong>Install app</strong>, then on the{" "}
                        <strong>API credentials</strong> tab reveal the{" "}
                        <strong>Admin API access token</strong> (starts with{" "}
                        <code>shpat_</code>).
                      </>
                    ),
                  },
                  {
                    n: 4,
                    h: "Paste it here",
                    b: (
                      <>
                        Enter your <strong>store domain</strong> and the{" "}
                        <strong>access token</strong>, then click{" "}
                        <strong>Connect &amp; Pull Data</strong>.
                      </>
                    ),
                  },
                ].map((s) => (
                  <div key={s.n} className="flex items-start gap-4">
                    <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                      {s.n}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{s.h}</h4>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                        {s.b}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Tip:</strong> The Admin API token is shown only
                    once. Copy it immediately — if you lose it, uninstall and
                    recreate the app to get a new one.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Syncing progress */}
      {(syncStatus === "connecting" ||
        syncStatus === "fetching" ||
        syncStatus === "saving") && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center justify-center text-center gap-8 shadow-lg my-12 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--bg-secondary)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-1000 ease-out"
              style={{
                width:
                  syncStatus === "connecting"
                    ? "25%"
                    : syncStatus === "fetching"
                      ? "70%"
                      : "92%",
              }}
            />
          </div>

          <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>

          <div>
            <h3 className="text-xl font-semibold font-display">
              {syncStatus === "connecting" && "Authenticating with Shopify…"}
              {syncStatus === "fetching" && "Pulling your store data…"}
              {syncStatus === "saving" && "Saving securely…"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {syncStatus === "connecting" &&
                "Verifying your Admin API token and store domain."}
              {syncStatus === "fetching" &&
                "Fetching orders, products and customers (paginating through your full history)."}
              {syncStatus === "saving" &&
                "Storing the raw data. No report is generated — you run those on demand."}
            </p>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-2 mt-2 text-left text-xs bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] font-medium">
            <Step label="🔐 Authenticate" done={syncStatus !== "connecting"} />
            <Step
              label="📦 Pull orders, products & customers"
              done={syncStatus === "saving"}
              running={syncStatus === "fetching"}
            />
            <Step
              label="💾 Persist to your account"
              running={syncStatus === "saving"}
            />
          </div>
        </div>
      )}

      {/* Success — confirmation + counts only, NO report */}
      {syncStatus === "success" && summary && (
        <div className="max-w-3xl mx-auto flex flex-col gap-6 my-6">
          <div className="card-light p-8 text-center flex flex-col items-center gap-5 shadow-lg bg-white border-2 border-[var(--positive)]/30">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center border border-emerald-300">
              <CheckCircle2 className="w-8 h-8 text-[var(--positive)]" />
            </div>

            <div>
              <h3 className="text-2xl font-bold font-display">
                {summary.shop.name || "Your store"} is connected
              </h3>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                We pulled and stored your store data. Nothing has been analysed
                yet — run a report whenever you're ready.
              </p>
            </div>

            <div className="w-full grid sm:grid-cols-3 gap-4 mt-2">
              <Stat
                icon={<ShoppingCart className="w-4 h-4 text-[var(--accent)]" />}
                label="Orders"
                value={summary.counts.orders.toLocaleString()}
                note={summary.capped.orders ? "capped at 5,000" : undefined}
              />
              <Stat
                icon={<Package className="w-4 h-4 text-[var(--accent)]" />}
                label="Products"
                value={summary.counts.products.toLocaleString()}
                note={summary.capped.products ? "capped" : undefined}
              />
              <Stat
                icon={<Users className="w-4 h-4 text-[var(--accent)]" />}
                label="Customers"
                value={summary.counts.customers.toLocaleString()}
                note={summary.capped.customers ? "capped" : undefined}
              />
            </div>

            <div className="w-full flex items-center justify-center gap-4 text-xs text-[var(--text-muted)] mt-1">
              <span className="inline-flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> {summary.shop.currency}
              </span>
              {summary.shop.shopCreatedAt && (
                <span>
                  Store opened{" "}
                  {new Date(summary.shop.shopCreatedAt).toLocaleDateString(
                    "en-GB",
                    { month: "short", year: "numeric" },
                  )}
                </span>
              )}
              {summary.sandbox && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                  sandbox data
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
              <button
                onClick={() => navigate({ to: "/store-data" })}
                className="flex-1 btn-primary py-3 rounded-md justify-center font-semibold text-sm"
              >
                View Store Data
              </button>
              <button
                onClick={() => navigate({ to: "/exit-score" })}
                className="flex-1 btn-ghost-dark py-3 rounded-md justify-center font-medium text-sm cursor-pointer"
              >
                Run your first report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {syncStatus === "error" && (
        <div className="card-light max-w-xl mx-auto p-8 text-center flex flex-col items-center gap-5 shadow-lg my-12 border-2 border-[var(--risk-critical)]/30">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center border border-red-200">
            <AlertCircle className="w-8 h-8 text-[var(--risk-critical)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-display">
              Connection failed
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              We couldn't reach your store or authenticate the token.
            </p>
          </div>
          <div className="w-full p-4 bg-red-50 border border-red-100 rounded text-left text-xs font-mono text-[var(--risk-critical)] overflow-x-auto max-h-40">
            {errorMessage}
          </div>
          <div className="flex gap-4 w-full mt-2">
            <button
              onClick={() => setSyncStatus("idle")}
              className="flex-1 btn-primary py-3 rounded-md justify-center font-semibold text-sm"
            >
              Try Again
            </button>
            <Link
              to="/data-sources"
              className="flex-1 btn-ghost-dark py-3 rounded-md justify-center font-medium text-sm text-center"
            >
              Cancel
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function Step({
  label,
  done,
  running,
}: {
  label: string;
  done?: boolean;
  running?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[var(--text-secondary)]">
      <span>{label}</span>
      <span className="font-mono text-[10px]">
        {done ? (
          <span className="text-[var(--positive)]">DONE</span>
        ) : running ? (
          "RUNNING"
        ) : (
          "PENDING"
        )}
      </span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left">
      <div className="label-caps flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="font-display text-3xl font-bold text-[var(--text-primary)] mt-3">
        {value}
      </div>
      {note && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">{note}</div>
      )}
    </div>
  );
}
