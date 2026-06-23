import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ex/PageHeader";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import {
  DocumentStatusBadge,
  DOCUMENT_STATUS_LABEL,
} from "@/components/ex/DocumentStatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { fmtGBP } from "@/lib/utils";
import {
  listDocumentsFn,
  getDocumentUrlFn,
  setDocumentStatusFn,
  type AdminDocumentRow,
} from "@/lib/admin/documents";

export const Route = createFileRoute("/_app/admin/documents")({
  component: AdminDocuments,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtSize = (bytes: number | null) =>
  bytes == null
    ? "—"
    : bytes >= 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;

type TypeFilter = "all" | "bank_statement" | "pl";

function AdminDocuments() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [rows, setRows] = useState<AdminDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selected, setSelected] = useState<AdminDocumentRow | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listDocumentsFn({ data: { accessToken } }));
    } catch {
      setError(
        "Could not load documents. Check that admin access is configured.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    typeFilter === "all" ? rows : rows.filter((r) => r.fileType === typeFilter);

  const columns: AdminColumn<AdminDocumentRow>[] = [
    {
      key: "fileName",
      header: "File",
      sortValue: (r) => r.fileName,
      search: (r) =>
        `${r.fileName} ${r.ownerEmail ?? ""} ${r.businessName ?? ""}`,
      csv: (r) => r.fileName,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--text-muted)]" />
          {r.fileName}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (r) => r.fileType,
      csv: (r) => r.fileType,
      render: (r) =>
        r.fileType === "bank_statement" ? "Bank statement" : "P&L",
    },
    {
      key: "owner",
      header: "Owner",
      sortValue: (r) => r.ownerEmail ?? "",
      csv: (r) => r.ownerEmail ?? "",
      render: (r) => (
        <div>
          <div>{r.ownerEmail ?? "—"}</div>
          {r.businessName && (
            <div className="text-xs text-[var(--text-muted)]">
              {r.businessName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "size",
      header: "Size",
      sortValue: (r) => r.fileSize ?? 0,
      csv: (r) => r.fileSize ?? "",
      render: (r) => fmtSize(r.fileSize),
    },
    {
      key: "uploadedAt",
      header: "Uploaded",
      sortValue: (r) => r.uploadedAt ?? "",
      csv: (r) => r.uploadedAt ?? "",
      render: (r) => fmtDate(r.uploadedAt),
    },
    {
      key: "status",
      header: "Review",
      sortValue: (r) => r.reviewStatus,
      csv: (r) => DOCUMENT_STATUS_LABEL[r.reviewStatus],
      render: (r) => <DocumentStatusBadge status={r.reviewStatus} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Bank-statement and P&L PDFs submitted for due diligence. Preview and verify each file."
        right={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[var(--border-warm)] text-[var(--text-secondary)] hover:text-[var(--accent)]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="border border-[var(--border-warm)] rounded-lg px-4 py-10 text-center text-[var(--text-muted)]">
          {error}
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="border border-[var(--border-warm)] rounded-lg px-4 py-10 text-center text-[var(--text-muted)]">
          Loading documents…
        </div>
      ) : (
        <AdminTable
          rows={visible}
          columns={columns}
          rowKey={(r) => `${r.fileType}:${r.id}`}
          exportName="exitecom-documents"
          searchPlaceholder="Search by file, owner, or business…"
          onRowClick={setSelected}
          toolbar={
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              aria-label="Filter by document type"
              className="px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded-md text-[var(--text-primary)]"
            >
              <option value="all">All types</option>
              <option value="bank_statement">Bank statements</option>
              <option value="pl">P&L</option>
            </select>
          }
        />
      )}

      <DocumentDialog
        doc={selected}
        accessToken={accessToken}
        onClose={() => setSelected(null)}
        onChanged={() => void load()}
      />
    </>
  );
}

function DocumentDialog({
  doc,
  accessToken,
  onClose,
  onChanged,
}: {
  doc: AdminDocumentRow | null;
  accessToken: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(null);
    setUrlError(null);
    setNote(doc?.reviewNote ?? "");
    if (!doc) return;
    if (!doc.filePath) {
      setUrlError("This file is not stored — only its metadata was recorded.");
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    getDocumentUrlFn({
      data: { accessToken, bucket: doc.bucket, filePath: doc.filePath },
    })
      .then(async ({ url: signedUrl }) => {
        // Fetch the bytes and re-wrap them as an application/pdf blob. Stored
        // objects can carry a content-type/disposition that makes the browser
        // download the file inside the iframe instead of rendering it; serving
        // a fresh application/pdf blob URL forces an inline preview every time.
        const res = await fetch(signedUrl);
        if (!res.ok) throw new Error("Could not fetch the file.");
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([buf], { type: "application/pdf" }),
        );
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled)
          setUrlError("Could not generate a preview link for this file.");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, accessToken]);

  if (!doc) return null;

  const setStatus = async (status: "verified" | "rejected" | "pending") => {
    setBusy(true);
    try {
      await setDocumentStatusFn({
        data: {
          accessToken,
          fileId: doc.id,
          fileType: doc.fileType,
          status,
          note,
        },
      });
      toast.success(`Marked as ${DOCUMENT_STATUS_LABEL[status]}.`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{doc.fileName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label="Owner" value={doc.ownerEmail ?? "—"} />
            <Field
              label="Type"
              value={
                doc.fileType === "bank_statement" ? "Bank statement" : "P&L"
              }
            />
            <Field label="Uploaded" value={fmtDate(doc.uploadedAt)} />
            <Field label="Size" value={fmtSize(doc.fileSize)} />
            {doc.fileType === "bank_statement" && doc.monthsParsed != null && (
              <>
                <Field label="Months parsed" value={String(doc.monthsParsed)} />
                <Field
                  label="Net cash flow"
                  value={doc.netFlow != null ? fmtGBP(doc.netFlow) : "—"}
                />
              </>
            )}
          </div>

          <div className="border border-[var(--border-warm)] rounded-lg overflow-hidden bg-[var(--bg-secondary)] h-[420px] flex items-center justify-center">
            {urlError ? (
              <p className="text-[var(--text-muted)] text-sm px-6 text-center">
                {urlError}
              </p>
            ) : url ? (
              <iframe
                title="Document preview"
                src={url}
                className="w-full h-full"
              />
            ) : (
              <p className="text-[var(--text-muted)] text-sm">
                Loading preview…
              </p>
            )}
          </div>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)]"
            >
              Open in new tab <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <div>
            <label
              htmlFor="review-note"
              className="text-xs text-[var(--text-muted)]"
            >
              Review note (optional)
            </label>
            <textarea
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Reason for rejection, observations, etc."
              className="mt-1 w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus("verified")}
              className="flex-1 px-3 py-2 rounded-md bg-[var(--positive,#16A34A)] text-white text-sm disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus("rejected")}
              className="flex-1 px-3 py-2 rounded-md bg-[#DC2626] text-white text-sm disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus("pending")}
              className="px-3 py-2 rounded-md border border-[var(--border-warm)] text-sm disabled:opacity-50"
            >
              Mark pending verification
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
