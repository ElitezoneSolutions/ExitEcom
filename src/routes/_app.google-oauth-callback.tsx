import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw, AlertCircle, CheckCircle2, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import {
  exchangeGoogleOAuthCodeFn,
  type GoogleOAuthAccount,
} from "@/lib/google";
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
// token, let the user pick a customer, then run the normal pull + commit.

const OAUTH_STATE_KEY = "google_oauth_state";

interface CallbackSearch {
  code?: string;
  state?: string;
  error?: string;
}

export const Route = createFileRoute("/_app/google-oauth-callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: GoogleOAuthCallback,
});

type Phase = "exchanging" | "picking" | "saving" | "error" | "success";

function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { syncGoogleViaOAuth } = useBusinessData();

  const [phase, setPhase] = useState<Phase>("exchanging");
  const [errorMessage, setErrorMessage] = useState("");
  const [accounts, setAccounts] = useState<GoogleOAuthAccount[]>([]);
  const tokenRef = useRef<string>("");
  const ran = useRef(false);
  // Tracks how far the flow got, so a failure names the step that broke rather
  // than showing one undifferentiated "connection failed" card.
  const stageRef = useRef<OAuthStage>("exchanging");

  /**
   * Terminal handler. Order matters: the localStorage record is written FIRST,
   * because it's the only signal that survives both a severed `window.opener`
   * (Google's COOP) and the parent's close-poll racing our postMessage.
   */
  const done = (status: "success" | "error", message?: string) => {
    const stage = status === "success" ? "done" : stageRef.current;
    oauthLog("google", `done: ${status}`, {
      stage,
      hasOpener: Boolean(window.opener),
    });

    writeOAuthResult({ provider: "google", status, stage, message });

    try {
      window.opener?.postMessage(
        { type: OAUTH_MESSAGE_TYPE, provider: "google", status, message },
        window.location.origin,
      );
    } catch {
      // Opener gone or cross-origin — the storage record already covers us.
    }

    // Show the outcome in-tab first, so that if the browser refuses to close
    // this window (no opener, or a user-opened tab) the user isn't stranded on
    // a spinner with no idea what happened.
    if (status === "success") {
      setPhase("success");
    } else {
      setErrorMessage(message ?? "");
      setPhase("error");
    }
    window.close();
  };

  const fail = (msg: string) => done("error", msg);

  const pickAccount = async (account: GoogleOAuthAccount) => {
    setPhase("saving");
    stageRef.current = "pulling";
    oauthLog("google", "account picked", {
      customerId: account.customerId,
      loginCustomerId: account.loginCustomerId,
    });
    try {
      stageRef.current = "committing";
      await syncGoogleViaOAuth(
        account.customerId,
        tokenRef.current,
        account.loginCustomerId,
      );
      done("success");
    } catch (err) {
      fail(
        (err instanceof Error && err.message) ||
          "Could not pull data for that account.",
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

    oauthLog("google", "callback mounted", {
      hasOpener: Boolean(window.opener),
    });
    stageRef.current = "exchanging";
    exchangeGoogleOAuthCodeFn({ data: { code: search.code } })
      .then(async ({ refreshToken, customers }) => {
        tokenRef.current = refreshToken;
        stageRef.current = "listing";
        oauthLog("google", "exchange ok", { customers: customers.length });
        if (customers.length === 0) {
          fail(
            "No Google Ads accounts were found for this login. Make sure the account has access to a Google Ads account.",
          );
          return;
        }
        if (customers.length === 1) {
          await pickAccount(customers[0]);
          return;
        }
        stageRef.current = "picking";
        setAccounts(customers);
        setPhase("picking");
      })
      .catch((err) =>
        fail(
          (err instanceof Error && err.message) ||
            "Could not complete the Google connection.",
        ),
      );
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/google-connect"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          Connect Google Ads
        </Link>
      </div>

      <PageHeader
        title="Connecting Google Ads"
        subtitle="Finishing your Google authorisation and pulling your ad data."
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
                : "Pulling your ad data…"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {phase === "exchanging"
                ? "Exchanging your authorisation for a secure refresh token."
                : "Fetching spend, ROAS and campaign performance, then storing it against your account."}
            </p>
          </div>
        </div>
      )}

      {phase === "picking" && (
        <div className="max-w-xl mx-auto card-light p-6 md:p-8 flex flex-col gap-5 my-8">
          <div>
            <h3 className="text-lg font-semibold">Choose an account</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Your Google login has access to several Google Ads accounts. Pick
              the one to analyse.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <button
                key={a.customerId}
                type="button"
                onClick={() => pickAccount(a)}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-[var(--border-warm)] text-left hover:border-[var(--accent)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Megaphone className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-[11px] text-[var(--text-muted)] font-mono">
                      {a.customerId} · {a.currency} · {a.accountStatus}
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
            <h3 className="text-xl font-bold font-display">
              Google Ads connected
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              Your ad data has been saved. You can close this window — or
              continue below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/google-data" })}
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            View Google data
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
              We couldn't complete the Google connection
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
            to="/google-connect"
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            Try Again
          </Link>
        </div>
      )}
    </>
  );
}
