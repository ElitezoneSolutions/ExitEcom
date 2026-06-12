import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Upload,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  FileText,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { DisconnectButton } from "@/components/ex/DisconnectButton";
import { useBusinessData } from "@/hooks/useBusinessData";

export const Route = createFileRoute("/_app/bank-statements-data")({
  component: BankStatementsData,
});

const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — re-upload prompt

function BankStatementsData() {
  const {
    isBankConnected,
    bankStatementMonthly,
    bankStatementFiles,
    bankLastSyncedAt,
    disconnectBankStatements,
    loading,
  } = useBusinessData();

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n);

  const totals = useMemo(() => {
    const credits = bankStatementMonthly.reduce((s, m) => s + m.totalCredits, 0);
    const debits  = bankStatementMonthly.reduce((s, m) => s + m.totalDebits,  0);
    return { credits, debits, net: credits - debits };
  }, [bankStatementMonthly]);

  const isStale =
    !!bankLastSyncedAt &&
    Date.now() - new Date(bankLastSyncedAt).getTime() > STALE_MS;

  if (loading) {
    return (
      <div className="text-sm text-[var(--text-muted)] py-12 text-center">
        Loading bank statements…
      </div>
    );
  }

  if (!isBankConnected || bankStatementMonthly.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <FileText className="w-12 h-12 mx-auto text-[var(--text-muted)]" />
        <h2 className="text-base font-semibold">No bank statements on file</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Upload CSV exports from your bank to verify cash flow for buyers.
        </p>
        <Link
          to="/bank-statements-upload"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Upload className="w-4 h-4" /> Upload Statements
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Bank Statements"
        subtitle={`${bankStatementMonthly.length} month${bankStatementMonthly.length !== 1 ? "s" : ""} of cash-flow data · ${bankStatementFiles.length} file${bankStatementFiles.length !== 1 ? "s" : ""} on file`}
        right={
          <div className="flex items-center gap-3">
            {bankLastSyncedAt && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <Clock className="w-3.5 h-3.5" />
                Last updated {new Date(bankLastSyncedAt).toLocaleDateString("en-GB")}
              </div>
            )}
            <Link
              to="/bank-statements-upload"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-warm)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Re-upload
            </Link>
            <DisconnectButton name="Bank Statements" onConfirm={disconnectBankStatements} />
          </div>
        }
      />

      {isStale && (
        <div className="mb-6 card-light border border-amber-500/30 px-4 py-3 flex items-center gap-2 text-sm text-amber-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Statements last updated over 30 days ago. Consider uploading your latest month.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card-light px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Total Credits
          </div>
          <div className="text-lg font-semibold text-[var(--positive)]">
            {fmt(totals.credits)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            over {bankStatementMonthly.length} months
          </div>
        </div>

        <div className="card-light px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
            <TrendingDown className="w-3.5 h-3.5" />
            Total Debits
          </div>
          <div
            className="text-lg font-semibold"
            style={{ color: "var(--destructive)" }}
          >
            {fmt(totals.debits)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            over {bankStatementMonthly.length} months
          </div>
        </div>

        <div className="card-light px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Net Cash Flow
          </div>
          <div
            className="text-lg font-semibold"
            style={{ color: totals.net >= 0 ? "var(--positive)" : "var(--destructive)" }}
          >
            {fmt(totals.net)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {totals.net >= 0 ? "positive" : "negative"} overall
          </div>
        </div>

        <div className="card-light px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
            <FileText className="w-3.5 h-3.5" />
            Months on File
          </div>
          <div className="text-lg font-semibold">
            {bankStatementMonthly.length}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {bankStatementMonthly.length >= 3 ? "meets buyer minimum" : "3+ recommended"}
          </div>
        </div>
      </div>

      {/* Monthly table */}
      <div className="card-light mb-6">
        <div className="px-5 py-4 border-b border-[var(--border-warm)]">
          <h3 className="text-sm font-semibold">Monthly Cash Flow</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-warm)] text-[11px] text-[var(--text-muted)] uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Month</th>
                <th className="px-5 py-3 text-right">Credits</th>
                <th className="px-5 py-3 text-right">Debits</th>
                <th className="px-5 py-3 text-right">Net Flow</th>
                <th className="px-5 py-3 text-right">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {[...bankStatementMonthly]
                .sort((a, b) => b.month.localeCompare(a.month))
                .map((m) => (
                  <tr
                    key={m.month}
                    className="border-b border-[var(--border-warm)] last:border-0 hover:bg-[var(--sidebar-active)] transition-colors"
                  >
                    <td className="px-5 py-3 font-medium">{m.month}</td>
                    <td className="px-5 py-3 text-right text-[var(--positive)]">
                      {fmt(m.totalCredits)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ color: "var(--destructive)" }}
                    >
                      {fmt(m.totalDebits)}
                    </td>
                    <td
                      className="px-5 py-3 text-right font-medium"
                      style={{
                        color: m.netFlow >= 0 ? "var(--positive)" : "var(--destructive)",
                      }}
                    >
                      {fmt(m.netFlow)}
                    </td>
                    <td className="px-5 py-3 text-right text-[var(--text-muted)]">
                      {m.transactionCount}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Files list */}
      <div className="card-light">
        <div className="px-5 py-4 border-b border-[var(--border-warm)]">
          <h3 className="text-sm font-semibold">Uploaded Files</h3>
        </div>
        <div className="divide-y divide-[var(--border-warm)]">
          {bankStatementFiles.map((f) => (
            <div key={f.id} className="px-5 py-3 flex items-center gap-3">
              <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{f.fileName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {f.rowCount != null ? `${f.rowCount} rows · ` : ""}
                  {f.fileSize != null ? `${(f.fileSize / 1024).toFixed(0)} KB · ` : ""}
                  {new Date(f.syncedAt).toLocaleDateString("en-GB")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
