import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export interface DropdownProps {
  /** The trigger. Rendered as a button with a11y attributes wired by the caller. */
  trigger: (setOpen: (open: boolean) => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}

/**
 * Lightweight accessible popover. Manages click-outside + Escape dismissal and
 * lets the trigger control state for streaming-in loading menus.
 */
export const Dropdown: FC<DropdownProps> = ({ trigger, align = "right", width = 280, children }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className="relative">
      {trigger(setOpen)}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ width }}
            className={`absolute z-40 mt-2 rounded-xl border border-line bg-surface py-1.5 shadow-pop ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const DropdownMenu: FC<{ items: DropdownItem[]; onNavigate?: () => void }> = ({
  items,
  onNavigate,
}) => (
  <div className="max-h-80 overflow-y-auto scrollbar-thin">
    {items.map((item, i) =>
      item.divider ? (
        <div key={i} className="my-1.5 h-px bg-line" />
      ) : (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick?.();
            onNavigate?.();
          }}
          className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${
            item.danger ? "text-critical" : "text-navy"
          } ${
            item.disabled
              ? "cursor-not-allowed opacity-45"
              : "hover:bg-surface-2"
          }`}
        >
          {item.icon ? <span className="text-muted">{item.icon}</span> : null}
          <span className="flex-1">{item.label}</span>
          {item.disabled ? (
            <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              soon
            </span>
          ) : null}
        </button>
      ),
    )}
  </div>
);