import type { ButtonHTMLAttributes, FC } from "react";

type Variant = "primary" | "secondary" | "ghost" | "ai" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-[#1f55d6] disabled:opacity-50 shadow-sm",
  secondary:
    "bg-surface text-navy border border-line hover:border-[#c7d6ee] hover:bg-surface-2 disabled:opacity-50",
  ghost: "text-muted hover:bg-surface-2 hover:text-navy disabled:opacity-50",
  ai: "bg-ai text-white hover:bg-[#6244e6] disabled:opacity-50 shadow-sm",
  danger:
    "bg-critical text-white hover:bg-[#c63a52] disabled:opacity-50 shadow-sm",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-[0.5rem]",
  md: "h-9.5 px-4 text-sm gap-2 rounded-[0.5rem]",
};

export const Button: FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center font-medium transition-colors focus-ring ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    {...rest}
  >
    {loading && (
      <span
        aria-hidden="true"
        className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70`}
      />
    )}
    {children}
  </button>
);