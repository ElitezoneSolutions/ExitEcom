import { useCallback, useEffect, useRef, useState } from "react";
import {
  OAUTH_MESSAGE_TYPE,
  OAUTH_RESULT_KEY,
  clearOAuthResult,
  oauthLog,
  readOAuthResult,
  type OAuthProvider,
  type OAuthResult,
} from "@/lib/oauthResult";

/** How the outcome reached us — logged so a prod report names its own path. */
type FinishSource = "message" | "storage" | "closed-poll" | "timeout";

interface UseOAuthPopupOptions {
  provider: OAuthProvider;
  /**
   * Last-resort confirmation used when the popup closed without leaving any
   * result (COOP severing plus a failed localStorage write, or a hard crash).
   * Should refetch from the database and report whether the provider is now
   * connected — we trust the DB over any in-memory assumption.
   */
  confirmConnected: () => Promise<boolean>;
  onSuccess: () => void | Promise<void>;
  onError: (message: string) => void;
}

/** Give up on a consent flow that has clearly been abandoned. */
const TIMEOUT_MS = 5 * 60 * 1000;
const CLOSE_POLL_MS = 500;
/**
 * After `popup.closed` flips, a message posted immediately before the close may
 * still be sitting in our task queue. Wait one beat before concluding there was
 * no result — this is the exact race that used to swallow error messages.
 */
const CLOSE_GRACE_MS = 600;

/**
 * Drives a connector OAuth popup and guarantees the parent reaches a terminal
 * state. Three independent signals feed one latched `finish`: the popup's
 * postMessage, a localStorage `storage` event, and our own close-detection
 * fallback that re-reads the database.
 */
export function useOAuthPopup({
  provider,
  confirmConnected,
  onSuccess,
  onError,
}: UseOAuthPopupOptions) {
  const [connecting, setConnecting] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const finishedRef = useRef(false);

  // Always tear down listeners/timers if the page unmounts mid-flow.
  useEffect(() => () => cleanupRef.current?.(), []);

  const open = useCallback(
    (url: string) => {
      // A flow is already in progress — don't stack listeners or timers.
      if (cleanupRef.current) return;

      // A stale record from an earlier attempt must never resolve this one.
      clearOAuthResult();
      finishedRef.current = false;

      const popup = window.open(url, "_blank");
      if (!popup) {
        // Popup blocked — fall back to a full-page redirect in this tab.
        oauthLog(provider, "popup blocked, redirecting in-tab");
        window.location.href = url;
        return;
      }
      oauthLog(provider, "popup opened");
      setConnecting(true);

      // Reassigned when the close-poll first sees the popup gone.
      let graceTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        window.removeEventListener("storage", onStorage);
        clearInterval(closeTimer);
        clearTimeout(timeoutTimer);
        if (graceTimer) clearTimeout(graceTimer);
        cleanupRef.current = null;
      };

      const finish = async (
        status: "success" | "error",
        message: string,
        source: FinishSource,
      ) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        oauthLog(provider, `finish: ${status}`, { source, message });
        cleanup();
        clearOAuthResult();
        setConnecting(false);
        if (status === "success") await onSuccess();
        else onError(message);
      };

      const finishFromResult = (result: OAuthResult, source: FinishSource) =>
        finish(
          result.status,
          result.status === "error" ? describeStage(result) : "",
          source,
        );

      const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== OAUTH_MESSAGE_TYPE) return;
        if (e.data.provider && e.data.provider !== provider) return;
        void finish(
          e.data.status === "success" ? "success" : "error",
          e.data.message || "Authorization failed. Please try again.",
          "message",
        );
      };

      const onStorage = (e: StorageEvent) => {
        if (e.key !== OAUTH_RESULT_KEY || !e.newValue) return;
        const result = readOAuthResult(provider);
        if (result) void finishFromResult(result, "storage");
      };

      window.addEventListener("message", onMessage);
      window.addEventListener("storage", onStorage);

      const closeTimer = setInterval(() => {
        if (!popup.closed || finishedRef.current || graceTimer) return;
        // Don't conclude anything yet: a message posted just before the close
        // may still be in flight.
        graceTimer = setTimeout(async () => {
          if (finishedRef.current) return;
          const result = readOAuthResult(provider);
          if (result) {
            void finishFromResult(result, "closed-poll");
            return;
          }
          // No result at all. Ask the database rather than guessing — the write
          // may well have succeeded even though the handshake was lost.
          oauthLog(provider, "closed with no result, confirming via DB");
          let connected = false;
          try {
            connected = await confirmConnected();
          } catch {
            connected = false;
          }
          void finish(
            connected ? "success" : "error",
            "We couldn't confirm the connection — the authorization window closed before it finished. Please try again.",
            "closed-poll",
          );
        }, CLOSE_GRACE_MS);
      }, CLOSE_POLL_MS);

      const timeoutTimer = setTimeout(() => {
        void finish(
          "error",
          "The authorization window timed out. Please try again.",
          "timeout",
        );
      }, TIMEOUT_MS);

      cleanupRef.current = cleanup;
    },
    [provider, confirmConnected, onSuccess, onError],
  );

  return { connecting, open, setConnecting };
}

function describeStage(result: OAuthResult) {
  const base = result.message || "Authorization failed. Please try again.";
  return result.stage && result.stage !== "done"
    ? `Failed at "${result.stage}": ${base}`
    : base;
}
