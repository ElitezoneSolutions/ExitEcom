import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload, FileText, AlertTriangle, ArrowRight } from "lucide-react";
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
      <>
        <PageHeader
          title="Bank Statements"
          subtitle="Upload PDF exports from your bank so buyers can verify your cash flow. Reports are computed from your data on demand."
        />
        <div className="card-light p-10 rounded-lg text-center max-w-xl mx-auto">
          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)]">
            <FileText className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 font-display text-2xl text-[var(--text-primary)]">
            No bank statements yet
          </h2>
          <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
            Upload PDF exports from your bank to verify cash flow for buyers.
            Your statements stay private until you choose to share them.
          </p>
          <Link
            to="/bank-statements-upload"
            className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-md hover:bg-[var(--accent-hover)] transition-colors"
          >
            Upload Statements <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Bank Statements"
        subtitle={`${bankStatementFiles.length} file${bankStatementFiles.length !== 1 ? "s" : ""} on file`}
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <DisconnectButton
                name="Bank Statements"
                onConfirm={disconnectBankStatements}
                variant="button"
              />
              <Link
                to="/bank-statements-upload"
                className="btn-primary text-sm"
              >
                <Upload className="w-4 h-4" /> Upload more
              </Link>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {bankLastSyncedAt
                ? `Last updated ${new Date(bankLastSyncedAt).toLocaleString("en-GB")}`
                : "Not uploaded yet"}
            </span>
          </div>
        }
      />

      {isStale && (
        <div className="mb-6 card-light border border-amber-500/30 px-4 py-3 flex items-center gap-2 text-sm text-amber-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Statements last updated over 30 days ago. Consider uploading your
          latest month.
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
                  {f.fileSize != null
                    ? `${(f.fileSize / 1024).toFixed(0)} KB · `
                    : ""}
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
