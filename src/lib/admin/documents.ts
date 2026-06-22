// Document-review server functions for the Super Admin Dashboard.
//
// Founders upload bank statements and P&L PDFs into two PRIVATE Supabase Storage
// buckets ('bank-statements', 'pl-uploads') under uid-scoped paths. The team can't
// read another user's files with the anon client, so previewing requires a signed
// URL minted with the service role. All reads/writes here are superadmin-gated.

import { createServerFn } from "@tanstack/react-start";
import { getServiceClient, logAdminAction, requireSuperadmin } from "./server";

interface AuthInput {
  accessToken: string;
}

export type DocFileType = "bank_statement" | "pl";

export interface AdminDocumentRow {
  id: string;
  fileType: DocFileType;
  bucket: string;
  fileName: string;
  fileSize: number | null;
  filePath: string | null;
  uploadedAt: string | null;
  businessId: string;
  businessName: string | null;
  ownerEmail: string | null;
  reviewStatus: "verified" | "rejected" | "pending";
  reviewNote: string | null;
  /** Bank-statement aggregates (null for P&L). */
  netFlow: number | null;
  monthsParsed: number | null;
}

const BUCKET: Record<DocFileType, string> = {
  bank_statement: "bank-statements",
  pl: "pl-uploads",
};

// --- List all uploaded documents -------------------------------------------
export const listDocumentsFn = createServerFn({ method: "POST" })
  .inputValidator((input: AuthInput) => input)
  .handler(async ({ data }): Promise<AdminDocumentRow[]> => {
    await requireSuperadmin(data.accessToken);
    const db = getServiceClient();

    const [
      { data: bankFiles },
      { data: plFiles },
      { data: businesses },
      { data: reviews },
      { data: bankMonthly },
    ] = await Promise.all([
      db
        .from("bank_statement_files")
        .select("id, business_id, file_name, file_size, file_path, synced_at"),
      db
        .from("pl_files")
        .select("id, business_id, file_name, file_size, file_path, synced_at"),
      db.from("businesses").select("id, owner_id, name"),
      db.from("document_reviews").select("file_id, file_type, status, note"),
      db.from("bank_statement_monthly").select("business_id, net_flow"),
    ]);

    // owner_id → email, resolved via the admin API.
    const { data: authData } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const emailById = new Map(
      (authData?.users ?? []).map((u) => [u.id, u.email ?? null]),
    );
    const bizById = new Map(
      (businesses ?? []).map((b) => [
        b.id as string,
        { name: b.name as string, ownerId: b.owner_id as string },
      ]),
    );
    const reviewByFile = new Map(
      (reviews ?? []).map((r) => [`${r.file_type}:${r.file_id}`, r]),
    );
    // Aggregate bank-statement net flow + parsed-month count per business.
    const bankAgg = new Map<string, { net: number; months: number }>();
    for (const m of bankMonthly ?? []) {
      const cur = bankAgg.get(m.business_id as string) ?? { net: 0, months: 0 };
      cur.net += Number(m.net_flow ?? 0);
      cur.months += 1;
      bankAgg.set(m.business_id as string, cur);
    }

    const mapRow = (
      f: Record<string, unknown>,
      fileType: DocFileType,
    ): AdminDocumentRow => {
      const biz = bizById.get(f.business_id as string);
      const review = reviewByFile.get(`${fileType}:${f.id}`);
      const agg =
        fileType === "bank_statement"
          ? bankAgg.get(f.business_id as string)
          : undefined;
      return {
        id: f.id as string,
        fileType,
        bucket: BUCKET[fileType],
        fileName: f.file_name as string,
        fileSize: (f.file_size as number) ?? null,
        filePath: (f.file_path as string) ?? null,
        uploadedAt: (f.synced_at as string) ?? null,
        businessId: f.business_id as string,
        businessName: biz?.name ?? null,
        ownerEmail: biz ? (emailById.get(biz.ownerId) ?? null) : null,
        reviewStatus:
          (review?.status as AdminDocumentRow["reviewStatus"]) ?? "pending",
        reviewNote: (review?.note as string) ?? null,
        netFlow: agg ? agg.net : null,
        monthsParsed: agg ? agg.months : null,
      };
    };

    const rows = [
      ...(bankFiles ?? []).map((f) => mapRow(f, "bank_statement")),
      ...(plFiles ?? []).map((f) => mapRow(f, "pl")),
    ];
    // Newest first.
    rows.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
    return rows;
  });

// --- Signed URL for inline preview -----------------------------------------
export const getDocumentUrlFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: AuthInput & { bucket: string; filePath: string }) => input,
  )
  .handler(async ({ data }): Promise<{ url: string }> => {
    await requireSuperadmin(data.accessToken);
    if (data.bucket !== "bank-statements" && data.bucket !== "pl-uploads") {
      throw new Error("Unknown bucket.");
    }
    const db = getServiceClient();
    const { data: signed, error } = await db.storage
      .from(data.bucket)
      .createSignedUrl(data.filePath, 3600); // 1 hour
    if (error || !signed?.signedUrl) {
      throw new Error("Could not generate a preview link for this file.");
    }
    return { url: signed.signedUrl };
  });

// --- Set review status ------------------------------------------------------
export const setDocumentStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: AuthInput & {
        fileId: string;
        fileType: DocFileType;
        status: "verified" | "rejected" | "pending";
        note?: string;
      },
    ) => input,
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId: actorId } = await requireSuperadmin(data.accessToken);
    const db = getServiceClient();
    const { error } = await db.from("document_reviews").upsert(
      {
        file_id: data.fileId,
        file_type: data.fileType,
        status: data.status,
        note: data.note ?? null,
        reviewer_id: actorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "file_id,file_type" },
    );
    if (error) throw new Error("Could not save the review status.");

    await logAdminAction(
      actorId,
      "document.status_set",
      {
        type: "document",
        id: data.fileId,
      },
      { status: data.status, fileType: data.fileType },
    );
    return { ok: true };
  });
