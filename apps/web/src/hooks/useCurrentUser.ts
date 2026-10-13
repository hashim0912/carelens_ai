import { useQuery } from "@tanstack/react-query";
import { apiPaths } from "@carelens/shared";
import { apiFetch, getAccessTokenPayload } from "../lib/api";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CurrentUser {
  id: string | null;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  initials: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "System Administrator",
  DOCTOR: "Radiologist",
  STAFF: "Clinical Staff",
};

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/**
 * The signed-in user's display identity. The JWT carries `sub`/`email`/`role`;
 * the display name is resolved from the API (`GET /users/:id`) and falls back to
 * the email local-part if that request is unavailable.
 */
export function useCurrentUser(): { user: CurrentUser; isLoading: boolean } {
  const payload = getAccessTokenPayload();
  const id = payload?.sub ?? null;
  const email = payload?.email ?? "";
  const role = payload?.role ?? "STAFF";

  const { data, isLoading } = useQuery({
    queryKey: ["me", id],
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    queryFn: () => apiFetch<UserRecord>(apiPaths.userById(id as string)),
  });

  const name = data?.name ?? "";
  const resolvedEmail = data?.email ?? email;
  const resolvedRole = data?.role ?? role;
  const fallbackName = resolvedEmail.split("@")[0] || "Signed-in user";

  const user: CurrentUser = {
    id,
    name: name || fallbackName,
    email: resolvedEmail,
    role: resolvedRole,
    roleLabel: ROLE_LABELS[resolvedRole] ?? resolvedRole,
    initials: initialsFrom(name, resolvedEmail),
  };

  return { user, isLoading: Boolean(id) && isLoading && !data };
}