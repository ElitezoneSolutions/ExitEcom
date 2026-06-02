import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Lock,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Sparkles,
  LineChart,
  DollarSign,
  Activity,
  User,
  Package,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { connectShopifyFn } from "@/lib/shopify";
import { toast } from "sonner";

export const Route = createFileRoute("/app/shopify-connect")({
  component: ShopifyConnect,
});

function ShopifyConnect() {
  const navigate = useNavigate();
  const { business, syncShopifyData } = useBusinessData();

  // Form states
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  // Sync state
  const [syncStatus, setSyncStatus] = useState<"idle" | "connecting" | "fetching" | "normalizing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [syncedData, setSyncedData] = useState<any>(null);

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDomain) {
      toast.error("Please enter your Shopify Shop Domain.");
      return;
    }
    if (!accessToken) {
      toast.error("Please enter your Admin API Access Token.");
      return;
    }

    try {
      setErrorMessage("");
      setSyncStatus("connecting");

      // Progress animation steps
      setTimeout(() => {
        setSyncStatus("fetching");
      }, 1500);

      setTimeout(() => {
        setSyncStatus("normalizing");
      }, 3500);

      const result = await connectShopifyFn({
        shopDomain,
        accessToken,
        industry: business.industry,
      });

      if (!result || !result.businessUpdate) {
        throw new Error("Invalid response received from Shopify Connect.");
      }

      // Save synced data to state/DB
      const success = await syncShopifyData(result);
      if (success) {
        setSyncedData(result.businessUpdate);
        setSyncStatus("success");
        toast.success("Shopify store connected successfully!");
      } else {
        throw new Error("Failed to save synced data to local state/database.");
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage(err.message || "Could not connect to Shopify. Please check your credentials.");
      toast.error("Sync failed. Check credentials and scopes.");
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/app/data-sources"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Data Sources
        </Link>
      </div>

      <PageHeader
        title="Shopify Connect"
        subtitle="Connect your core revenue engine in 5 minutes. We pull order data and synthesize M&A performance reports securely."
      />

      {syncStatus === "idle" && (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-5 card-light p-6 md:p-8 flex flex-col gap-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-warm)]">
              <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center text-[var(--accent)] font-semibold text-lg">
                S
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-tight">API Credentials</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Secure, read-only API connection</p>
              </div>
            </div>

            <form onSubmit={handleSync} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                  Shop Domain
                  <span className="text-[10px] text-[var(--text-muted)] normal-case font-normal">e.g. store.myshopify.com</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="my-skincare-brand.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                  Admin API Access Token
                </label>
                <input
                  type="password"
                  required
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full"
                />
              </div>





              <button
                type="submit"
                className="w-full btn-primary justify-center py-3 text-sm rounded-md shadow-md mt-2"
              >
                <Sparkles className="w-4 h-4 text-white" /> Connect & Sync Store
              </button>
            </form>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] justify-center pt-2">
              <Lock className="w-3.5 h-3.5" /> Credentials are encrypted and never stored in plain text.
            </div>
          </div>

          {/* Guide */}
          <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
            <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
              Onboarding Guide: Setting Up Shopify Custom App
            </h3>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Open Developer Settings</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Log in to your Shopify Admin page. Navigate to <strong>Settings</strong> (bottom-left gear icon) &rarr;{" "}
                    <strong>Apps and sales channels</strong> &rarr; <strong>Develop apps</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Create the App Instance</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Click <strong>Create an app</strong>. Enter an App Name (e.g., <code>ExitEcom Analytics</code>) and select your App developer account. Click <strong>Create app</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Configure Required Permissions (API Scopes)</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Click <strong>Configure Admin API integration</strong>. Under Admin API access scopes, you MUST select read permissions for:
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded text-[11px] font-mono text-[var(--text-primary)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                      read_orders
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded text-[11px] font-mono text-[var(--text-primary)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                      read_products
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded text-[11px] font-mono text-[var(--text-primary)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                      read_analytics
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded text-[11px] font-mono text-[var(--text-primary)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                      read_customers
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2">Click <strong>Save</strong> at the top right to commit these scopes.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  4
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Install App & Copy Access Token</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Navigate to the <strong>API credentials</strong> tab. Click <strong>Install app</strong> and confirm. Copy the generated <strong>Admin API Access Token</strong> (starts with <code>shpat_</code>).
                  </p>
                  <div className="mt-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Important:</strong> The access token is revealed only ONCE. Store it securely. If lost, you will need to uninstall and reinstall the app to generate a new one.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Syncing Progress View */}
      {(syncStatus === "connecting" || syncStatus === "fetching" || syncStatus === "normalizing") && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center justify-center text-center gap-8 shadow-lg my-12 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--bg-secondary)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-1000 ease-out"
              style={{
                width:
                  syncStatus === "connecting"
                    ? "20%"
                    : syncStatus === "fetching"
                    ? "55%"
                    : "85%",
              }}
            ></div>
          </div>

          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold font-display">
              {syncStatus === "connecting" && "Initializing Connection..."}
              {syncStatus === "fetching" && "Syncing Customer Logs..."}
              {syncStatus === "normalizing" && "Synthesizing M&A Insights..."}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {syncStatus === "connecting" && "Establishing SSL handshakes with Shopify API secure gateway..."}
              {syncStatus === "fetching" && "Pulling order metrics, line-item arrays, and product catalog variants..."}
              {syncStatus === "normalizing" && "Gemini AI is normalizing currency values, calculating product concentration, cohort repeat rates, and valuing assets..."}
            </p>
          </div>

          {/* Micro-animations list */}
          <div className="w-full max-w-sm flex flex-col gap-2 mt-2 text-left text-xs bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] font-medium">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>🚀 Shopify Gateway Handshake</span>
              <span className="font-mono text-[10px] text-[var(--positive)]">DONE</span>
            </div>
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>📦 Fetching Product Catalog</span>
              <span className="font-mono text-[10px]">
                {syncStatus === "connecting" ? "PENDING" : "DONE"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>📋 Mapping Customer Orders</span>
              <span className="font-mono text-[10px]">
                {syncStatus === "connecting"
                  ? "PENDING"
                  : syncStatus === "fetching"
                  ? "SYNCING"
                  : "DONE"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>🤖 Gemini AI Normalization</span>
              <span className="font-mono text-[10px]">
                {syncStatus === "normalizing" ? "RUNNING" : "PENDING"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Success View */}
      {syncStatus === "success" && syncedData && (
        <div className="max-w-4xl mx-auto flex flex-col gap-8 my-6">
          <div className="card-light p-8 text-center flex flex-col items-center gap-5 shadow-lg bg-white border-2 border-[var(--positive)]/30">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center border border-emerald-300">
              <CheckCircle2 className="w-8 h-8 text-[var(--positive)]" />
            </div>

            <div>
              <h3 className="text-2xl font-bold font-display">Shopify Connected & Normalized</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                Gemini successfully normalized metrics for <strong>{syncedData.name}</strong>. Your Exit Score and valuation range are updated.
              </p>
            </div>

            <div className="w-full grid sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left flex flex-col justify-between">
                <div>
                  <div className="label-caps flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[var(--accent)]" /> Exit Readiness Score
                  </div>
                  <div className="font-display text-3xl font-bold text-[var(--text-primary)] mt-3">
                    {syncedData.exitScore} / 100
                  </div>
                </div>
                <div className="text-[10px] text-[var(--accent)] mt-3 font-semibold tracking-wider uppercase">
                  {syncedData.scoreTier}
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left flex flex-col justify-between">
                <div>
                  <div className="label-caps flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-[var(--accent)]" /> Projected SDE
                  </div>
                  <div className="font-display text-3xl font-bold text-[var(--text-primary)] mt-3">
                    £{(syncedData.sde / 1000).toFixed(0)}k
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-3 leading-tight">
                  Based on recent order volumes and standard margins
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left flex flex-col justify-between">
                <div>
                  <div className="label-caps flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" /> Valuation Midpoint
                  </div>
                  <div className="font-display text-3xl font-bold text-[var(--accent)] mt-3">
                    £{(syncedData.valuationMid / 1000).toFixed(0)}k
                  </div>
                </div>
                <div className="text-[10px] text-[var(--positive)] mt-3 font-semibold">
                  ✓ Multiple of {syncedData.currentMultiple.toFixed(1)}x SDE
                </div>
              </div>
            </div>

            <div className="w-full grid sm:grid-cols-2 gap-4">
              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left">
                <div className="label-caps flex items-center gap-1.5 mb-2">
                  <User className="w-3.5 h-3.5 text-[var(--accent)]" /> Customer Economics
                </div>
                <div className="text-sm font-medium mt-1">
                  Repeat Purchase Rate: <span className="text-[var(--accent)] font-semibold">{(syncedData.repeatRate * 100).toFixed(0)}%</span>
                </div>
                <div className="text-sm font-medium mt-1">
                  Average Order Value (AOV): <span className="text-[var(--accent)] font-semibold">£{syncedData.avgOrderValue.toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left">
                <div className="label-caps flex items-center gap-1.5 mb-2">
                  <Package className="w-3.5 h-3.5 text-[var(--accent)]" /> SKU Logistics
                </div>
                <div className="text-sm font-medium mt-1">
                  Product Concentration: <span className="text-[var(--accent)] font-semibold">{(syncedData.topProductShare * 100).toFixed(0)}%</span>
                </div>
                <div className="text-sm font-medium mt-1">
                  Data Confidence Level: <span className="text-[var(--positive)] font-semibold">{syncedData.dataConfidence}%</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 w-full mt-6">
              <button
                onClick={() => navigate({ to: "/app/dashboard" })}
                className="flex-1 btn-primary py-3 rounded-md justify-center font-semibold text-sm"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => setSyncStatus("idle")}
                className="flex-1 btn-ghost-dark py-3 rounded-md justify-center font-medium text-sm cursor-pointer"
              >
                Reconnect Store
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error View */}
      {syncStatus === "error" && (
        <div className="card-light max-w-xl mx-auto p-8 text-center flex flex-col items-center gap-5 shadow-lg my-12 border-2 border-[var(--risk-critical)]/30">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center border border-red-200">
            <AlertCircle className="w-8 h-8 text-[var(--risk-critical)]" />
          </div>

          <div>
            <h3 className="text-xl font-bold font-display">Connection Sync Failed</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              We encountered an issue while communicating with your Shopify store or normalizing the data.
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
              to="/app/data-sources"
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
