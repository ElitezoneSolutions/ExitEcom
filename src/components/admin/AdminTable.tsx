import { ReactNode, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Column descriptor for {@link AdminTable}.
 * - `render` controls the cell contents (defaults to the raw `string`/`number`).
 * - `sortValue` makes the column header clickable for sorting.
 * - `search` contributes the column's text to the live search filter.
 * - `csv` overrides what the column exports (defaults to `sortValue`/`render`).
 */
export interface AdminColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  search?: (row: T) => string;
  csv?: (row: T) => string | number;
  className?: string;
}

interface AdminTableProps<T> {
  rows: T[];
  columns: AdminColumn<T>[];
  rowKey: (row: T) => string;
  /** CSV file name (without extension). Enables the export button when set. */
  exportName?: string;
  /** Placeholder for the search box; omit to hide search entirely. */
  searchPlaceholder?: string;
  /** Extra controls rendered on the right of the toolbar (e.g. filters). */
  toolbar?: ReactNode;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

function toCsvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Shared data table for the admin modules: live search, column sorting,
 * pagination, and CSV export. Purely presentational — data fetching/filtering of
 * the source rows happens in the caller; this handles the in-memory view.
 */
export function AdminTable<T>({
  rows,
  columns,
  rowKey,
  exportName,
  searchPlaceholder,
  toolbar,
  pageSize = 25,
  onRowClick,
  emptyMessage = "No records found.",
}: AdminTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const searchable = searchPlaceholder !== undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const searchCols = columns.filter((c) => c.search);
    return rows.filter((row) =>
      searchCols.some((c) => c.search!(row).toLowerCase().includes(q)),
    );
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, columns, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  function toggleSort(col: AdminColumn<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  function exportCsv() {
    const header = columns.map((c) => toCsvCell(c.header)).join(",");
    const body = sorted
      .map((row) =>
        columns
          .map((c) => {
            if (c.csv) return toCsvCell(c.csv(row));
            if (c.sortValue) return toCsvCell(c.sortValue(row));
            return "";
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {(searchable || toolbar || exportName) && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {searchable && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-warm)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}
          {toolbar}
          {exportName && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[var(--border-warm)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto border border-[var(--border-warm)] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-warm)] bg-[var(--bg-secondary)]">
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      "text-left font-medium text-[var(--text-muted)] px-4 py-3 whitespace-nowrap",
                      c.sortValue && "cursor-pointer select-none",
                      c.className,
                    )}
                    onClick={() => toggleSort(c)}
                    aria-sort={
                      isSorted
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {c.header}
                      {c.sortValue &&
                        (isSorted ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--text-muted)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-[var(--border-warm)] last:border-0",
                    onRowClick &&
                      "cursor-pointer hover:bg-[var(--sidebar-active)] transition-colors",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3 text-[var(--text-primary)] align-middle",
                        c.className,
                      )}
                    >
                      {c.render
                        ? c.render(row)
                        : c.sortValue
                          ? String(c.sortValue(row))
                          : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-[var(--text-muted)]">
        <span>
          {sorted.length} record{sorted.length === 1 ? "" : "s"}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="px-3 py-1 rounded-md border border-[var(--border-warm)] disabled:opacity-40 hover:text-[var(--accent)]"
            >
              Prev
            </button>
            <span>
              Page {safePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="px-3 py-1 rounded-md border border-[var(--border-warm)] disabled:opacity-40 hover:text-[var(--accent)]"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
