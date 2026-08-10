import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw, AlertCircle, CheckCircle2, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import {
  exchangeTikTokOAuthCodeFn,
  type TikTokOAuthAccount,
} from "@/lib/tiktok";
import {
  OAUTH_MESSAGE_TYPE,
  consumeOAuthState,
  oauthLog,
  writeOAuthResult,
  type OAuthStage,
} from "@/lib/oauthResult";

// TikTok redirects here after the user approves (or denies) OAuth consent.
// Callback param is `auth_code` (not `code`) and `state` for CSRF validation.

const OAUTH_STATE_KEY = "tiktok_oauth_state";

interface CallbackSearch {
  auth_code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/_app/tiktok-oauth-callback")({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    auth_code:
      typeof search.auth_code === "string" ? search.auth_code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    error_description:
      typeof search.error_description === "string"
        ? search.error_description
        : undefined,
  }),
  component: TikTokOAuthCallback,
});

type Phase = "exchanging" | "picking" | "saving" | "error" | "success";

function TikTokOAuthCallback() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { syncTikTokViaOAuth } = useBusinessData();

  const [phase, setPhase] = useState<Phase>("exchanging");
  const [errorMessage, setErrorMessage] = useState("");
  const [accounts, setAccounts] = useState<TikTokOAuthAccount[]>([]);
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
    oauthLog("tiktok", `done: ${status}`, {
      stage,
      hasOpener: Boolean(window.opener),
    });

    writeOAuthResult({ provider: "tiktok", status, stage, message });

    try {
      window.opener?.postMessage(
        { type: OAUTH_MESSAGE_TYPE, provider: "tiktok", status, message },
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

  const pickAccount = async (account: TikTokOAuthAccount) => {
    setPhase("saving");
    stageRef.current = "pulling";
    oauthLog("tiktok", "account picked", {
      advertiserId: account.advertiserId,
    });
    try {
      stageRef.current = "committing";
      await syncTikTokViaOAuth(account.advertiserId, tokenRef.current);
      done("success");
    } catch (err) {
      fail(
        (err instanceof Error && err.message) ||
          "Could not pull data for that advertiser account.",
      );
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (search.error) {
      fail(
        search.error_description ||
          "TikTok authorisation was cancelled or denied.",
      );
      return;
    }

    if (
      !search.auth_code ||
      !consumeOAuthState(OAUTH_STATE_KEY, search.state)
    ) {
      fail(
        "This authorisation link is invalid or expired. Please start the connection again.",
      );
      return;
    }

    oauthLog("tiktok", "callback mounted", {
      hasOpener: Boolean(window.opener),
    });
    exchangeTikTokOAuthCodeFn({ data: { authCode: search.auth_code } })
      .then(async ({ accessToken, accounts }) => {
        tokenRef.current = accessToken;
        stageRef.current = "listing";
        oauthLog("tiktok", "exchange ok", { accounts: accounts.length });
        if (accounts.length === 0) {
          fail("No advertiser accounts were found for this TikTok login.");
          return;
        }
        if (accounts.length === 1) {
          await pickAccount(accounts[0]);
          return;
        }
        stageRef.current = "picking";
        setAccounts(accounts);
        setPhase("picking");
      })
      .catch((err) =>
        fail(
          (err instanceof Error && err.message) ||
            "Could not complete the TikTok connection.",
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Link
          to="/tiktok-connect"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          Connect TikTok Ads
        </Link>
      </div>

      <PageHeader
        title="Connecting TikTok Ads"
        subtitle="Finishing your TikTok authorisation and pulling your ad data."
      />

      {(phase === "exchanging" || phase === "saving") && (
        <div className="card-light max-w-xl mx-auto p-10 flex flex-col items-center justify-center text-center gap-6 shadow-lg my-12">
          <div className="w-16 h-16 rounded-full bg-[var(--blue-100)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-semibold font-display">
              {phase === "exchanging"
                ? "Authorising with TikTok…"
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
            <h3 className="text-lg font-semibold">
              Choose an advertiser account
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Your TikTok login has access to several advertiser accounts. Pick
              the one to analyse.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <button
                key={a.advertiserId}
                type="button"
                onClick={() => pickAccount(a)}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-[var(--border-warm)] text-left hover:border-[var(--accent)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Megaphone className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-[11px] text-[var(--text-muted)] font-mono">
                      {a.advertiserId} · {a.currency} · {a.accountStatus}
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
              TikTok Ads connected
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              Your ad data has been saved. You can close this window — or
              continue below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/tiktok-data" })}
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            View TikTok data
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
              We couldn't complete the TikTok connection
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
            to="/tiktok-connect"
            className="btn-primary py-3 px-6 rounded-md justify-center font-semibold text-sm"
          >
            Try Again
          </Link>
        </div>
      )}
    </>
  );
}
