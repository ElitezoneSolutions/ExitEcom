import { createFileRoute } from "@tanstack/react-router";
import { SplitAuth } from "./signup";
import { RequireGuest } from "@/components/auth/RouteGuards";

interface AuthSearch {
  /** Where to send the user after a successful login (set by RequireAuth). */
  redirect?: string;
  /** Reason for landing here, e.g. "expired" to show the session-expired notice. */
  reason?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  component: () => (
    <RequireGuest>
      <SplitAuth mode="login" />
    </RequireGuest>
  ),
});
