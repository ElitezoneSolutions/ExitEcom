export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-10">
      <div>
        <h1 className="font-display text-[38px] leading-none text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="mt-3 text-[15px] text-[var(--text-secondary)] max-w-2xl">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
