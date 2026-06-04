import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Sparkles,
  DollarSign,
  Activity,
  User,
  Package,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData, type BusinessData } from "@/hooks/useBusinessData";
import { connectShopifyViaKeyFn } from "@/lib/shopify";
import { toast } from "sonner";

export const Route = createFileRoute("/app/shopify-connect")({
  component: ShopifyConnect,
});

function ShopifyConnect() {
  const navigate = useNavigate();
  const { business, syncShopifyData } = useBusinessData();

  // Form state — the merchant pastes the key shown by the ExitEcom Analytic app.
  const [connectionKey, setConnectionKey] = useState("");

  // Sync state
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "connecting" | "fetching" | "normalizing" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [syncedData, setSyncedData] = useState<BusinessData | null>(null);

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionKey.trim()) {
      toast.error("Please paste your ExitEcom connection key.");
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

      const result = await connectShopifyViaKeyFn({
        data: {
          connectionKey: connectionKey.trim(),
          industry: business.industry,
        },
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
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage(
        (err instanceof Error && err.message) ||
          "Could not connect to Shopify. Please check your credentials.",
      );
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
                <h3 className="text-lg font-semibold leading-tight">
                  Connection Key
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Paste the key from the ExitEcom Analytic app
                </p>
              </div>
            </div>

            <form onSubmit={handleSync} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                  Connection Key
                  <span className="text-[10px] text-[var(--text-muted)] normal-case font-normal">
                    starts with eea_
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="eea_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={connectionKey}
                  onChange={(e) => setConnectionKey(e.target.value)}
                  className="w-full font-mono"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                  Get this from the <strong>ExitEcom Analytic</strong> app after
                  installing it on your Shopify store (see the guide on the
                  right).
                </p>
              </div>

              <button
                type="submit"
                className="w-full btn-primary justify-center py-3 text-sm rounded-md shadow-md mt-2"
              >
                <Sparkles className="w-4 h-4 text-white" /> Connect & Sync Store
              </button>
            </form>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] justify-center pt-2">
              <Lock className="w-3.5 h-3.5" /> Read-only. Your Shopify access
              token never leaves the ExitEcom Analytic app.
            </div>
          </div>

          {/* Guide */}
          <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
            <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
              How to get your connection key
            </h3>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-sm">
                    Install the ExitEcom Analytic app
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Add the <strong>ExitEcom Analytic</strong> app to your
                    Shopify store and approve the read-only access it requests
                    (orders, products, customers). It never gets write access.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Open the app</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    In your Shopify admin, go to <strong>Apps</strong> &rarr;{" "}
                    <strong>ExitEcom Analytic</strong>. You&apos;ll land on the
                    “Connect to ExitEcom” screen.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-sm">
                    Copy your connection key
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    The app shows a key starting with <code>eea_</code>. Click{" "}
                    <strong>Copy key</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                  4
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Paste it here</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Paste the key into the <strong>Connection Key</strong> field
                    and click <strong>Connect &amp; Sync Store</strong>.
                  </p>
                  <div className="mt-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Tip:</strong> If you regenerate the key in the
                      Shopify app, the old one stops working — paste the new key
                      here to reconnect.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Syncing Progress View */}
      {(syncStatus === "connecting" ||
        syncStatus === "fetching" ||
        syncStatus === "normalizing") && (
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
              {syncStatus === "connecting" &&
                "Establishing SSL handshakes with Shopify API secure gateway..."}
              {syncStatus === "fetching" &&
                "Pulling order metrics, line-item arrays, and product catalog variants..."}
              {syncStatus === "normalizing" &&
                "Gemini AI is normalizing currency values, calculating product concentration, cohort repeat rates, and valuing assets..."}
            </p>
          </div>

          {/* Micro-animations list */}
          <div className="w-full max-w-sm flex flex-col gap-2 mt-2 text-left text-xs bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] font-medium">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>🚀 Shopify Gateway Handshake</span>
              <span className="font-mono text-[10px] text-[var(--positive)]">
                DONE
              </span>
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
              <h3 className="text-2xl font-bold font-display">
                Shopify Connected & Normalized
              </h3>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                Gemini successfully normalized metrics for{" "}
                <strong>{syncedData.name}</strong>. Your Exit Score and
                valuation range are updated.
              </p>
            </div>

            <div className="w-full grid sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left flex flex-col justify-between">
                <div>
                  <div className="label-caps flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />{" "}
                    Exit Readiness Score
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
                    <DollarSign className="w-3.5 h-3.5 text-[var(--accent)]" />{" "}
                    Projected SDE
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
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" />{" "}
                    Valuation Midpoint
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
                  <User className="w-3.5 h-3.5 text-[var(--accent)]" /> Customer
                  Economics
                </div>
                <div className="text-sm font-medium mt-1">
                  Repeat Purchase Rate:{" "}
                  <span className="text-[var(--accent)] font-semibold">
                    {(syncedData.repeatRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-sm font-medium mt-1">
                  Average Order Value (AOV):{" "}
                  <span className="text-[var(--accent)] font-semibold">
                    £{syncedData.avgOrderValue.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left">
                <div className="label-caps flex items-center gap-1.5 mb-2">
                  <Package className="w-3.5 h-3.5 text-[var(--accent)]" /> SKU
                  Logistics
                </div>
                <div className="text-sm font-medium mt-1">
                  Product Concentration:{" "}
                  <span className="text-[var(--accent)] font-semibold">
                    {(syncedData.topProductShare * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-sm font-medium mt-1">
                  Data Confidence Level:{" "}
                  <span className="text-[var(--positive)] font-semibold">
                    {syncedData.dataConfidence}%
                  </span>
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
            <h3 className="text-xl font-bold font-display">
              Connection Sync Failed
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              We encountered an issue while communicating with your Shopify
              store or normalizing the data.
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
