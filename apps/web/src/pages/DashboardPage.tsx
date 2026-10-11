import { useQuery } from "@tanstack/react-query";
import { apiPaths } from "@carelens/shared";
import { describeClinicalContext, getModelDomain } from "@carelens/ml";
import { apiFetch } from "../lib/api";

interface ScansResponse {
  scans: Array<{
    id: string;
    modelId: string;
    status: string;
    clinicalContext?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  counts: { total: number; completed: number; failed: number };
}

function contextSummary(
  modelId: string,
  clinicalContext: Record<string, unknown> | null | undefined,
): string {
  const domain = getModelDomain(modelId);
  if (!domain || !clinicalContext) return "—";
  const rows = describeClinicalContext(domain, clinicalContext);
  if (rows.length === 0) return "—";
  return rows
    .slice(0, 3)
    .map((r) => `${r.label}: ${r.value}`)
    .join(" · ");
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scans"],
    queryFn: () => apiFetch<ScansResponse>(apiPaths.scans),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-red-600">
        Failed to load dashboard: {String((error as Error).message)}
      </p>
    );

  const counts = data?.counts ?? { total: 0, completed: 0, failed: 0 };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          High-level overview of scans and activity.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total scans", value: counts.total },
          { label: "Completed", value: counts.completed },
          { label: "Failed", value: counts.failed },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-medium text-gray-900">Recent scans</h2>
        </div>
        {data?.scans.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-5 py-2 font-medium">Model</th>
                <th className="px-5 py-2 font-medium">Context</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.scans.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-2 font-mono text-xs">{s.modelId}</td>
                  <td className="px-5 py-2 text-xs text-gray-500">
                    {contextSummary(s.modelId, s.clinicalContext)}
                  </td>
                  <td className="px-5 py-2">{s.status}</td>
                  <td className="px-5 py-2 text-gray-500">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-500">No scans yet.</p>
        )}
      </div>
    </section>
  );
}