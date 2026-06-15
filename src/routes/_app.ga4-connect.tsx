import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Users,
  Target,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { getGA4OAuthUrlFn, type GA4SyncResult } from "@/lib/ga4";
import { toast } from "sonner";

type ConnectMethod = "oauth" | "manual";

export const Route = createFileRoute("/_app/ga4-connect")({
  component: GA4Connect,
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// localStorage key holding the CSRF state we send to Google; the callback route
// validates the returned `state` against it.
const OAUTH_STATE_KEY = "ga4_oauth_state";

function GA4Connect() {
  const navigate = useNavigate();
  const { syncGA4 } = useBusinessData();

  const [method, setMethod] = useState<ConnectMethod>("oauth");

  // Manual path — a GA4 property id + a refresh token the user generated.
  const [propertyId, setPropertyId] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  // OAuth path — the Google consent URL is built server-side (client id from env).
  const [oauth, setOauth] = useState<{
    loading: boolean;
    configured: boolean;
    url: string | null;
  }>({ loading: true, configured: false, url: null });

  const [syncStatus, setSyncStatus] = useState<
    "idle" | "connecting" | "fetching" | "saving" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<GA4SyncResult | null>(null);

  useEffect(() => {
    const state = crypto.randomUUID();
    localStorage.setItem(OAUTH_STATE_KEY, state);
    getGA4OAuthUrlFn({ data: { state } })
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
        navigate({ to: "/ga4-data" });
      } else {
        setSyncStatus("error");
        setErrorMessage(
          e.data.message || "Authorization failed. Please try again.",
        );
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
    pull: () => ReturnType<typeof syncGA4>,
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
      toast.success("Google Analytics 4 connected. Data synced.");
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
      setErrorMessage((err instanceof Error && err.message) || fallbackError);
      toast.error("Connection failed.");
    }
  };

  const handleManualSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId.trim() || !refreshToken.trim()) {
      toast.error("Enter both your property id and refresh token.");
      return;
    }
    await runSync(
      () => syncGA4(propertyId.trim(), refreshToken.trim()),
      "Could not connect to Google Analytics. Please check your credentials.",
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
        title="Connect Google Analytics 4"
        subtitle="We authenticate, pull your sessions, conversions and traffic-channel mix, and store it securely. This shows buyers your traffic quality and channel diversification for the Exit Score."
      />

      {syncStatus === "idle" && (
        <>
          {/* Method selector */}
          <div className="inline-flex p-1 mb-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-warm)] gap-1">
            <button
              type="button"
              onClick={() => setMethod("oauth")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                method === "oauth"
                  ? "bg-white text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              OAuth
            </button>
            <button
              type="button"
              onClick={() => setMethod("manual")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                method === "manual"
                  ? "bg-white text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Manual
            </button>
          </div>

          {method === "oauth" && (
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              {/* OAuth start */}
              <div className="lg:col-span-5 card-light p-6 md:p-8 flex flex-col gap-6">
                <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-warm)]">
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center text-[var(--accent)]">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold leading-tight">
                      Connect with Google
                    </h3>
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
                      <ExternalLink className="w-4 h-4 text-white" /> Continue
                      with Google
                    </button>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      You'll approve read-only access to your Google Analytics
                      data, then come straight back here — we pull your data
                      automatically.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>
                        OAuth isn't configured on this deployment.
                      </strong>{" "}
                      Use the <strong>Manual</strong> method instead, or set{" "}
                      <code>GOOGLE_ADS_CLIENT_ID</code>,{" "}
                      <code>GOOGLE_ADS_CLIENT_SECRET</code> and{" "}
                      <code>GA4_OAUTH_REDIRECT_URI</code> in the server
                      environment.
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] justify-center pt-2 text-center">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Read-only. We only request the Analytics read scope, and your
                  token is stored securely against your account.
                </div>
              </div>

              {/* Guide */}
              <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
                <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
                  How OAuth works
                </h3>

                <div className="flex flex-col gap-5">
                  {[
                    {
                      n: 1,
                      h: "Continue with Google",
                      b: (
                        <>
                          Click <strong>Continue with Google</strong> — you go
                          straight to Google to approve read-only access to your
                          Analytics data.
                        </>
                      ),
                    },
                    {
                      n: 2,
                      h: "Approve the Analytics scope",
                      b: (
                        <>
                          Google asks you to grant read access to your Analytics
                          account. Approve it and you're redirected back.
                        </>
                      ),
                    },
                    {
                      n: 3,
                      h: "Pick your property",
                      b: (
                        <>
                          If your login has more than one GA4 property, choose
                          which one to analyse. Otherwise we proceed
                          automatically.
                        </>
                      ),
                    },
                    {
                      n: 4,
                      h: "That's it",
                      b: (
                        <>
                          We pull your sessions, conversions and channel mix and
                          store it against your account — no token to copy or
                          paste.
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
                      <strong>Tip:</strong> Your Google Cloud project needs both
                      the <strong>Analytics Data API</strong> and{" "}
                      <strong>Analytics Admin API</strong> enabled for the
                      connection and property list to work.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {method === "manual" && (
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              {/* Manual form */}
              <div className="lg:col-span-5 card-light p-6 md:p-8 flex flex-col gap-6">
                <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-warm)]">
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-100)] flex items-center justify-center text-[var(--accent)]">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold leading-tight">
                      Manual credentials
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Paste a property id + refresh token you generated
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleManualSync}
                  className="flex flex-col gap-5"
                >
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      GA4 Property ID
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="123456789"
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value)}
                      className="w-full font-mono"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                      The numeric property id from Analytics Admin → Property
                      Settings (not the "G-" measurement id).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Refresh Token
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="1//0g..."
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                      className="w-full font-mono"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                      A refresh token for the <code>analytics.readonly</code>{" "}
                      scope (e.g. from the OAuth Playground).
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
                  Read-only. We only read your Analytics reports.
                </div>
              </div>

              {/* Guide */}
              <div className="lg:col-span-7 card-light p-6 md:p-8 flex flex-col gap-6">
                <h3 className="text-xl font-semibold border-b border-[var(--border-warm)] pb-3">
                  How to get a refresh token
                </h3>

                <div className="flex flex-col gap-5">
                  {[
                    {
                      n: 1,
                      h: "Use the OAuth Playground",
                      b: (
                        <>
                          Open the Google OAuth Playground, set your own client
                          id/secret, and authorise the{" "}
                          <code>
                            https://www.googleapis.com/auth/analytics.readonly
                          </code>{" "}
                          scope.
                        </>
                      ),
                    },
                    {
                      n: 2,
                      h: "Exchange for a refresh token",
                      b: (
                        <>
                          Exchange the authorisation code for tokens and copy
                          the <strong>refresh token</strong>.
                        </>
                      ),
                    },
                    {
                      n: 3,
                      h: "Copy your property id",
                      b: (
                        <>
                          In Analytics, open Admin → Property Settings and copy
                          the numeric <strong>property id</strong>.
                        </>
                      ),
                    },
                    {
                      n: 4,
                      h: "Paste them here",
                      b: (
                        <>
                          Enter the <strong>property id</strong> and{" "}
                          <strong>refresh token</strong>, then click{" "}
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
                      <strong>Tip:</strong> Use a property id or refresh token
                      containing "demo" to preview with sandbox data.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
              {syncStatus === "connecting" && "Authenticating with Google…"}
              {syncStatus === "fetching" && "Pulling your traffic data…"}
              {syncStatus === "saving" && "Saving securely…"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {syncStatus === "connecting" && "Verifying your credentials."}
              {syncStatus === "fetching" &&
                "Fetching sessions, conversions and channel performance for the last 12 months."}
              {syncStatus === "saving" &&
                "Storing the raw data. No report is generated — you run those on demand."}
            </p>
          </div>
        </div>
      )}

      {/* Success */}
      {syncStatus === "success" && summary && (
        <div className="max-w-3xl mx-auto flex flex-col gap-6 my-6">
          <div className="card-light p-8 text-center flex flex-col items-center gap-5 shadow-lg bg-white border-2 border-[var(--positive)]/30">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center border border-emerald-300">
              <CheckCircle2 className="w-8 h-8 text-[var(--positive)]" />
            </div>

            <div>
              <h3 className="text-2xl font-bold font-display">
                {summary.account.name || "Your GA4 property"} is connected
              </h3>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                We pulled and stored your traffic data. Nothing has been
                analysed yet — run a report whenever you're ready.
              </p>
            </div>

            <div className="w-full grid sm:grid-cols-3 gap-4 mt-2">
              <Stat
                icon={<Users className="w-4 h-4 text-[var(--accent)]" />}
                label="Sessions (12mo)"
                value={summary.totals.sessions.toLocaleString()}
              />
              <Stat
                icon={<Target className="w-4 h-4 text-[var(--accent)]" />}
                label="Conv. rate"
                value={`${(summary.totals.conversionRate * 100).toFixed(1)}%`}
                note="conversions ÷ sessions"
              />
              <Stat
                icon={<BarChart3 className="w-4 h-4 text-[var(--accent)]" />}
                label="Channels"
                value={summary.channels.length.toLocaleString()}
                note={summary.capped.channels ? "capped" : undefined}
              />
            </div>

            <div className="w-full flex items-center justify-center gap-4 text-xs text-[var(--text-muted)] mt-1">
              <span>
                {summary.range.since} → {summary.range.until}
              </span>
              {summary.sandbox && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                  sandbox data
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
              <button
                onClick={() => navigate({ to: "/ga4-data" })}
                className="flex-1 btn-primary py-3 rounded-md justify-center font-semibold text-sm"
              >
                View Traffic Data
              </button>
              <button
                onClick={() => navigate({ to: "/exit-score" })}
                className="flex-1 btn-ghost-dark py-3 rounded-md justify-center font-medium text-sm cursor-pointer"
              >
                Run your report
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
              We couldn't reach Google or authenticate your credentials.
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
