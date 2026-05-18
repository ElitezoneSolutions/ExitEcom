export function MetricTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="px-6 py-5">
      <div className="label-caps">{label}</div>
      <div className="font-display mt-2 text-[1.6rem] leading-none text-[var(--text-primary)]">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}
