import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { useAuth } from "@/hooks/useAuth";
import { getPlatformStatsFn, type PlatformStats } from "@/lib/admin/analytics";

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
