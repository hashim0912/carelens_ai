import {
  Activity,
  ArrowUpRight,
  ClipboardCopy,
  FileDown,
  FolderClock,
  Lock,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import type { FC } from "react";
import type { ClinicalInterpretation, ModelDomain } from "@carelens/ml";
import { CLINICAL_DOMAIN_LABELS } from "@carelens/ml";
import type { InferenceResult } from "../../lib/api";
import type { CurrentUser } from "../../hooks/useCurrentUser";
import type { ScanRecord } from "../../hooks/useScansSearch";
import { Badge, Button, Card, CardBody, CardHeader, LoadingState } from "../ui";

export interface PatientRailProps {
  user: CurrentUser;
  submittedContext: Record<string, unknown> | null;
  domain: ModelDomain;
  result: InferenceResult | null;
  interpretation: ClinicalInterpretation | null;
  scans: ScanRecord[] | undefined;
  scansLoading: boolean;
  savedScanId: string | null;
  reportBusy: boolean;
  onExportPdf: () => void;
  onCopyFindings: () => void;
  onEscalate: () => void;
  onNewStudy: () => void;
  className?: string;
}

const PATIENT_FIELDS: Record<ModelDomain, { id: string; label: string }[]> = {
  chest: [
    { id: "age", label: "Age" },
    { id: "sex", label: "Sex" },
    { id: "view", label: "View" },
  ],
  brain: [
    { id: "age", label: "Age" },
    { id: "sex", label: "Sex" },
    { id: "sequence", label: "Sequence" },
    { id: "contrast", label: "Contrast" },
  ],
};

const scanStatusTone = (status: string) =>
  status.toUpperCase() === "COMPLETED"
    ? "success"
    : status.toUpperCase() === "FAILED"
      ? "critical"
      : "neutral";

export const PatientRail: FC<PatientRailProps> = ({
  user,
  submittedContext,
  domain,
  result,
  interpretation,
  scans,
  scansLoading,
  savedScanId,
  reportBusy,
  onExportPdf,
  onCopyFindings,
  onEscalate,
  onNewStudy,
  className = "",
}) => {
  const patientRows = submittedContext
    ? PATIENT_FIELDS[domain]
        .map((f) => ({ ...f, value: submittedContext[f.id] }))
        .filter((r) => r.value !== undefined && r.value !== null && r.value !== "")
        .map((r) => ({ ...r, value: String(r.value) }))
    : [];

  const related = (scans ?? []).filter((s) => s.id !== savedScanId).slice(0, 4);
  const relatedTotal = (scans ?? []).length;

  const topInsight = result
    ? [...result.scores].sort((a, b) => b.confidence - a.confidence)[0]
    : null;

  return (
    <aside className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader icon={<UserRound className="h-4 w-4" />} title="Patient" />
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              {user.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy">{user.name}</p>
              <p className="text-xs text-muted">{user.roleLabel}</p>
            </div>
          </div>

          {patientRows.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
              {patientRows.map((row) => (
                <div key={row.id} className="flex justify-between gap-2">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="font-medium text-navy">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-muted">
            {patientRows.length > 0
              ? "Values recorded at intake for the clinical record."
              : "No patient roster linked to this workspace yet — studies run here are unassigned."}
          </p>
          {savedScanId ? (
            <p className="text-[11px] text-muted">
              Study ID: <span className="font-mono text-navy">{savedScanId.slice(0, 8)}</span>
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Activity className="h-4 w-4" />} title="Key insights" />
        <CardBody className="space-y-3">
          {topInsight && result ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                <span className="text-sm font-medium text-navy">{result.label}</span>
                <Badge tone={result.confidence > 0.85 ? "success" : result.confidence >= 0.5 ? "warn" : "critical"}>
                  {(result.confidence * 100).toFixed(0)}%
                </Badge>
              </div>
              {[...result.scores]
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 2)
                .map((s) => (
                  <div key={s.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">{s.label}</span>
                      <span className="font-mono text-navy">{(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, s.confidence * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              {interpretation ? (
                <p className="text-[11px] leading-relaxed text-muted">{interpretation.meaning}</p>
              ) : null}
            </>
          ) : (
            <p className="py-2 text-center text-xs text-muted">
              No insights yet — run a study to see the top classes here.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<FolderClock className="h-4 w-4" />}
          title="Related studies"
          actions={<Badge>{relatedTotal}</Badge>}
        />
        <CardBody>
          {scansLoading ? (
            <LoadingState label="Loading studies…" className="py-4" />
          ) : related.length > 0 ? (
            <ul className="space-y-2">
              {related.map((scan) => (
                <li key={scan.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-navy">{scan.id.slice(0, 12)}</p>
                    <p className="text-[11px] text-muted">
                      {scan.modelId} · {new Date(scan.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <Badge tone={scanStatusTone(scan.status)}>{scan.status}</Badge>
                    <span
                      title="Original images are not archived, so side-by-side comparison is not available."
                      className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      Compare
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-center text-xs text-muted">
              No prior studies for this workspace — this is the first one.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ArrowUpRight className="h-4 w-4" />} title="Actions" />
        <CardBody className="space-y-2">
          <Button variant="primary" className="w-full" onClick={onExportPdf} loading={reportBusy} disabled={!result}>
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="secondary" className="w-full" onClick={onCopyFindings} disabled={!result}>
            <ClipboardCopy className="h-4 w-4" />
            Copy findings
          </Button>
          <Button variant="secondary" className="w-full" onClick={onEscalate} disabled={!result}>
            <Send className="h-4 w-4" />
            Escalate to senior
          </Button>
          <Button variant="ghost" className="w-full" onClick={onNewStudy}>
            <Plus className="h-4 w-4" />
            New study
          </Button>
          {!result ? (
            <p className="px-1 pt-1 text-center text-[11px] text-muted">
              {CLINICAL_DOMAIN_LABELS[domain]} tools unlock once a study completes.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </aside>
  );
};