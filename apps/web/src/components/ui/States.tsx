import { Loader2, TriangleAlert } from "lucide-react";
import type { FC, ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export const EmptyState: FC<EmptyStateProps> = ({
  icon,
  title,
  body,
  action,
  className = "",
}) => (
  <div
    className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface-2/60 px-6 py-10 text-center ${className}`}
  >
    {icon ? (
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-primary">
        {icon}
      </span>
    ) : null}
    <div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{body}</p> : null}
    </div>
    {action}
  </div>
);

export const LoadingState: FC<{ label?: string; className?: string }> = ({
  label = "Loading…",
  className = "",
}) => (
  <div className={`flex items-center justify-center gap-2 py-10 text-sm text-muted ${className}`}>
    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />
    <span>{label}</span>
  </div>
);

export const ErrorState: FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({ title = "Something went wrong", message, onRetry, className = "" }) => (
  <div
    role="alert"
    className={`flex flex-col items-center gap-2 rounded-xl border border-critical/30 bg-[#fdeef1] px-6 py-8 text-center ${className}`}
  >
    <TriangleAlert className="h-5 w-5 text-critical" />
    <p className="text-sm font-semibold text-navy">{title}</p>
    <p className="max-w-sm text-xs text-muted">{message}</p>
    {onRetry ? (
      <Button variant="danger" size="sm" onClick={onRetry} className="mt-1">
        Retry
      </Button>
    ) : null}
  </div>
);