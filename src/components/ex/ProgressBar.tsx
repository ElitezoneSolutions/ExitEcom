export function ProgressBar({ value, color = "var(--accent)", track = "var(--border-warm)", height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, backgroundColor: track }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(value, 100))}%`, backgroundColor: color }} />
    </div>
  );
}
