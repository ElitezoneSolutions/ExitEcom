// Shared vocabulary for the connector OAuth popup handshake.
//
// The popup used to signal completion with `postMessage` alone. That drops the
// result in two real situations:
//   1. The parent polls `popup.closed` every 500ms. The popup posts and then
//      immediately calls `window.close()` — `closed` flips synchronously while
//      the message is still a queued task, so the poll can win the race, tear
//      down the listener and discard the result (including error messages).
//   2. `accounts.google.com` sends Cross-Origin-Opener-Policy, which severs
//      `window.opener` for the whole browsing context. On return to our origin
//      the popup has no opener to post to at all.
//
// So the popup also writes its outcome to localStorage before it closes. Same
// origin, so the parent can read it on the `storage` event or when it notices
// the popup has gone. Belt and braces: whichever signal lands first wins, and
// the parent latches so the other two are no-ops.

export type OAuthProvider = "google" | "ga4" | "meta" | "tiktok" | "snapchat";

/** Where a connection attempt got to. Named in error copy so a failure is self-describing. */
export type OAuthStage =
  | "exchanging"
  | "listing"
  | "picking"
  | "pulling"
  | "committing"
  | "done";

export interface OAuthResult {
  provider: OAuthProvider;
  status: "success" | "error";
  stage: OAuthStage;
  message?: string;
  at: number;
}

export const OAUTH_RESULT_KEY = "oauth_result";
export const OAUTH_LAST_ERROR_KEY = "oauth_last_error";
/** postMessage envelope type, kept for backwards compatibility with the old handshake. */
export const OAUTH_MESSAGE_TYPE = "oauth_done";

/** Results older than this are ignored — a stale record must never resolve a fresh attempt. */
const MAX_AGE_MS = 10 * 60 * 1000;

function parse(raw: string | null): OAuthResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OAuthResult;
    if (!parsed?.provider || !parsed?.status) return null;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Read the pending result for one provider, if any. Does not consume it. */
export function readOAuthResult(provider: OAuthProvider): OAuthResult | null {
  if (typeof window === "undefined") return null;
  const result = parse(window.localStorage.getItem(OAUTH_RESULT_KEY));
  return result && result.provider === provider ? result : null;
}

export function clearOAuthResult() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OAUTH_RESULT_KEY);
}

/**
 * Called by the popup, before it closes. Also records failures separately so
 * the connect page can still explain what happened on a later visit, even if
 * the parent tab was gone when the popup finished.
 */
export function writeOAuthResult(result: Omit<OAuthResult, "at">) {
  if (typeof window === "undefined") return;
  const record: OAuthResult = { ...result, at: Date.now() };
  try {
    window.localStorage.setItem(OAUTH_RESULT_KEY, JSON.stringify(record));
    if (record.status === "error") {
      window.localStorage.setItem(OAUTH_LAST_ERROR_KEY, JSON.stringify(record));
    } else {
      window.localStorage.removeItem(OAUTH_LAST_ERROR_KEY);
    }
  } catch {
    // Private-mode / quota failures must not break the flow; postMessage and
    // the parent's post-close refetch still cover us.
  }
}

export function readLastOAuthError(
  provider: OAuthProvider,
): OAuthResult | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(OAUTH_LAST_ERROR_KEY) || "null",
    ) as OAuthResult | null;
    return parsed?.provider === provider ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLastOAuthError() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OAUTH_LAST_ERROR_KEY);
}

/**
 * CSRF state handling.
 *
 * The connect page mints a fresh state on every mount, so a remount between
 * opening the popup and the callback reading the value used to invalidate a
 * perfectly good authorization. Keep a short window of recently-issued states
 * and accept any of them instead of only the newest.
 */
const MAX_REMEMBERED_STATES = 5;

export function rememberOAuthState(key: string, state: string) {
  if (typeof window === "undefined") return;
  let states: string[] = [];
  try {
    states = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(states)) states = [];
  } catch {
    states = [];
  }
  states.push(state);
  window.localStorage.setItem(
    key,
    JSON.stringify(states.slice(-MAX_REMEMBERED_STATES)),
  );
}

/**
 * Validate and consume a returned `state`. Accepts the legacy single-string
 * format so an authorization already in flight during a deploy still works.
 */
export function consumeOAuthState(key: string, state: string | undefined) {
  if (typeof window === "undefined" || !state) return false;
  const raw = window.localStorage.getItem(key);
  window.localStorage.removeItem(key);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.includes(state);
  } catch {
    // Legacy format: a bare state string.
  }
  return raw === state;
}

/** Uniform, greppable breadcrumbs — the fastest way to diagnose a prod report. */
export function oauthLog(
  provider: OAuthProvider,
  event: string,
  detail?: Record<string, unknown>,
) {
  console.info(`[oauth:${provider}] ${event}`, detail ?? "");
}
