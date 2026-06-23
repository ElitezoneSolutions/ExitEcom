import { StatusBadge } from "./StatusBadge";

// The team's verification decision on an uploaded financial document. Lives in
// the `document_reviews` table; founders see it read-only, admins set it.
export type DocumentReviewStatus = "verified" | "rejected" | "pending";

// Maps each review state onto a StatusBadge variant. Newly uploaded documents
// default to "pending", so a founder always sees either "Pending Verification"
// or "Approved" ("Rejected" is reserved for the admin reject path).
const VARIANT: Record<DocumentReviewStatus, "ready" | "high" | "pending"> = {
  verified: "ready",
  rejected: "high",
  pending: "pending",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentReviewStatus, string> = {
  verified: "Approved",
  rejected: "Rejected",
  pending: "Pending Verification",
};

export function DocumentStatusBadge({
  status,
}: {
  status: DocumentReviewStatus;
}) {
  return (
    <StatusBadge status={VARIANT[status]}>
      {DOCUMENT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
