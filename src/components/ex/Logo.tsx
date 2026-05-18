export function Logo({ onDark = false, size = "md" }: { onDark?: boolean; size?: "sm" | "md" | "lg" }) {
  const fontSize = size === "lg" ? 28 : size === "sm" ? 18 : 22;
  const fg = onDark ? "var(--text-on-dark)" : "var(--text-primary)";
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg width={fontSize} height={fontSize} viewBox="0 0 32 32" fill="none">
        <rect x="2" y="2" width="28" height="28" rx="2" stroke="var(--accent)" strokeWidth="1.4" />
        <path d="M10 10h12M10 16h8M10 22h12" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="square" />
      </svg>
      <span className="font-display tracking-tight" style={{ fontSize, color: fg, lineHeight: 1, fontWeight: 500 }}>
        ExitEcom
      </span>
    </div>
  );
}
