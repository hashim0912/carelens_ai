import type { FC, ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warn"
  | "critical"
  | "ai";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-2 text-muted",
  info: "border-[#bcd0f9] bg-primary-soft text-primary",
  success: "border-[#a9dcd6] bg-[#e6f6f4] text-success",
  warn: "border-[#f2d8a8] bg-[#fdf3e0] text-[#b07613]",
  critical: "border-[#f2bcc7] bg-[#fdeef1] text-critical",
  ai: "border-[#d4cbf9] bg-[#f1edfe] text-ai",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const Badge: FC<BadgeProps> = ({
  tone = "neutral",
  icon,
  children,
  className = "",
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]} ${className}`}
  >
    {icon}
    {children}
  </span>
);