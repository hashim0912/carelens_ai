import { motion, AnimatePresence } from "framer-motion";
import { Activity, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import type { FC } from "react";
import type { InferenceResult } from "../../lib/api";
import { Badge } from "../ui";
import type { InferenceRejection } from "../../lib/api";

export interface ScanPageHeaderProps {
  busy: boolean;
  result: InferenceResult | null;
  rejection: InferenceRejection | null;
  onResetStudy: () => void;
}

export const ScanPageHeader: FC<ScanPageHeaderProps> = ({
  busy,
  result,
  rejection,
  onResetStudy,
}) => {
  const confidence = result
    ? result.confidence > 0.85
      ? { tone: "success" as const, label: "High confidence", icon: <CheckCircle2 className="h-3.5 w-3.5" /> }
      : result.confidence >= 0.5
        ? { tone: "warn" as const, label: "Intermediate confidence", icon: <ShieldCheck className="h-3.5 w-3.5" /> }
        : { tone: "critical" as const, label: "Low confidence", icon: <ShieldCheck className="h-3.5 w-3.5" /> }
    : null;

  const status = busy
    ? { tone: "info" as const, label: "Inference running" }
    : rejection
      ? { tone: "critical" as const, label: "Study rejected" }
      : result
        ? { tone: "success" as const, label: "Study complete" }
        : { tone: "neutral" as const, label: "Awaiting study" };

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          CareLens AI · Diagnostic workspace
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy">Scan &amp; diagnose</h1>
        <p className="mt-1 text-sm text-muted">
          Chest X-ray &amp; brain MRI clinical decision support with AI-assisted review.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AnimatePresence mode="wait">
          {confidence && (
            <motion.div
              key={`conf-${confidence.label}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Badge tone={confidence.tone} icon={confidence.icon}>
                {confidence.label}
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>
        <Badge
          tone={status.tone}
          icon={
            <Activity className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} />
          }
        >
          {status.label}
        </Badge>
        <button
          type="button"
          onClick={onResetStudy}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:bg-surface-2 focus-ring"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New study
        </button>
      </div>
    </header>
  );
};