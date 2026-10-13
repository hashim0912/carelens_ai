import { motion } from "framer-motion";
import type { FC, ReactNode } from "react";

export interface ToastProps {
  tone?: "success" | "info" | "critical";
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
}

const toneRing = {
  success: "border-success/30",
  info: "border-primary/25",
  critical: "border-critical/30",
};

export const Toast: FC<ToastProps> = ({ tone = "info", icon, title, body }) => (
  <motion.div
    initial={{ opacity: 0, y: 16, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 8, scale: 0.96 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
    role="status"
    className={`flex max-w-sm items-start gap-3 rounded-xl border ${toneRing[tone]} bg-surface p-4 shadow-pop`}
  >
    {icon ? (
      <span
        className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
          tone === "critical"
            ? "bg-[#fdeef1] text-critical"
            : tone === "success"
              ? "bg-[#e6f6f4] text-success"
              : "bg-primary-soft text-primary"
        }`}
      >
        {icon}
      </span>
    ) : null}
    <div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {body ? <p className="mt-0.5 text-xs text-muted">{body}</p> : null}
    </div>
  </motion.div>
);