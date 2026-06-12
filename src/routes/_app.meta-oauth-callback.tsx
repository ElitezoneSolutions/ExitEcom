import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw, AlertCircle, CheckCircle2, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { exchangeMetaOAuthCodeFn, type MetaOAuthAccount } from "@/lib/meta";

// Facebook redirects here after the user approves (or denies) the OAuth consent.
// The route lives under the pathless _app layout, so it's authenticated and has
// BusinessDataProvider available — the FB round-trip preserves the Supabase
// session cookie. We validate the CSRF state, exchange the code for a long-lived
// token, let the user pick an ad account, then run the normal pull + commit.

const OAUTH_STATE_KEY = "meta_oauth_state";

interface CallbackSearch {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/_app/meta-oauth-callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_description:
      typeof search.error_description === "string"
        ? search.error_description
        : undefined,
  }),
  component: MetaOAuthCallback,
});

type Phase = "exchanging" | "picking" | "saving" | "error";

function MetaOAuthCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { syncMetaViaOAuth } = useBusinessData();

  const [phase, setPhase] = useState<Phase>("exchanging");
  const [errorMessage, setErrorMessage] = useState("");
  const [accounts, setAccounts] = useState<MetaOAuthAccount[]>([]);
  const tokenRef = useRef<string>("");
  const ran = useRef(false);

  const done = (status: "success" | "error", message?: string) => {
    if (window.opener) {
      window.opener.postMessage(
        { type: "oauth_done", status, message },
        window.location.origin,
      );
      window.close();
      return;
    }
    if (status === "success") {
      navigate({ to: "/meta-data" });
    } else {
      setErrorMessage(message ?? "");
      setPhase("error");
    }
  };

  const fail = (msg: string) => done("error", msg);

  // Pull + commit for a chosen account, then go to the data view.
  const pickAccount = async (account: MetaOAuthAccount) => {
    setPhase("saving");
    try {
      await syncMetaViaOAuth(account.adAccountId, tokenRef.current);
      done("success");
    } catch (err) {
      fail(
        (err instanceof Error && err.message) ||
          "Could not pull data for that ad account.",
      );
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // User denied consent (or Facebook returned an error).
    if (search.error) {
      fail(
        search.error_description ||
          "Facebook authorisation was cancelled or denied.",
      );
      return;
    }

    // CSRF: the returned state must match what we stored before redirecting.
    const expected = localStorage.getItem(OAUTH_STATE_KEY);
    localStorage.removeItem(OAUTH_STATE_KEY);
    if (!search.code || !search.state || search.state !== expected) {
      fail(
        "This authorisation link is invalid or expired. Please start the connection again.",
      );
      return;
    }

    exchangeMetaOAuthCodeFn({ data: { code: search.code } })
      .then(async ({ accessToken, accounts }) => {
        tokenRef.current = accessToken;
        if (accounts.length === 0) {
          fail(
            "No ad accounts were found for this Facebook login. Make sure the account has access to a Meta ad account.",
          );
          return;
        }
        if (accounts.length === 1) {
          await pickAccount(accounts[0]);
          return;
        }
        setAccounts(accounts);
        setPhase("picking");
      })
      .catch((err) =>
        fail(
          (err instanceof Error && err.message) ||
            "Could not complete the Facebook connection.",
        ),
      );
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/meta-connect"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          Connect Meta Ads
        </Link>
      </div>

      <PageHeader
        title="Connecting Meta Ads"
        subtitle="Finishing your Facebook authorisation and pulling your ad data."
      />

      {(phase === "exchanging" || phase === "saving") && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center justify-center text-center gap-6 shadow-lg my-12">
          <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-semibold font-display">
              {phase === "exchanging"
                ? "Authorising with Facebook…"
                : "Pulling your ad data…"}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-2.5 max-w-sm mx-auto leading-relaxed">
              {phase === "exchanging"
                ? "Exchanging your authorisation for a secure long-lived token."
                : "Fetching spend, ROAS and campaign performance, then storing it against your account."}
            </p>
          </div>
        </div>
      )}

      {phase === "picking" && (
        <div className="max-w-xl mx-auto card-light p-6 md:p-8 flex flex-col gap-5 my-8">
          <div>
            <h3 className="text-lg font-semibold">Choose an ad account</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Your Facebook login has access to several ad accounts. Pick the
              one to analyse.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <button
                key={a.adAccountId}
                type="button"
                onClick={() => pickAccount(a)}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-[var(--border-warm)] text-left hover:border-[var(--accent)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Megaphone className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-[11px] text-[var(--text-muted)] font-mono">
                      {a.adAccountId} · {a.currency} · {a.accountStatus}
                    </span>
                  </span>
                </span>
                <CheckCircle2 className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
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
              We couldn't complete the Facebook connection.
            </p>
          </div>
          <div className="w-full p-4 bg-red-50 border border-red-100 rounded text-left text-xs font-mono text-[var(--risk-critical)] overflow-x-auto max-h-40">
            {errorMessage}
          </div>
          <Link
            to="/meta-connect"
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            Try Again
          </Link>
        </div>
      )}
    </>
  );
}
