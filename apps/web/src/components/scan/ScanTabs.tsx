import { motion } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  FileText,
  LayoutDashboard,
  Scan as ScanIcon,
} from "lucide-react";
import type { FC } from "react";

export type ScanTabId = "overview" | "images" | "findings" | "ai-analysis" | "report";

const TABS: { id: ScanTabId; label: string; icon: FC<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "images", label: "Images", icon: ScanIcon },
  { id: "findings", label: "Findings", icon: Activity },
  { id: "ai-analysis", label: "AI Analysis", icon: BrainCircuit },
  { id: "report", label: "Report", icon: FileText },
];

export interface ScanTabsProps {
  active: ScanTabId;
  onChange: (tab: ScanTabId) => void;
  className?: string;
}

export const ScanTabs: FC<ScanTabsProps> = ({ active, onChange, className = "" }) => (
  <nav
    aria-label="Study sections"
    className={`flex w-full flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1 ${className}`}
  >
    {TABS.map((tab) => {
      const isActive = tab.id === active;
      const Icon = tab.icon;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.id)}
          className={`relative flex flex-1 basis-32 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring ${
            isActive ? "text-primary" : "text-muted hover:text-navy"
          }`}
        >
          {isActive ? (
            <motion.span
              layoutId="scan-tab-pill"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm"
            />
          ) : null}
          <Icon className="relative z-10 h-4 w-4" />
          <span className="relative z-10">{tab.label}</span>
        </button>
      );
    })}
  </nav>
);