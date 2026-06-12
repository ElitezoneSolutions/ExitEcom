import { useState, useRef, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Shield,
} from "lucide-react";
import { PageHeader } from "@/components/ex/PageHeader";
import { useBusinessData } from "@/hooks/useBusinessData";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/bank-statements-upload")({
  component: BankStatementsUpload,
});

type UploadStatus = "idle" | "reading" | "parsing" | "saving" | "success" | "error";

interface SelectedFile {
  file: File;
  id: string;
}

const fmt = (n: number, currency = "£") =>
  `${currency}${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function BankStatementsUpload() {
  const navigate = useNavigate();
  const { uploadBankStatements } = useBusinessData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<{
    monthCount: number;
    totalCredits: number;
    totalDebits: number;
    netFlow: number;
  } | null>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const validTypes = ["text/csv", "application/vnd.ms-excel"];
    const files = Array.from(incoming).filter(
      (f) =>
        validTypes.includes(f.type) ||
        f.name.toLowerCase().endsWith(".csv"),
    );
    if (files.length === 0) {
      toast.error("Only CSV files are accepted. Export your statements as CSV from your bank.");
      return;
    }
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((s) => s.file.name));
      const fresh = files
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, id: crypto.randomUUID() }));
      const combined = [...prev, ...fresh];
      if (combined.length > 3) {
        toast.warning("Maximum 3 files. Upload one per month.");
        return combined.slice(0, 3);
      }
      return combined;
    });
  }, []);

  const removeFile = (id: string) =>
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Select at least one CSV file to upload.");
      return;
    }
    try {
      setStatus("reading");
      setErrorMessage("");
      const result = await uploadBankStatements(
        selectedFiles.map((s) => s.file),
        (phase) => setStatus(phase),
      );
      setSummary(result);
      setStatus("success");
      setTimeout(() => navigate({ to: "/bank-statements-data" }), 2500);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (status === "success" && summary) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="card-light p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-[var(--positive)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-1">Statements imported</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            {summary.monthCount} month{summary.monthCount !== 1 ? "s" : ""} of cash-flow data on file
          </p>
          <div className="grid grid-cols-3 gap-4 text-center mb-6">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Total Credits</div>
              <div className="text-sm font-semibold text-[var(--positive)]">
                {fmt(summary.totalCredits)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Total Debits</div>
              <div className="text-sm font-semibold text-[var(--destructive)]">
                {fmt(summary.totalDebits)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Net Flow</div>
              <div
                className="text-sm font-semibold"
                style={{ color: summary.netFlow >= 0 ? "var(--positive)" : "var(--destructive)" }}
              >
                {fmt(summary.netFlow)}
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Redirecting to your data…</p>
        </div>
      </div>
    );
  }

  const busy = status === "reading" || status === "parsing" || status === "saving";
  const stepLabel =
    status === "reading" ? "Reading files…"
    : status === "parsing" ? "Parsing transactions…"
    : status === "saving" ? "Saving to database…"
    : null;

  return (
    <>
      <div className="mb-2">
        <Link
          to="/data-sources"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Data Sources
        </Link>
      </div>
      <PageHeader
        title="Connect Bank Statements"
        subtitle="Upload CSV exports from your bank. Monthly cash-flow totals are extracted — the raw file is never stored."
      />

      <div className="grid lg:grid-cols-12 gap-8 max-w-5xl">
        {/* Left — upload zone */}
        <div className="lg:col-span-5 space-y-4">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer select-none"
            style={{
              borderColor: dragOver ? "var(--accent)" : "var(--border-warm)",
              backgroundColor: dragOver ? "var(--sidebar-active)" : "transparent",
            }}
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm font-medium">Drop CSV files here</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">or click to browse</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-3">
              Up to 3 files · CSV only · Max 10 MB each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* Selected files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              {selectedFiles.map(({ file, id }) => (
                <div
                  key={id}
                  className="card-light px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(id); }}
                    className="text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="card-light border border-[var(--destructive)]/30 px-4 py-3 flex gap-2 text-sm text-[var(--destructive)]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage || "Could not parse the CSV. See the guide for tips."}</span>
            </div>
          )}

          {/* Progress */}
          {busy && stepLabel && (
            <div className="card-light px-4 py-3 text-sm text-[var(--text-muted)] flex items-center gap-2">
              <RefreshCwIcon className="w-4 h-4 animate-spin text-[var(--accent)]" />
              {stepLabel}
            </div>
          )}

          <button
            type="button"
            disabled={busy || selectedFiles.length === 0}
            onClick={handleSubmit}
            className="w-full py-2.5 rounded-md text-sm font-medium transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {busy ? stepLabel : "Import Statements"}
          </button>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            Only monthly totals are stored — no individual transactions leave your browser.
          </div>
        </div>

        {/* Right — guide */}
        <div className="lg:col-span-7 space-y-5">
          <div className="card-light px-5 py-5">
            <h3 className="text-sm font-semibold mb-3">How to export your CSV</h3>
            <div className="space-y-3">
              {[
                {
                  bank: "Monzo / Starling / Revolut",
                  steps: "Account → Transactions → Export → Download CSV",
                },
                {
                  bank: "HSBC / Barclays / Lloyds",
                  steps: "Online banking → Statements → Download → CSV format",
                },
                {
                  bank: "NatWest / RBS / Santander",
                  steps: "Statements → Export statement → Comma-separated values (.csv)",
                },
                {
                  bank: "Chase UK",
                  steps: "Account → Transactions → Filter → Export",
                },
              ].map(({ bank, steps }) => (
                <div key={bank}>
                  <div className="text-xs font-medium">{bank}</div>
                  <div className="text-xs text-[var(--text-muted)]">{steps}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-light px-5 py-5">
            <h3 className="text-sm font-semibold mb-3">What we look for</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              The CSV must have a header row. We detect:
            </p>
            <ul className="space-y-1.5 text-xs text-[var(--text-muted)]">
              <li><span className="font-medium text-[var(--text-primary)]">Date column</span> — any header containing "date"</li>
              <li><span className="font-medium text-[var(--text-primary)]">Credit column</span> — header containing "in", "credit", or "deposit"</li>
              <li><span className="font-medium text-[var(--text-primary)]">Debit column</span> — header containing "out", "debit", or "withdrawal"</li>
              <li><span className="font-medium text-[var(--text-primary)]">Amount column</span> — fallback for single-column exports (positive = credit)</li>
            </ul>
          </div>

          <div className="card-light px-5 py-4">
            <h3 className="text-sm font-semibold mb-2">Why connect bank statements?</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Buyers ask for 3–6 months of bank statements to verify that Shopify revenue
              matches actual bank deposits. Having them on file raises your Data Confidence
              score and removes a common due-diligence blocker.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// Inline icon to avoid importing from a different chunk
function RefreshCwIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
