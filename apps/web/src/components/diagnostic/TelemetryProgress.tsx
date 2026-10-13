import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import type { FC } from "react";

export type TelemetryStage = {
  id: number;
  label: string;
  detail?: string;
};

export interface TelemetryProgressProps {
  stages: TelemetryStage[];
  currentStage: number;
  isActive: boolean;
  stageProgress?: number;
  className?: string;
}

export const TelemetryProgress: FC<TelemetryProgressProps> = ({
  stages,
  currentStage,
  isActive,
  stageProgress = 0,
  className = "",
}) => {
  return (
    <div className={`relative flex flex-col gap-4 ${className}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sonarGradient" x1="0" y1="0" x2="100%" y2="0">
                <stop offset="0%" stopColor="rgba(40,100,240,0)" />
                <stop offset="50%" stopColor="rgba(115,87,245,0.28)" />
                <stop offset="100%" stopColor="rgba(40,100,240,0.06)" />
              </linearGradient>
            </defs>
            <motion.line
              x1="0"
              y1="50"
              x2="0"
              y2="50"
              stroke="url(#sonarGradient)"
              strokeWidth="10"
              animate={{
                x1: isActive ? ["0%", "100%"] : "0%",
                x2: isActive ? ["-20%", "80%"] : "-20%",
              }}
              transition={{ duration: 2.2, repeat: isActive ? Infinity : 0, ease: "linear" }}
            />
          </svg>
        </motion.div>
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Inference Telemetry
        </p>
        <p className="font-mono text-xs text-primary">
          Stage {Math.min(currentStage + 1, stages.length)} / {stages.length}
        </p>
      </div>

      <div className="relative z-10 grid gap-2">
        <AnimatePresence initial={false}>
          {stages.map((stage, idx) => {
            const isActiveStage = isActive && currentStage === idx;
            const isCompleted = currentStage > idx;
            const isPending = currentStage < idx;

            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  isActiveStage
                    ? "border-primary/40 bg-primary-soft text-navy shadow-[0_0_0_1px_rgba(40,100,240,0.12)_inset]"
                    : isCompleted
                      ? "border-success/30 bg-[#e6f6f4]/60 text-navy"
                      : "border-line bg-surface-2 text-muted"
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isActiveStage
                      ? "border-primary bg-primary text-white"
                      : isCompleted
                        ? "border-success bg-success text-white"
                        : "border-line bg-surface text-muted"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isActiveStage ? (
                    <motion.span
                      className="h-2 w-2 rounded-full bg-white"
                      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity }}
                    />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{stage.label}</span>
                  {stage.detail ? (
                    <span className="mt-0.5 block text-xs text-muted">{stage.detail}</span>
                  ) : null}
                </span>
                {isActiveStage ? (
                  <span className="flex flex-shrink-0 flex-col items-end gap-1">
                    <motion.span
                      className="font-mono text-xs text-primary"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      {Math.round(stageProgress)}%
                    </motion.span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                      <motion.span
                        className="block h-full rounded-full bg-primary"
                        animate={{ width: `${Math.max(0, Math.min(100, stageProgress))}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </span>
                  </span>
                ) : null}
                {isPending ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full border border-line" />
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};