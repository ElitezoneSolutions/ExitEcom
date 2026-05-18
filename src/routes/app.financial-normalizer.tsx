import { createFileRoute } from "@tanstack/react-router";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PageHeader } from "@/components/ex/PageHeader";
import { SectionLabel } from "@/components/ex/SectionLabel";
import { mockBusiness, addBacks, fmtGBP } from "@/lib/mock";

export const Route = createFileRoute("/app/financial-normalizer")({ component: Financial });

const expenseData = [
  { name: "COGS", v: 168000 },
  { name: "Ad Spend", v: 96000 },
  { name: "Operations", v: 60000 },
  { name: "Fixed Costs", v: 60000 },
];
const COLORS = ["var(--accent)", "var(--text-secondary)", "var(--risk-medium)", "var(--text-muted)"];

function Financial() {
  return (
    <>
      <PageHeader title="Financial Normalizer" subtitle="Reconstruct buyer-ready financials from your raw data." />

      <div className="card-dark p-8">
        <SectionLabel dark>Earnings Overview</SectionLabel>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ["Gross Revenue", fmtGBP(mockBusiness.grossRevenue)],
            ["Net Revenue", fmtGBP(mockBusiness.netRevenue)],
            ["COGS", fmtGBP(mockBusiness.cogs)],
            ["Gross Profit", fmtGBP(mockBusiness.grossProfit)],
            ["Operating Expenses", fmtGBP(mockBusiness.opex)],
            ["EBITDA", fmtGBP(mockBusiness.ebitda)],
            ["SDE", fmtGBP(mockBusiness.sde)],
            ["Net Margin", "26.3%"],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="label-caps-dark" style={{ fontSize: 10 }}>{l}</div>
              <div className="font-display text-[var(--text-on-dark)] text-2xl mt-2">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 card-light p-8">
        <SectionLabel>Identified Add-backs</SectionLabel>
        <table className="w-full mt-5 text-sm">
          <thead className="text-left text-xs text-[var(--text-muted)] tracking-[0.12em] uppercase">
            <tr><th className="pb-3 font-normal">Item</th><th className="pb-3 font-normal">Amount</th><th className="pb-3 font-normal">Type</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-warm)]">
            {addBacks.map((a) => (
              <tr key={a.item}><td className="py-3">{a.item}</td><td className="py-3 font-display">{fmtGBP(a.amount)}</td><td className="py-3 text-[var(--text-muted)]">{a.type}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 pt-4 border-t border-[var(--border-warm)] flex items-center justify-between">
          <button className="text-xs text-[var(--accent)] hover:text-[var(--accent-muted)]">+ Add Manual Add-Back</button>
          <div className="text-sm">Total Add-backs: <span className="font-display text-[var(--accent)]">£38,200</span> · Adjusted SDE: <span className="font-display">{fmtGBP(mockBusiness.sde)}</span></div>
        </div>
      </div>

      <div className="mt-10 grid lg:grid-cols-2 gap-6">
        <div className="card-light p-8">
          <SectionLabel>Expense Breakdown</SectionLabel>
          <div className="h-[260px] mt-4">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={expenseData} dataKey="v" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {expenseData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {expenseData.map((e, i) => (
              <li key={e.name} className="flex items-center justify-between border-b border-[var(--border-warm)] py-2">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />{e.name}</span>
                <span className="font-display">{fmtGBP(e.v)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-light p-8">
          <SectionLabel>12-Month Revenue Trend</SectionLabel>
          <div className="h-[300px] mt-4">
            <ResponsiveContainer>
              <LineChart data={mockBusiness.revenueMonthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border-warm)" vertical={false} />
                <XAxis dataKey="m" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--bg-dark)", border: "1px solid var(--border-dark)", color: "var(--text-on-dark)", fontSize: 12 }} />
                <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.6} dot={{ fill: "var(--accent)", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
