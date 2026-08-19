import { useCallback, useEffect, useRef, useState } from "react";
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
  ExternalLink,
  KeyRound,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { useAuth } from "@/hooks/useAuth";
import { resolveBusinessId } from "@/lib/businessId";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  startConnectHandoffFn,
  syncShopifyViaConnectionKeyFn,
  type ShopifySyncResult,
} from "@/lib/shopify";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/shopify-connect")({
  component: ShopifyConnect,
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// How long we wait for the ExitEcom Connect install to come back, and how often
// we check. The merchant is on Shopify's consent screen for most of it.
const HANDOFF_POLL_MS = 3000;
const HANDOFF_TIMEOUT_MS = 5 * 60 * 1000;

function ShopifyConnect() {
  const navigate = useNavigate();
  const { syncStore, syncStoreViaConnectionKey, adoptConnectInstall, refetch } =
    useBusinessData();
  const { user } = useAuth();

  // Custom-app credentials (Shopify Admin API access token + store domain).
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  // ExitEcom Connect connection key (the manual path).
  const [connectionKey, setConnectionKey] = useState("");
  // The custom-app form is the advanced fallback, so it starts collapsed.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [syncStatus, setSyncStatus] = useState<
    | "idle"
    | "handoff"
    | "connecting"
    | "fetching"
    | "saving"
    | "success"
    | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<ShopifySyncResult | null>(null);

  // Set while the install window is open so the poller can be stopped on unmount.
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  // Drive the shared connecting → fetching → saving → success/error flow around
  // the Shopify custom-app pull.
  const runSync = async (
    pull: () => ReturnType<typeof syncStore>,
    fallbackError: string,
  ) => {
    try {
      setErrorMessage("");
      setSyncStatus("connecting");
      await delay(700);
      setSyncStatus("fetching");

      const result = await pull();

      setSyncStatus("saving");
      await delay(500);

      setSummary(result);
      setSyncStatus("success");
      toast.success("Shopify store connected. Data synced.");
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage((err instanceof Error && err.message) || fallbackError);
      toast.error("Connection failed.");
    }
  };

  // On arrival, check whether this business already has a finished ExitEcom
  // Connect install that was never linked here — the merchant closing the tab
  // mid-install, or a push that didn't land. ExitEcom Connect shares this Supabase
  // project, so we can find it and pull it without asking them to do anything.
  // Runs once, silently: finding nothing is the normal case.
  const adoptAttempted = useRef(false);
  useEffect(() => {
    if (adoptAttempted.current) return;
    adoptAttempted.current = true;

    let cancelled = false;
    (async () => {
      const result = await adoptConnectInstall();
      if (cancelled || !result) return;
      setSummary(result);
      setSyncStatus("success");
      await refetch();
      toast.success("Your Shopify store was already connected — data synced.");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── ExitEcom Connect: automatic handoff ─────────────────────────────────
  //
  // We mint a short-lived signed link naming this business, open it, and then
  // watch shopify_stores for the row ExitEcom Connect writes when it pushes the
  // store back. Polling rather than postMessage: the install happens on a
  // different origin (connect.exitecom.com) and passes through Shopify, so the
  // database is the only signal we can rely on.
  const pollForConnectedStore = useCallback(
    async (deadline: number): Promise<void> => {
      const businessId = await resolveBusinessId(user, "", "Shopify").catch(
        () => null,
      );
      if (!businessId) {
        throw new Error(
          "Finish setting up your business before connecting Shopify.",
        );
      }

      const { data } = await supabase
        .from("shopify_stores")
        .select("connection_key, last_synced_at, source")
        .eq("business_id", businessId)
        .maybeSingle();

      if (data?.source === "connect" && data.connection_key) {
        // The store is linked. If the push didn't finish (no last_synced_at),
        // pull it ourselves through the same connection key.
        if (!data.last_synced_at) {
          setSyncStatus("fetching");
          await syncStoreViaConnectionKey(data.connection_key);
        } else {
          setSyncStatus("saving");
          const result = await syncShopifyViaConnectionKeyFn({
            data: { connectionKey: data.connection_key },
          });
          setSummary(result);
        }
        await refetch();
        setSyncStatus("success");
        toast.success("Shopify store connected.");
        return;
      }

      if (Date.now() > deadline) {
        throw new Error(
          "We didn't hear back from the install. If you finished it on Shopify, copy your connection key from that page and paste it below.",
        );
      }

      await new Promise<void>((resolve) => {
        pollTimer.current = setTimeout(resolve, HANDOFF_POLL_MS);
      });
      return pollForConnectedStore(deadline);
    },
    [user, syncStoreViaConnectionKey, refetch],
  );

  const handleInstallApp = async () => {
    if (!isSupabaseConfigured) {
      toast.error("Sign in to connect a store.");
      return;
    }
    try {
      setErrorMessage("");
      // Null only when Supabase isn't configured, which the guard above rules out.
      const businessId = await resolveBusinessId(user, "", "Shopify");
      if (!businessId) {
        throw new Error(
          "Finish setting up your business before connecting Shopify.",
        );
      }
      const { url } = await startConnectHandoffFn({
        data: { businessId, userId: user?.id, email: user?.email ?? undefined },
      });

      // Opened before the await chain below so it isn't treated as a popup.
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setErrorMessage("");
        toast.error("Allow pop-ups for this site, then try again.");
        return;
      }

      setSyncStatus("handoff");
      await pollForConnectedStore(Date.now() + HANDOFF_TIMEOUT_MS);
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage(
        (err instanceof Error && err.message) ||
          "Could not start the Shopify install.",
      );
    }
  };

  // ─── ExitEcom Connect: manual key ────────────────────────────────────────
  const handleKeySync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionKey.trim()) {
      toast.error("Paste the connection key from the ExitEcom Connect page.");
      return;
    }
    await runSync(
      () => syncStoreViaConnectionKey(connectionKey.trim()),
      "Could not pull your store using that connection key.",
    );
  };

  const handleCustomSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDomain.trim() || !accessToken.trim()) {
      toast.error("Enter both your store domain and Admin API access token.");
      return;
    }
    await runSync(
      () => syncStore(shopDomain.trim(), accessToken.trim()),
      "Could not connect to Shopify. Please check your credentials.",
    );
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
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {/* 1 — the recommended path: install the ExitEcom app */}
          <div className="card-light p-6 md:p-8 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-tight">
                  Install the ExitEcom app
                  <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--blue-100)] text-[var(--accent)]">
                    Recommended
                  </span>
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  Approve read-only access on Shopify. Takes about a minute and
                  nothing to copy or paste.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] border border-[var(--border-warm)] rounded-md p-4">
              {[
                "We open connect.exitecom.com and you enter your store address",
                "Shopify asks you to approve read-only access",
                "Your store data is sent straight back here",
              ].map((step, i) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-white border border-[var(--border-mid)] flex items-center justify-center font-bold text-[10px] text-[var(--accent)] shrink-0">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleInstallApp}
              className="w-full btn-primary justify-center py-3 text-sm rounded-md shadow-md"
            >
              <ExternalLink className="w-4 h-4 text-white" /> Install on Shopify
            </button>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] justify-center text-center">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Read-only. We only request order, product, and customer read
              scopes.
            </div>
          </div>

          {/* 2 — the manual fallback: paste the connection key */}
          <div className="card-light p-6 md:p-8 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-tight">
                  I have a connection key
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  Already installed the ExitEcom app on your store? Paste the
                  key it showed you.
                </p>
              </div>
            </div>

            <form onSubmit={handleKeySync} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                  Connection key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="eea_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={connectionKey}
                  onChange={(e) => setConnectionKey(e.target.value)}
                  className="w-full font-mono"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                  Shown on the ExitEcom Connect page right after you install.
                </p>
              </div>
              <button
                type="submit"
                className="w-full btn-ghost-dark justify-center py-3 text-sm rounded-md cursor-pointer"
              >
                Connect &amp; Pull Data
              </button>
            </form>
          </div>

          {/* 3 — advanced: the merchant's own custom app token */}
          <div className="card-light p-6 md:p-8 flex flex-col gap-5">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center justify-between gap-3 text-left cursor-pointer"
            >
              <div>
                <h3 className="text-base font-semibold leading-tight">
                  Advanced: use your own Shopify custom app
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  For developers who would rather issue their own Admin API
                  token.
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </button>

            {showAdvanced && (
              <>
                <form
                  onSubmit={handleCustomSync}
                  className="flex flex-col gap-5"
                >
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Store Domain
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
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
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                      Admin API Access Token
                      <span className="text-[10px] text-[var(--text-muted)] normal-case font-normal">
                        starts with shpat_
                      </span>
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="w-full font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full btn-ghost-dark justify-center py-3 text-sm rounded-md cursor-pointer"
                  >
                    Connect &amp; Pull Data
                  </button>
                </form>

                <div className="flex flex-col gap-4 border-t border-[var(--border-warm)] pt-5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    How to create a Shopify custom app
                  </h4>
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
                          <code>read_orders</code>, <code>read_products</code>{" "}
                          and <code>read_customers</code>.
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
                  ].map((step) => (
                    <div key={step.n} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-[10px] text-[var(--accent)] shrink-0 mt-0.5">
                        {step.n}
                      </div>
                      <div>
                        <h5 className="font-semibold text-xs">{step.h}</h5>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                          {step.b}
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Waiting on the ExitEcom Connect install to come back */}
      {syncStatus === "handoff" && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center text-center gap-6 shadow-lg my-12">
          <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-semibold font-display">
              Waiting for Shopify…
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              Finish approving ExitEcom in the window that just opened. This
              page updates on its own the moment your store is connected — you
              can leave it open.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSyncStatus("idle")}
            className="btn-ghost-dark py-2.5 px-5 rounded-md text-xs cursor-pointer"
          >
            Cancel
          </button>
        </div>
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
