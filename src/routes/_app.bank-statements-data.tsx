import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload, FileText, Clock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { DisconnectButton } from "@/components/ex/DisconnectButton";
import { useBusinessData } from "@/hooks/useBusinessData";

export const Route = createFileRoute("/_app/bank-statements-data")({
  component: BankStatementsData,
});

const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function BankStatementsData() {
  const {
    isBankConnected,
    bankStatementFiles,
    bankLastSyncedAt,
    disconnectBankStatements,
    loading,
  } = useBusinessData();

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

  if (!isBankConnected || bankStatementFiles.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <FileText className="w-12 h-12 mx-auto text-[var(--text-muted)]" />
        <h2 className="text-base font-semibold">No bank statements on file</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Upload PDF exports from your bank to verify cash flow for buyers.
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
        subtitle={`${bankStatementFiles.length} file${bankStatementFiles.length !== 1 ? "s" : ""} on file`}
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
              <Upload className="w-3.5 h-3.5" /> Upload more
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
