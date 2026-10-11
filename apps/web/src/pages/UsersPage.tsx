import { useQuery } from "@tanstack/react-query";
import { apiPaths } from "@carelens/shared";
import { apiFetch } from "../lib/api";

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

export function UsersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UsersResponse>(apiPaths.users),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-red-600">
        Failed to load users: {String((error as Error).message)}
      </p>
    );

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500">
          Manage staff and doctor accounts.
        </p>
      </header>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {data?.users.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Email</th>
                <th className="px-5 py-2 font-medium">Role</th>
                <th className="px-5 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-2 font-medium text-gray-900">
                    {u.name}
                  </td>
                  <td className="px-5 py-2">{u.email}</td>
                  <td className="px-5 py-2">
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-500">No users yet.</p>
        )}
      </div>
    </section>
  );
}