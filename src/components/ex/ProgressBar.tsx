export function ProgressBar({
  value,
  color,
  track = "var(--border-warm)",
  height = 6,
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(value, 100));
  const defaultColor =
    pct >= 70
      ? "var(--positive)"
      : pct >= 40
      ? "var(--risk-medium)"
      : "var(--risk-critical)";

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height, backgroundColor: track }}
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          backgroundColor: color ?? defaultColor,
        }}
      />
    </div>
  );
}
