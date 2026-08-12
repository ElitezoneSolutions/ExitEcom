import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowRight, ClipboardCheck, MailX, FileCheck } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { useAuth } from "@/hooks/useAuth";
import {
  getPlatformStatsFn,
  type PlatformStats,
  type QueueStats,
} from "@/lib/admin/analytics";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    getPlatformStatsFn({ data: { accessToken } })
      .then(setStats)
      .catch(() =>
        setError(
          "Could not load platform analytics. Check that admin access is configured.",
        ),
      )
      .finally(() => setLoading(false));
  }, [accessToken]);

  return (
    <>
      <PageHeader
        title="Platform Overview"
        subtitle="Adoption and exit-readiness across every account. All figures are computed deterministically."
      />

      {error ? (
        <div className="border border-[var(--border-warm)] rounded-lg px-4 py-10 text-center text-[var(--text-muted)]">
          {error}
        </div>
      ) : loading || !stats ? (
        <div className="border border-[var(--border-warm)] rounded-lg px-4 py-10 text-center text-[var(--text-muted)]">
          Loading analytics…
        </div>
      ) : (
        <div className="space-y-6">
          <NeedsAttention queue={stats.queue} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total users" value={stats.totalUsers} />
            <Stat label="With a business" value={stats.usersWithBusiness} />
            <Stat label="Businesses" value={stats.totalBusinesses} />
            <Stat label="Documents uploaded" value={stats.totalDocuments} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card-light p-8">
              <SectionLabel>Signups per month</SectionLabel>
              <div className="h-[260px] mt-4">
                {stats.signupTrend.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer>
                    <LineChart
                      data={stats.signupTrend}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="2 4"
                        stroke="var(--border-warm)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        stroke="var(--text-muted)"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="var(--text-muted)"
                        fontSize={11}
                        allowDecimals={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="var(--accent)"
                        strokeWidth={1.6}
                        dot={{ fill: "var(--accent)", r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card-light p-8">
              <SectionLabel>Exit-score distribution</SectionLabel>
              <div className="h-[260px] mt-4">
                <ResponsiveContainer>
                  <BarChart
                    data={stats.scoreDistribution}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="2 4"
                      stroke="var(--border-warm)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="band"
                      stroke="var(--text-muted)"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "var(--sidebar-active)" }}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--accent)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card-light p-8">
            <SectionLabel>Connector adoption</SectionLabel>
            {stats.connectorAdoption.length === 0 ? (
              <div className="mt-4">
                <Empty />
              </div>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {stats.connectorAdoption.map((c) => (
                  <li
                    key={c.source}
                    className="flex items-center justify-between border-b border-[var(--border-warm)] py-2 last:border-0"
                  >
                    <span>{c.source}</span>
                    <span className="font-display">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The operational panel: what is waiting on the team right now. Results sit
 * unpublished until someone approves them, so an unwatched queue means a founder
 * looking at "we're processing your request" for as long as nobody notices.
 * Nothing here is decorative — every number is something to act on, and the
 * panel says so plainly when there's nothing to do.
 */
function NeedsAttention({ queue }: { queue: QueueStats }) {
  const clear =
    queue.pendingRequests === 0 &&
    queue.pendingDocuments === 0 &&
    queue.notifyFailures === 0;

  return (
    <div className="card-light p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Needs your attention</SectionLabel>
          {clear && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Nothing waiting — every submitted result and document has been
              reviewed.
            </p>
          )}
        </div>
        <Link to="/admin/requests" className="btn-ghost-light text-xs shrink-0">
          Review queue <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {!clear && (
        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          <Action
            icon={ClipboardCheck}
            label="Results awaiting review"
            value={queue.pendingRequests}
            // The age matters more than the count: one request waiting three
            // days is a worse failure than ten submitted this morning.
            detail={
              queue.oldestPendingHours === null
                ? undefined
                : `Longest wait ${formatWait(queue.oldestPendingHours)}`
            }
            urgent={
              queue.oldestPendingHours !== null &&
              queue.oldestPendingHours >= 24
            }
          />
          <Action
            icon={FileCheck}
            label="Documents to verify"
            value={queue.pendingDocuments}
            detail={queue.pendingDocuments > 0 ? "In Documents" : undefined}
          />
          <Action
            icon={MailX}
            label="Emails that didn't send"
            value={queue.notifyFailures}
            detail={
              queue.notifyFailures > 0 ? "Approved but not notified" : undefined
            }
            urgent={queue.notifyFailures > 0}
          />
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-[var(--border-warm)] flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-[var(--text-muted)]">
        <span>
          Approved (7 days):{" "}
          <span className="text-[var(--text-primary)]">
            {queue.approvedLast7Days}
          </span>
        </span>
        <span>
          Rejected (7 days):{" "}
          <span className="text-[var(--text-primary)]">
            {queue.rejectedLast7Days}
          </span>
        </span>
        {queue.pendingByTool.map((t) => (
          <span key={t.tool}>
            {t.label}:{" "}
            <span className="text-[var(--text-primary)]">{t.count}</span>{" "}
            waiting
          </span>
        ))}
      </div>
    </div>
  );
}

function formatWait(hours: number) {
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function Action({
  icon: Icon,
  label,
  value,
  detail,
  urgent,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: number;
  detail?: string;
  urgent?: boolean;
}) {
  const active = value > 0;
  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: urgent ? "var(--risk-medium)" : "var(--border-warm)",
        backgroundColor: active ? "var(--sidebar-active)" : "transparent",
      }}
    >
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        {label}
      </div>
      <div
        className="mt-2 font-display text-3xl leading-none"
        style={{
          color: active
            ? urgent
              ? "var(--risk-medium)"
              : "var(--accent)"
            : "var(--text-muted)",
        }}
      >
        {value}
      </div>
      {detail && (
        <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          {detail}
        </div>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--bg-dark)",
  border: "1px solid var(--border-dark)",
  color: "var(--text-on-dark)",
  fontSize: 12,
} as const;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-light p-6">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-2 font-display text-[32px] leading-none text-[var(--text-primary)]">
        {value.toLocaleString("en-GB")}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
      No data yet.
    </div>
  );
}
