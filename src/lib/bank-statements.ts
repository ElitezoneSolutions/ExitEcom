import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Bank Statements — server-side CSV parser and monthly aggregator.
//
// Accepts CSV text content exported from any bank. Detects date and amount
// columns by header name (case-insensitive), groups rows by YYYY-MM month, and
// returns monthly credit/debit totals. Files are not stored — only the parsed
// aggregates reach the DB.
//
// Supported column patterns (covers HSBC, Barclays, Monzo, Starling, Chase UK,
// Lloyds, NatWest, Santander and most generic bank CSV exports):
//   date   : any header containing "date"
//   credits: header containing "in", "credit", "deposit" (preferred over amount)
//   debits : header containing "out", "debit", "withdrawal"
//   amount : fallback — header containing "amount"; positive=credit, negative=debit
// ---------------------------------------------------------------------------

export interface ParsedBankMonth {
  month: string;             // YYYY-MM
  totalCredits: number;
  totalDebits: number;
  netFlow: number;
  transactionCount: number;
}

export interface ParseBankStatementResult {
  monthly: ParsedBankMonth[];
  fileInfo: {
    name: string;
    size: number;
    rowCount: number;
  };
}

// --- Sandbox --------------------------------------------------------------- //
function buildSandbox(fileName: string, fileSize: number): ParseBankStatementResult {
  const months: ParsedBankMonth[] = [];
  const base = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const totalCredits = 18000 + Math.floor(i * 1200 + 500);
    const totalDebits  = 12000 + Math.floor(i * 800 + 300);
    months.push({
      month,
      totalCredits,
      totalDebits,
      netFlow: totalCredits - totalDebits,
      transactionCount: 45 + i * 3,
    });
  }
  return { monthly: months, fileInfo: { name: fileName, size: fileSize, rowCount: 270 } };
}

// --- CSV helpers ----------------------------------------------------------- //

/** Split a CSV line respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse a numeric string — strips £$€ and commas, handles (brackets) as negative. */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  const s = raw.trim();
  const negative = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[£$€,\s()]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

/** Attempt to parse a date string into a YYYY-MM bucket. Tries common formats. */
function parseMonth(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");

  // ISO: 2024-03-15 or 2024-03
  const isoFull = s.match(/^(\d{4})-(\d{2})/);
  if (isoFull) return `${isoFull[1]}-${isoFull[2]}`;

  // dd/MM/yyyy or dd-MM-yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) {
    // Distinguish dd/MM/yyyy vs MM/dd/yyyy by value: if first part > 12 → day
    const first = parseInt(dmy[1], 10);
    const second = parseInt(dmy[2], 10);
    const year = dmy[3];
    if (first > 12) {
      return `${year}-${String(second).padStart(2, "0")}`;
    }
    return `${year}-${String(first).padStart(2, "0")}`;
  }

  // MM/dd/yyyy (US format)
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${year}-${String(parseInt(mdy[1], 10)).padStart(2, "0")}`;
  }

  // "15 Jan 2024" or "Jan 15, 2024"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const wordy = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (wordy) {
    const m = months[wordy[2].toLowerCase()];
    if (m) return `${wordy[3]}-${m}`;
  }
  const wordy2 = s.match(/([A-Za-z]{3})\s+(\d{1,2})[,\s]+(\d{4})/);
  if (wordy2) {
    const m = months[wordy2[1].toLowerCase()];
    if (m) return `${wordy2[3]}-${m}`;
  }

  return null;
}

// --- Core parser ----------------------------------------------------------- //

function parseCSV(content: string): {
  monthly: ParsedBankMonth[];
  rowCount: number;
} {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { monthly: [], rowCount: 0 };

  // Find header row: first line that has at least 2 comma-separated tokens
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const parts = splitCsvLine(lines[i]);
    if (parts.length >= 2) { headerIdx = i; headers = parts; break; }
  }
  if (headerIdx < 0) return { monthly: [], rowCount: 0 };

  const lower = headers.map((h) => h.toLowerCase());

  // Detect columns
  const dateCol = lower.findIndex((h) => h.includes("date"));

  // Credit / debit split columns (preferred)
  const creditCol = lower.findIndex((h) =>
    /\bin\b|credit|deposit|paid.?in|money.?in/.test(h),
  );
  const debitCol = lower.findIndex((h) =>
    /\bout\b|debit|withdraw|paid.?out|money.?out/.test(h),
  );

  // Single signed amount column (fallback)
  const amountCol = lower.findIndex((h) =>
    h.includes("amount") && !h.includes("balance"),
  );

  if (dateCol < 0 || (creditCol < 0 && debitCol < 0 && amountCol < 0)) {
    return { monthly: [], rowCount: 0 };
  }

  const buckets = new Map<
    string,
    { credits: number; debits: number; count: number }
  >();

  let rowCount = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (row.length < 2) continue;

    const month = parseMonth(row[dateCol] ?? "");
    if (!month) continue;

    let credit = 0;
    let debit = 0;

    if (creditCol >= 0 || debitCol >= 0) {
      credit = creditCol >= 0 ? Math.abs(parseAmount(row[creditCol] ?? "")) : 0;
      debit  = debitCol >= 0  ? Math.abs(parseAmount(row[debitCol]  ?? "")) : 0;
    } else {
      const amt = parseAmount(row[amountCol] ?? "");
      if (amt >= 0) { credit = amt; } else { debit = Math.abs(amt); }
    }

    const bucket = buckets.get(month) ?? { credits: 0, debits: 0, count: 0 };
    bucket.credits += credit;
    bucket.debits  += debit;
    bucket.count   += 1;
    buckets.set(month, bucket);
    rowCount++;
  }

  const monthly: ParsedBankMonth[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      month,
      totalCredits: Math.round(b.credits * 100) / 100,
      totalDebits:  Math.round(b.debits  * 100) / 100,
      netFlow:      Math.round((b.credits - b.debits) * 100) / 100,
      transactionCount: b.count,
    }));

  return { monthly, rowCount };
}

// --- Server function ------------------------------------------------------- //

interface ParseInput {
  fileContent: string;
  fileName: string;
  fileSize: number;
}

export const parseBankStatementFn = createServerFn({ method: "POST" })
  .inputValidator((input: ParseInput) => input)
  .handler(async ({ data }) => {
    const { fileContent, fileName, fileSize } = data;

    // Sandbox: first non-whitespace token is "demo" or "test"
    const firstToken = fileContent.trimStart().split(/[\s,]/)[0].toLowerCase();
    if (firstToken === "demo" || firstToken === "test") {
      return buildSandbox(fileName, fileSize);
    }

    const { monthly, rowCount } = parseCSV(fileContent);

    if (monthly.length === 0) {
      throw new Error(
        "Could not detect date and amount columns in this CSV. " +
        "Make sure the file is a bank export with a header row containing " +
        "a date column and credit/debit or amount columns.",
      );
    }

    return {
      monthly,
      fileInfo: { name: fileName, size: fileSize, rowCount },
    } satisfies ParseBankStatementResult;
  });
