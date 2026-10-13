import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BrainCircuit,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  LayoutDashboard,
  ScanLine,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { FC } from "react";

interface NavItem {
  label: string;
  to?: string;
  icon: FC<{ className?: string }>;
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Scan", to: "/scan", icon: ScanLine },
  { label: "Patients", icon: Users, disabled: true },
  { label: "Reports", icon: FileText, disabled: true },
  { label: "Analytics", icon: BarChart3, disabled: true },
  { label: "Settings", icon: Settings, disabled: true },
];

export interface NavSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Drawer variant is rendered inside the mobile slide-over. */
  variant?: "desktop" | "drawer";
  onNavigate?: () => void;
  className?: string;
}

export const NavSidebar: FC<NavSidebarProps> = ({
  collapsed,
  onToggle,
  variant = "desktop",
  onNavigate,
  className = "",
}) => {
  const isDrawer = variant === "drawer";
  const isCollapsed = collapsed && !isDrawer;

  return (
    <aside
      aria-label="Primary"
      className={`flex flex-col border-r border-line bg-surface ${
        isCollapsed ? "w-[72px]" : "w-60"
      } ${isDrawer ? "h-full w-64" : "sticky top-0 h-screen self-start"} ${className}`}
    >
      <div
        className={`flex h-[76px] items-center border-b border-line ${
          isCollapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-ai text-white shadow-sm">
            <BrainCircuit className="h-5 w-5" />
          </span>
          {!isCollapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy">CareLens AI</p>
              <p className="truncate text-[11px] text-muted">Smarter Scans. Clearer Answers.</p>
            </div>
          ) : null}
        </div>
        {!isDrawer && !isCollapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse navigation"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-navy focus-ring"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        ) : null}
        {!isDrawer && isCollapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand navigation"
            className="absolute left-[52px] mt-8 rounded-md border border-line bg-surface p-1 text-muted shadow-card transition-colors hover:text-navy focus-ring"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          if (item.disabled || !item.to) {
            return (
              <button
                key={item.label}
                type="button"
                disabled
                aria-disabled="true"
                title={`${item.label} — available in a future release`}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted/50 ${
                  isCollapsed ? "justify-center" : ""
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {!isCollapsed ? <span>{item.label}</span> : null}
              </button>
            );
          }
          return (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onNavigate}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-ring ${
                  isCollapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-navy"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  ) : null}
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {!isCollapsed ? <span>{item.label}</span> : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {!isCollapsed ? (
        <div className="p-3">
          <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-[#eef4ff] to-[#f3effe] p-4">
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-xl" />
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-ai shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="mt-3 text-xs font-semibold text-navy">AI-Powered Medical Imaging</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Better insights. Faster decisions.
            </p>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted/80">
              CareLens AI v2.0
            </p>
          </div>
        </div>
      ) : null}
    </aside>
  );
};