import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  DollarSign,
  TrendingUp,
  Megaphone,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { getTikTokOAuthUrlFn, type TikTokSyncResult } from "@/lib/tiktok";
import { toast } from "sonner";

type ConnectMethod = "oauth" | "direct";

export const Route = createFileRoute("/_app/tiktok-connect")({
  component: TikTokConnect,
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OAUTH_STATE_KEY = "tiktok_oauth_state";

function TikTokConnect() {
  const navigate = useNavigate();
  const { syncTikTok } = useBusinessData();

  const [method, setMethod] = useState<ConnectMethod>("oauth");
  const [advertiserId, setAdvertiserId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [oauth, setOauth] = useState<{
    loading: boolean;
    configured: boolean;
    url: string | null;
  }>({ loading: true, configured: false, url: null });
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "connecting" | "fetching" | "saving" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<TikTokSyncResult | null>(null);

  useEffect(() => {
    const state = crypto.randomUUID();
    localStorage.setItem(OAUTH_STATE_KEY, state);
    getTikTokOAuthUrlFn({ data: { state } })
      .then((res) =>
        setOauth({ loading: false, configured: res.configured, url: res.url }),
      )
      .catch(() => setOauth({ loading: false, configured: false, url: null }));
  }, []);

  const handleOAuthStart = () => {
    if (!oauth.url) return;
    const popup = window.open(oauth.url, "_blank");
    if (!popup) {
      window.location.href = oauth.url;
      return;
    }
    setSyncStatus("connecting");

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "oauth_done") return;
      window.removeEventListener("message", onMessage);
      clearInterval(closedTimer);
      if (e.data.status === "success") {
        navigate({ to: "/tiktok-data" });
      } else {
        setSyncStatus("error");
        setErrorMessage(e.data.message || "Authorization failed. Please try again.");
      }
    };
    window.addEventListener("message", onMessage);

    const closedTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedTimer);
        window.removeEventListener("message", onMessage);
        setSyncStatus("idle");
      }
    }, 500);
  };

  const runSync = async (
    pull: () => ReturnType<typeof syncTikTok>,
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
      toast.success("TikTok Ads connected. Data synced.");
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage((err instanceof Error && err.message) || fallbackError);
      toast.error("Connection failed.");
    }
  };

  const handleDirectSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advertiserId.trim() || !accessToken.trim()) {
      toast.error("Enter both your advertiser id and access token.");
      return;
    }
    await runSync(
      () => syncTikTok(advertiserId.trim(), accessToken.trim()),
      "Could not connect to TikTok Ads. Please check your credentials.",
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
        title="Connect TikTok Ads"
        subtitle="We authenticate, pull your spend, ROAS and campaign performance, and store it securely. This verifies your acquisition costs and blended ROAS for the Exit Score."
      />

      {syncStatus === "idle" && (
        <>
          <div className="inline-flex p-1 mb-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-warm)] gap-1">
            {(["oauth", "direct"] as ConnectMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                  method === m
                    ? "bg-white text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {m === "oauth" ? "OAuth" : "Access token"}
              </button>
            ))}
          </div>

          {method === "direct" && (
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 card-light p-6 md:p-8 flex flex-col gap-6">
                <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-warm)]">
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center font-bold text-lg text-[var(--accent)]">
                    T
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold leading-tight">TikTok Access Token</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Use a long-lived token from TikTok Ads Manager
                    </p>
                  </div>
                </div>

                <form onSubmit={handleDirectSync} className="flex flex-col gap-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Advertiser ID
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="1234567890123"
                      value={advertiserId}
                      onChange={(e) => setAdvertiserId(e.target.value)}
                      className="w-full font-mono"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                      Found in TikTok Ads Manager &rarr; Account Settings (a 13-digit number).
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Access Token
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="Paste your long-lived access token"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="w-full font-mono"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                      Generated in the TikTok Marketing API portal under your app &rarr; Authentication.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="w-full btn-primary justify-center py-3 text-sm rounded-md shadow-md mt-2"
                  >
                    <Sparkles className="w-4 h-4 text-white" /> Connect &amp; Pull Data
                  </button>
                </form>

                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] justify-center pt-2 text-center">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Read-only. We only request reporting read access.
                </div>
              </div>

              <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
                <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
                  How to get a TikTok access token
                </h3>
                <div className="flex flex-col gap-5">
                  {[
                    {
                      n: 1,
                      h: "Open TikTok for Business",
                      b: <>Go to <strong>business-api.tiktok.com</strong>, register or sign in, and create an app under <strong>My Apps</strong>.</>,
                    },
                    {
                      n: 2,
                      h: "Add reporting permissions",
                      b: <>In your app settings, enable <strong>Ad Account Management</strong> and <strong>Reporting</strong> scopes (read-only is sufficient).</>,
                    },
                    {
                      n: 3,
                      h: "Generate a long-lived token",
                      b: <>Under <strong>Authentication &rarr; Access Token</strong>, generate a token authorised for your advertiser account. Tokens last ~365 days.</>,
                    },
                    {
                      n: 4,
                      h: "Copy your advertiser id",
                      b: <>In TikTok Ads Manager, open <strong>Account Settings</strong> and copy the 13-digit <strong>Advertiser ID</strong>.</>,
                    },
                  ].map((s) => (
                    <div key={s.n} className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                        {s.n}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{s.h}</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{s.b}</p>
                      </div>
                    </div>
                  ))}
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Tip:</strong> For the easiest setup use the <strong>OAuth</strong> tab — it connects in one click without generating a token manually.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {method === "oauth" && (
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 card-light p-6 md:p-8 flex flex-col gap-6">
                <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-warm)]">
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center font-bold text-lg text-[var(--accent)]">
                    T
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold leading-tight">Connect with TikTok</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Authorise in one click — no token to manage yourself
                    </p>
                  </div>
                </div>

                {oauth.loading ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-4">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Preparing…
                  </div>
                ) : oauth.configured ? (
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleOAuthStart}
                      className="w-full btn-primary justify-center py-3 text-sm rounded-md shadow-md"
                    >
                      <ExternalLink className="w-4 h-4 text-white" /> Continue with TikTok
                    </button>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      You'll approve read-only access on TikTok, then come straight back here — we pull your data automatically.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>OAuth isn't configured on this deployment.</strong>{" "}
                      Use the <strong>Access token</strong> tab instead, or set{" "}
                      <code>TIKTOK_APP_ID</code>, <code>TIKTOK_APP_SECRET</code> and{" "}
                      <code>TIKTOK_OAUTH_REDIRECT_URI</code> in the server environment.
                    </div>
                  </div>
                )}

                <div className="flex flex-col items-center gap-1.5 text-xs text-[var(--text-muted)] pt-2 text-center">
                  <span className="flex items-center gap-2 justify-center">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Read-only. Your token is stored securely against your account.
                  </span>
                  <Link to="/privacy" target="_blank" className="text-[var(--accent)] hover:underline">
                    Privacy Policy
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
                <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
                  How OAuth works
                </h3>
                <div className="flex flex-col gap-5">
                  {[
                    { n: 1, h: "Continue with TikTok", b: <>Click <strong>Continue with TikTok</strong> — you go straight to TikTok to approve read-only reporting access.</> },
                    { n: 2, h: "Approve access", b: <>TikTok asks you to grant access to your advertiser account. Approve and you're redirected back here automatically.</> },
                    { n: 3, h: "Pick your advertiser account", b: <>If your login has access to several advertiser accounts, choose which one to analyse. Otherwise we proceed automatically.</> },
                    { n: 4, h: "That's it", b: <>We pull your spend, ROAS and campaign performance and store it — no token to copy or paste.</> },
                  ].map((s) => (
                    <div key={s.n} className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded-full bg-[var(--blue-100)] flex items-center justify-center font-bold text-xs text-[var(--accent)] shrink-0 mt-0.5">
                        {s.n}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{s.h}</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{s.b}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {(syncStatus === "connecting" || syncStatus === "fetching" || syncStatus === "saving") && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center justify-center text-center gap-8 shadow-lg my-12 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--bg-secondary)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-1000 ease-out"
              style={{
                width: syncStatus === "connecting" ? "25%" : syncStatus === "fetching" ? "70%" : "92%",
              }}
            />
          </div>
          <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-semibold font-display">
              {syncStatus === "connecting" && "Authenticating with TikTok…"}
              {syncStatus === "fetching" && "Pulling your ad data…"}
              {syncStatus === "saving" && "Saving securely…"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {syncStatus === "connecting" && "Verifying your access token and advertiser account."}
              {syncStatus === "fetching" && "Fetching spend, conversions and campaign performance for the last 12 months."}
              {syncStatus === "saving" && "Storing the raw data. No report is generated — you run those on demand."}
            </p>
          </div>
          <div className="w-full max-w-sm flex flex-col gap-2 mt-2 text-left text-xs bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] font-medium">
            <Step label="🔐 Authenticate" done={syncStatus !== "connecting"} />
            <Step label="📊 Pull spend, ROAS & campaigns" done={syncStatus === "saving"} running={syncStatus === "fetching"} />
            <Step label="💾 Persist to your account" running={syncStatus === "saving"} />
          </div>
        </div>
      )}

      {syncStatus === "success" && summary && (
        <div className="max-w-3xl mx-auto flex flex-col gap-6 my-6">
          <div className="card-light p-8 text-center flex flex-col items-center gap-5 shadow-lg bg-white border-2 border-[var(--positive)]/30">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center border border-emerald-300">
              <CheckCircle2 className="w-8 h-8 text-[var(--positive)]" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-display">
                {summary.account.name || "Your TikTok account"} is connected
              </h3>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                We pulled and stored your ad data. Nothing has been analysed yet — run a report whenever you're ready.
              </p>
            </div>
            <div className="w-full grid sm:grid-cols-3 gap-4 mt-2">
              <Stat icon={<DollarSign className="w-4 h-4 text-[var(--accent)]" />} label="Spend (12mo)" value={`${summary.account.currency} ${summary.totals.spend.toLocaleString()}`} />
              <Stat icon={<TrendingUp className="w-4 h-4 text-[var(--accent)]" />} label="ROAS" value={`${summary.totals.roas.toFixed(2)}x`} note="self-reported by TikTok" />
              <Stat icon={<Megaphone className="w-4 h-4 text-[var(--accent)]" />} label="Campaigns" value={summary.campaigns.length.toLocaleString()} note={summary.capped.campaigns ? "capped" : undefined} />
            </div>
            <div className="w-full flex items-center justify-center gap-4 text-xs text-[var(--text-muted)] mt-1">
              <span>{summary.range.since} → {summary.range.until}</span>
              {summary.sandbox && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">sandbox data</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
              <button onClick={() => navigate({ to: "/tiktok-data" })} className="flex-1 btn-primary py-3 rounded-md justify-center font-semibold text-sm">
                View Ad Data
              </button>
              <button onClick={() => navigate({ to: "/exit-score" })} className="flex-1 btn-ghost-dark py-3 rounded-md justify-center font-medium text-sm cursor-pointer">
                Run your report
              </button>
            </div>
          </div>
        </div>
      )}

      {syncStatus === "error" && (
        <div className="card-light max-w-xl mx-auto p-8 text-center flex flex-col items-center gap-5 shadow-lg my-12 border-2 border-[var(--risk-critical)]/30">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center border border-red-200">
            <AlertCircle className="w-8 h-8 text-[var(--risk-critical)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-display">Connection failed</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">We couldn't reach TikTok or authenticate the token.</p>
          </div>
          <div className="w-full p-4 bg-red-50 border border-red-100 rounded text-left text-xs font-mono text-[var(--risk-critical)] overflow-x-auto max-h-40">
            {errorMessage}
          </div>
          <div className="flex gap-4 w-full mt-2">
            <button onClick={() => setSyncStatus("idle")} className="flex-1 btn-primary py-3 rounded-md justify-center font-semibold text-sm">
              Try Again
            </button>
            <Link to="/data-sources" className="flex-1 btn-ghost-dark py-3 rounded-md justify-center font-medium text-sm text-center">
              Cancel
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ label, done, running }: { label: string; done?: boolean; running?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[var(--text-secondary)]">
      <span>{label}</span>
      <span className="font-mono text-[10px]">
        {done ? <span className="text-[var(--positive)]">DONE</span> : running ? "RUNNING" : "PENDING"}
      </span>
    </div>
  );
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="bg-[var(--bg-primary)] p-4 rounded-md border border-[var(--border-warm)] text-left">
      <div className="label-caps flex items-center gap-1.5">{icon} {label}</div>
      <div className="font-display text-3xl font-bold text-[var(--text-primary)] mt-3">{value}</div>
      {note && <div className="text-[10px] text-[var(--text-muted)] mt-1">{note}</div>}
    </div>
  );
}
