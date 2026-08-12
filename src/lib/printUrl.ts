import { useEffect } from "react";

// Browsers stamp the page's full URL into the printed header/footer — so a
// report printed from `/reports?report=full` carries
// "https://dash.exitecom.com/reports?report=full" across the bottom of every
// page of a document that goes to buyers and brokers. That's internal routing
// detail, and it's ugly next to our own footer.
//
// It isn't reachable from CSS (the print header/footer is browser chrome, not
// part of the document), so the only lever is the URL itself: swap it for the
// bare origin while the print dialog is open, then put it back.
//
// We deliberately call the NATIVE History.replaceState rather than whatever is
// on `window.history` at call time. TanStack Router patches history to track
// navigation; going through the patched method would tell the router we'd
// navigated to "/", unmounting the very report being printed.
export function useCleanPrintUrl(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const replaceState = History.prototype.replaceState.bind(window.history);
    let previous: string | null = null;

    const strip = () => {
      if (previous !== null) return; // Already stripped.
      previous =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      replaceState(window.history.state, "", "/");
    };

    const restore = () => {
      if (previous === null) return;
      replaceState(window.history.state, "", previous);
      previous = null;
    };

    // Covers Ctrl/Cmd-P as well as our own "Download PDF" button.
    window.addEventListener("beforeprint", strip);
    window.addEventListener("afterprint", restore);

    return () => {
      // Never leave the URL rewritten if we unmount mid-print.
      restore();
      window.removeEventListener("beforeprint", strip);
      window.removeEventListener("afterprint", restore);
    };
  }, [enabled]);
}
