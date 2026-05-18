export function SectionLabel({ children, dark = false, gold = false }: { children: React.ReactNode; dark?: boolean; gold?: boolean }) {
  const cls = gold ? "label-caps-gold" : dark ? "label-caps-dark" : "label-caps";
  return <div className={cls}>{children}</div>;
}
