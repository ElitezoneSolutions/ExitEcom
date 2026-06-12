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

type UploadStatus = "idle" | "saving" | "success" | "error";

interface SelectedFile {
  file: File;
  id: string;
}

function BankStatementsUpload() {
  const navigate = useNavigate();
  const { uploadBankStatements } = useBusinessData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const files = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (files.length === 0) {
      toast.error("Only PDF files are accepted. Export your bank statement as a PDF.");
      return;
    }
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((s) => s.file.name));
      const fresh = files
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, id: crypto.randomUUID() }));
      const combined = [...prev, ...fresh];
      if (combined.length > 6) {
        toast.warning("Maximum 6 files.");
        return combined.slice(0, 6);
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
      toast.error("Select at least one PDF file to upload.");
      return;
    }
    try {
      setStatus("saving");
      setErrorMessage("");
      await uploadBankStatements(selectedFiles.map((s) => s.file));
      setStatus("success");
      setTimeout(() => navigate({ to: "/bank-statements-data" }), 2000);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (status === "success") {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="card-light p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-[var(--positive)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-1">Statements uploaded</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} saved
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-4">Redirecting…</p>
        </div>
      </div>
    );
  }

  const busy = status === "saving";

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
        subtitle="Upload PDF bank statements. Files are recorded for buyer verification."
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
            <p className="text-sm font-medium">Drop PDF files here</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">or click to browse</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-3">
              PDF only · Max 6 files · 10 MB each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
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
              <span>{errorMessage || "Upload failed. Please try again."}</span>
            </div>
          )}

          <button
            type="button"
            disabled={busy || selectedFiles.length === 0}
            onClick={handleSubmit}
            className="w-full py-2.5 rounded-md text-sm font-medium transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {busy ? "Saving…" : "Upload Statements"}
          </button>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            File metadata is stored securely — only you can see your statements.
          </div>
        </div>

        {/* Right — why */}
        <div className="lg:col-span-7 space-y-5">
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
