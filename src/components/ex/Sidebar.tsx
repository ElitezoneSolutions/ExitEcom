import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutGrid,
  Building2,
  Link as LinkIcon,
  Gauge,
  ShieldAlert,
  TrendingUp,
  Zap,
  BarChart3,
  FileText,
  Folder,
  Bookmark,
  Download,
  Settings,
  CreditCard,
  LogOut,
} from "lucide-react";
import { Logo } from "./Logo";
import { useBusinessData } from "@/hooks/useBusinessData";

const groups = [
  {
    label: "Overview",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutGrid },
      { to: "/app/profile", label: "Business Profile", icon: Building2 },
      { to: "/app/data-sources", label: "Data Sources", icon: LinkIcon },
    ],
  },
  {
    label: "Exit Analysis",
    items: [
      { to: "/app/exit-score", label: "Exit Readiness Score", icon: Gauge },
      { to: "/app/risk-scanner", label: "Risk Scanner", icon: ShieldAlert },
      { to: "/app/valuation", label: "Valuation Engine", icon: TrendingUp },
      { to: "/app/optimization", label: "Optimization Plan", icon: Zap },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/app/reports", label: "Saved Reports", icon: Bookmark },
      { to: "/app/reports", label: "Downloads", icon: Download },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/app/settings", label: "Settings", icon: Settings },
      { to: "/app/billing", label: "Billing", icon: CreditCard },
    ],
  },
] as const;

export function Sidebar() {
  const { pathname } = useLocation();
  const { business } = useBusinessData();
  const businessName = business.name || "Your business";
  const ownerInitial = business.ownerName?.[0] ?? "?";
  const ownerName = business.ownerName || "Owner";

  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 bg-[var(--sidebar)] border-r border-[var(--border-warm)]">
      <div className="px-6 pt-7 pb-5 border-b border-[var(--border-warm)]">
        <Logo />
        <div className="mt-4 inline-flex items-center gap-2 px-2.5 py-1 rounded-sm bg-[var(--sidebar-active)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          <span className="text-[11px] text-[var(--text-secondary)] truncate">
            {businessName}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 mb-2 text-[10px] tracking-[0.08em] uppercase text-[var(--text-muted)] font-semibold">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.to;
                const Icon = it.icon;
                return (
                  <li key={it.label}>
                    <Link
                      to={it.to}
                      className="flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors group relative"
                      style={{
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                        backgroundColor: active
                          ? "var(--sidebar-active)"
                          : "transparent",
                      }}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--accent)]" />
                      )}
                      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4">
        <Link
          to="/app/buyer-matching"
          className="flex items-center justify-between w-full px-4 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-md text-sm font-medium transition-colors"
        >
          <span>Find a Buyer</span>
          <span>→</span>
        </Link>
      </div>

      <div className="border-t border-[var(--border-warm)] px-4 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--sidebar-active)] flex items-center justify-center text-[var(--accent)] font-display text-sm">
          {ownerInitial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--text-primary)] truncate">
            {ownerName}
          </div>
          <Link
            to="/login"
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] inline-flex items-center gap-1"
          >
            <LogOut className="w-3 h-3" /> Log out
          </Link>
        </div>
      </div>
    </aside>
  );
}
