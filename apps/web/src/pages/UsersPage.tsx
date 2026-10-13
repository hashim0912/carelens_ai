import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon } from "lucide-react";
import { apiPaths } from "@carelens/shared";
import { apiFetch } from "../lib/api";
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingState } from "../components/ui";
import type { BadgeTone } from "../components/ui";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

interface UsersResponse {
  users: User[];
}

const roleTone: Record<string, BadgeTone> = {
  ADMIN: "critical",
  DOCTOR: "ai",
  STAFF: "info",
};

export function UsersPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UsersResponse>(apiPaths.users),
  });

  if (isLoading) return <LoadingState label="Loading users…" />;
  if (error)
    return <ErrorState message={String((error as Error).message)} onRetry={() => void refetch()} />;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-navy">Users</h1>
        <p className="mt-1 text-sm text-muted">Manage staff and doctor accounts.</p>
      </header>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon className="h-4 w-4" />}
          title="Team directory"
          subtitle={`${data?.users.length ?? 0} account(s)`}
        />
        {data?.users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-2.5 font-medium text-navy">{u.name}</td>
                    <td className="px-5 py-2.5 text-muted">{u.email}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={roleTone[u.role] ?? "neutral"}>{u.role}</Badge>
                    </td>
                    <td className="px-5 py-2.5 text-muted">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" />}
            title="No users yet"
            className="m-5 border-0 bg-transparent"
          />
        )}
      </Card>
    </section>
  );
}