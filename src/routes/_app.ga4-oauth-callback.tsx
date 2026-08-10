import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw, AlertCircle, CheckCircle2, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { exchangeGA4OAuthCodeFn, type GA4OAuthProperty } from "@/lib/ga4";
import {
  OAUTH_MESSAGE_TYPE,
  consumeOAuthState,
  oauthLog,
  writeOAuthResult,
  type OAuthStage,
} from "@/lib/oauthResult";

// Google redirects here after the user approves (or denies) the OAuth consent.
// Authenticated route under the pathless _app layout — the round-trip preserves
// the Supabase session. We validate CSRF state, exchange the code for a refresh
// token, let the user pick a GA4 property, then run the normal pull + commit.

const OAUTH_STATE_KEY = "ga4_oauth_state";

interface CallbackSearch {
  code?: string;
  state?: string;
  error?: string;
}

export const Route = createFileRoute("/_app/ga4-oauth-callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: GA4OAuthCallback,
});

type Phase = "exchanging" | "picking" | "saving" | "error" | "success";

function GA4OAuthCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { syncGA4ViaOAuth } = useBusinessData();

  const [phase, setPhase] = useState<Phase>("exchanging");
  const [errorMessage, setErrorMessage] = useState("");
  const [properties, setProperties] = useState<GA4OAuthProperty[]>([]);
  const tokenRef = useRef<string>("");
  const ran = useRef(false);
  const stageRef = useRef<OAuthStage>("exchanging");

  /**
   * Terminal handler. The localStorage record is written FIRST — it's the only
   * signal that survives both a severed `window.opener` and the parent's
   * close-poll racing our postMessage.
   */
  const done = (status: "success" | "error", message?: string) => {
    const stage = status === "success" ? "done" : stageRef.current;
    oauthLog("ga4", `done: ${status}`, {
      stage,
      hasOpener: Boolean(window.opener),
    });

    writeOAuthResult({ provider: "ga4", status, stage, message });

    try {
      window.opener?.postMessage(
        { type: OAUTH_MESSAGE_TYPE, provider: "ga4", status, message },
        window.location.origin,
      );
    } catch {
      // Opener gone — the storage record already covers us.
    }

    if (status === "success") {
      setPhase("success");
    } else {
      setErrorMessage(message ?? "");
      setPhase("error");
    }
    window.close();
  };

  const fail = (msg: string) => done("error", msg);

  const pickProperty = async (property: GA4OAuthProperty) => {
    setPhase("saving");
    stageRef.current = "pulling";
    oauthLog("ga4", "property picked", { propertyId: property.propertyId });
    try {
      stageRef.current = "committing";
      await syncGA4ViaOAuth(property.propertyId, tokenRef.current);
      done("success");
    } catch (err) {
      fail(
        (err instanceof Error && err.message) ||
          "Could not pull data for that property.",
      );
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (search.error) {
      fail("Google authorisation was cancelled or denied.");
      return;
    }

    if (!search.code || !consumeOAuthState(OAUTH_STATE_KEY, search.state)) {
      fail(
        "This authorisation link is invalid or expired. Please start the connection again.",
      );
      return;
    }

    oauthLog("ga4", "callback mounted", {
      hasOpener: Boolean(window.opener),
    });
    exchangeGA4OAuthCodeFn({ data: { code: search.code } })
      .then(async ({ refreshToken, properties }) => {
        tokenRef.current = refreshToken;
        stageRef.current = "listing";
        oauthLog("ga4", "exchange ok", { properties: properties.length });
        if (properties.length === 0) {
          fail(
            "No Google Analytics 4 properties were found for this login. Make sure the account has access to a GA4 property.",
          );
          return;
        }
        if (properties.length === 1) {
          await pickProperty(properties[0]);
          return;
        }
        stageRef.current = "picking";
        setProperties(properties);
        setPhase("picking");
      })
      .catch((err) =>
        fail(
          (err instanceof Error && err.message) ||
            "Could not complete the GA4 connection.",
        ),
      );
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/ga4-connect"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          Connect Google Analytics 4
        </Link>
      </div>

      <PageHeader
        title="Connecting Google Analytics 4"
        subtitle="Finishing your Google authorisation and pulling your traffic data."
      />

      {(phase === "exchanging" || phase === "saving") && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center justify-center text-center gap-6 shadow-lg my-12">
          <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-semibold font-display">
              {phase === "exchanging"
                ? "Authorising with Google…"
                : "Pulling your traffic data…"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {phase === "exchanging"
                ? "Exchanging your authorisation for a secure refresh token."
                : "Fetching sessions, conversions and channel performance, then storing it against your account."}
            </p>
          </div>
        </div>
      )}

      {phase === "picking" && (
        <div className="max-w-xl mx-auto card-light p-6 md:p-8 flex flex-col gap-5 my-8">
          <div>
            <h3 className="text-lg font-semibold">Choose a property</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Your Google login has access to several GA4 properties. Pick the
              one to analyse.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {properties.map((p) => (
              <button
                key={p.propertyId}
                type="button"
                onClick={() => pickProperty(p)}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-[var(--border-warm)] text-left hover:border-[var(--accent)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <BarChart3 className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-[11px] text-[var(--text-muted)] font-mono">
                      {p.propertyId}
                      {p.account ? ` · ${p.account}` : ""}
                    </span>
                  </span>
                </span>
                <CheckCircle2 className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="card-light max-w-xl mx-auto p-10 text-center flex flex-col items-center gap-5 shadow-lg my-12">
          <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center border border-green-200">
            <CheckCircle2 className="w-8 h-8 text-[var(--success,#16a34a)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-display">GA4 connected</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              Your analytics data has been saved. You can close this window — or
              continue below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/ga4-data" })}
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            View GA4 data
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="card-light max-w-xl mx-auto p-8 text-center flex flex-col items-center gap-5 shadow-lg my-12 border-2 border-[var(--risk-critical)]/30">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center border border-red-200">
            <AlertCircle className="w-8 h-8 text-[var(--risk-critical)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-display">
              Connection failed
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              We couldn't complete the GA4 connection
              {stageRef.current !== "done" ? (
                <>
                  {" "}
                  — it failed at the{" "}
                  <span className="font-medium">{stageRef.current}</span> step.
                </>
              ) : (
                "."
              )}
            </p>
          </div>
          <div className="w-full p-4 bg-red-50 border border-red-100 rounded text-left text-xs font-mono text-[var(--risk-critical)] overflow-x-auto max-h-40">
            {errorMessage}
          </div>
          <Link
            to="/ga4-connect"
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            Try Again
          </Link>
        </div>
      )}
    </>
  );
}
