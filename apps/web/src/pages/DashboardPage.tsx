import { Activity, CheckCircle2, ScanLine, TriangleAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { describeClinicalContext, getModelDomain } from "@carelens/ml";
import { Card, CardHeader, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { useScans } from "../hooks/useScansSearch";

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
  const { data, isLoading, error, refetch } = useScans();
  const [params] = useSearchParams();
  const highlightId = params.get("scan");

  if (isLoading) return <LoadingState label="Loading dashboard…" />;
  if (error)
    return (
      <ErrorState
        message={String((error as Error).message)}
        onRetry={() => void refetch()}
      />
    );

  const counts = data?.counts ?? { total: 0, completed: 0, failed: 0 };
  const stats = [
    { label: "Total scans", value: counts.total, icon: ScanLine, tone: "text-primary bg-primary-soft" },
    { label: "Completed", value: counts.completed, icon: CheckCircle2, tone: "text-success bg-[#e6f6f4]" },
    { label: "Failed", value: counts.failed, icon: TriangleAlert, tone: "text-critical bg-[#fdeef1]" },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-navy">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          High-level overview of scans and clinical activity.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="card-pad flex items-center gap-4">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm text-muted">{c.label}</p>
                <p className="mt-0.5 text-2xl font-bold text-navy">{c.value}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<Activity className="h-4 w-4" />}
          title="Recent scans"
          subtitle="Saved on the server — images are not archived."
        />
        {data?.scans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Model</th>
                  <th className="px-5 py-2.5 font-medium">Context</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.scans.map((s) => (
                  <tr
                    key={s.id}
                    className={
                      s.id === highlightId
                        ? "bg-primary-soft"
                        : "transition-colors hover:bg-surface-2"
                    }
                  >
                    <td className="px-5 py-2.5 font-mono text-xs text-navy">{s.modelId}</td>
                    <td className="px-5 py-2.5 text-xs text-muted">
                      {contextSummary(s.modelId, s.clinicalContext)}
                    </td>
                    <td className="px-5 py-2.5 text-navy">{s.status}</td>
                    <td className="px-5 py-2.5 text-muted">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<ScanLine className="h-5 w-5" />}
            title="No scans yet"
            body="Run an analysis from the Scan workspace to populate this list."
            className="m-5 border-0 bg-transparent"
          />
        )}
      </Card>
    </section>
  );
}