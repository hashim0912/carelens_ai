import type { FC, HTMLAttributes, ReactNode } from "react";

export const Card: FC<HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <div className={`card ${className}`} {...rest}>
    {children}
  </div>
);

export interface CardHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export const CardHeader: FC<CardHeaderProps> = ({
  icon,
  title,
  subtitle,
  actions,
  className = "",
}) => (
  <div
    className={`flex items-start justify-between gap-3 border-b border-line px-5 py-4 ${className}`}
  >
    <div className="flex items-center gap-2.5">
      {icon ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {icon}
        </span>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
    </div>
    {actions}
  </div>
);

export const CardBody: FC<HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <div className={`px-5 py-5 ${className}`} {...rest}>
    {children}
  </div>
);