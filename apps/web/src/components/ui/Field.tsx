import type { FC, ReactNode } from "react";

/** Shared control styles for text/select inputs in this design system. */
export const inputClass =
  "w-full rounded-[0.5rem] border border-line bg-surface px-3 py-2 text-sm text-navy placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus-ring";

export interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  helper?: string;
  className?: string;
  children: ReactNode;
}

export const Field: FC<FieldProps> = ({
  id,
  label,
  required,
  hint,
  error,
  helper,
  className = "",
  children,
}) => (
  <div className={className}>
    <label htmlFor={id} className="mb-1.5 flex items-center gap-0.5 text-xs font-medium text-navy">
      {label}
      {required ? <span className="text-critical">*</span> : null}
      {hint ? <span className="ml-auto font-normal text-muted">{hint}</span> : null}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-critical">
        {error}
      </p>
    ) : helper ? (
      <p className="mt-1.5 text-xs text-muted">{helper}</p>
    ) : null}
  </div>
);