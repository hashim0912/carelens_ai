import { Bell, ChevronDown, Command, LogOut, Menu, Search, Settings, User } from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../ui/Badge";
import { Dropdown, DropdownMenu } from "../ui/Dropdown";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useScansSearch } from "../../hooks/useScansSearch";

const statusTone = (status: string) => {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED") return "critical" as const;
  if (status === "PROCESSING") return "info" as const;
  return "neutral" as const;
};

export interface GlobalHeaderProps {
  onOpenMenu: () => void;
  onLogout: () => void;
}

export const GlobalHeader: FC<GlobalHeaderProps> = ({ onOpenMenu, onLogout }) => {
  const navigate = useNavigate();
  const { user, isLoading } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results } = useScansSearch(query);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openScan(id: string) {
    setQuery("");
    setSearchOpen(false);
    navigate(`/dashboard?scan=${id}`);
  }

  const userMenuItems = [
    ...(user.role === "ADMIN"
      ? [{ label: "Add user", icon: <User className="h-4 w-4" />, onClick: () => navigate("/add-user") }]
      : []),
    { label: "Profile & preferences", icon: <User className="h-4 w-4" />, disabled: true },
    { label: "Workspace settings", icon: <Settings className="h-4 w-4" />, disabled: true },
    { label: "", divider: true },
    { label: "Sign out", icon: <LogOut className="h-4 w-4" />, danger: true, onClick: onLogout },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-navy focus-ring lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative mx-auto w-full max-w-xl">
        <div className="flex items-center gap-2 rounded-[0.6rem] border border-line bg-surface-2 px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <Search className="h-4 w-4 flex-shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Search patients, reports, or scan IDs..."
            aria-label="Search patients, reports, or scan IDs"
            className="h-9 w-full bg-transparent text-sm text-navy placeholder:text-muted/70 focus:outline-none"
          />
          <kbd className="hidden items-center gap-0.5 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted sm:flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </div>

        {searchOpen && query.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
            <p className="border-b border-line px-3.5 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Saved scans
            </p>
            {results.length === 0 ? (
              <p className="px-3.5 py-4 text-sm text-muted">
                No saved scans match “{query}”. Saved studies only — images are not indexed.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto scrollbar-thin">
                {results.map((scan) => (
                  <li key={scan.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => openScan(scan.id)}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-navy">
                          {scan.modelId}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {scan.id} · {new Date(scan.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <Badge tone={statusTone(scan.status)}>{scan.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <Dropdown
          width={300}
          trigger={(setOpen) => (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Notifications"
              className="relative rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-navy focus-ring"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical" />
            </button>
          )}
        >
          <div className="px-3.5 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Notifications
          </div>
          <div className="border-t border-line px-4 py-6 text-center">
            <p className="text-sm font-medium text-navy">No notifications</p>
            <p className="mt-1 text-xs text-muted">
              The notification center is not connected to the backend yet.
            </p>
          </div>
        </Dropdown>

        <Dropdown
          width={260}
          trigger={(setOpen) => (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-2 focus-ring"
              aria-label="Account menu"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-ai text-xs font-semibold text-white">
                {isLoading ? "…" : user.initials}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[140px] truncate text-sm font-medium text-navy">
                  {user.name}
                </span>
                <span className="block max-w-[140px] truncate text-[11px] text-muted">
                  {user.roleLabel}
                </span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
            </button>
          )}
        >
          <div className="px-4 py-3">
            <p className="truncate text-sm font-semibold text-navy">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <Badge tone="ai" className="mt-2">
              {user.roleLabel}
            </Badge>
          </div>
          <div className="border-t border-line">
            <DropdownMenu items={userMenuItems} />
          </div>
        </Dropdown>
      </div>
    </header>
  );
};