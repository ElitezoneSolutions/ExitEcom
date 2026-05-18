type Status = "high" | "medium" | "low" | "connected" | "missing" | "partial" | "strong" | "premium" | "ready" | "pending";

const map: Record<Status, { bg: string; fg: string; label?: string }> = {
  high: { bg: "#DC2626", fg: "#FFFFFF", label: "HIGH" },
  medium: { bg: "#D97706", fg: "#FFFFFF", label: "MEDIUM" },
  low: { bg: "#1A56DB", fg: "#FFFFFF", label: "LOW" },
  connected: { bg: "rgba(22,163,74,0.12)", fg: "var(--positive)", label: "CONNECTED" },
  missing: { bg: "#EFF1F5", fg: "var(--text-muted)", label: "NOT CONNECTED" },
  partial: { bg: "rgba(217,119,6,0.12)", fg: "var(--risk-medium)", label: "PARTIAL" },
  strong: { bg: "transparent", fg: "var(--accent)", label: "STRONG ASSET" },
  premium: { bg: "transparent", fg: "var(--accent)", label: "PREMIUM" },
  ready: { bg: "rgba(22,163,74,0.12)", fg: "var(--positive)", label: "READY" },
  pending: { bg: "rgba(217,119,6,0.12)", fg: "var(--risk-medium)", label: "PENDING" },
};

export function StatusBadge({ status, children }: { status: Status; children?: React.ReactNode }) {
  const s = map[status];
  const isOutline = status === "strong" || status === "premium";
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium tracking-[0.16em] uppercase px-2.5 py-1 rounded-sm"
      style={{
        backgroundColor: s.bg,
        color: s.fg,
        border: isOutline ? `1px solid ${s.fg}` : "none",
      }}
    >
      {children ?? s.label}
    </span>
  );
}
