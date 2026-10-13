import {
  ArrowRight,
  ClipboardCopy,
  FileDown,
  FileText,
  Info,
  Send,
} from "lucide-react";
import type { FC } from "react";
import type { ModelDomain } from "@carelens/ml";
import { CLINICAL_CONTEXT_DISCLAIMER } from "@carelens/ml";
import type { InferenceResult } from "../../lib/api";
import { Badge, Button, Card, CardBody, CardHeader } from "../ui";

export interface ReportPanelProps {
  result: InferenceResult;
  interpretation: { meaning: string; nextSteps: string[]; redFlags: string[] } | null;
  submittedContext: Record<string, unknown> | null;
  domain: ModelDomain;
  savedScanId: string | null;
  reportBusy: boolean;
  reportError: string | null;
  onExportPdf: () => void;
  onCopyFindings: () => void;
  onEscalate: () => void;
  className?: string;
}

function contextRows(domain: ModelDomain, ctx: Record<string, unknown>) {
  const fields =
    domain === "chest"
      ? [
          { id: "age", label: "Age" },
          { id: "sex", label: "Sex" },
          { id: "view", label: "View" },
          { id: "fever", label: "Fever" },
          { id: "cough", label: "Cough" },
          { id: "dyspnea", label: "Dyspnea" },
          { id: "chestPain", label: "Chest pain" },
        ]
      : [
          { id: "age", label: "Age" },
          { id: "sex", label: "Sex" },
          { id: "sequence", label: "Sequence" },
          { id: "contrast", label: "Contrast" },
          { id: "headache", label: "Headache" },
          { id: "seizure", label: "Seizure" },
          { id: "focalDeficit", label: "Focal deficit" },
          { id: "alteredMentalStatus", label: "Altered mental status" },
        ];
  return fields
    .map((f) => ({ ...f, value: ctx[f.id] }))
    .filter((r) => r.value !== undefined && r.value !== null && r.value !== "")
    .map((r) => ({ id: r.id, label: r.label, value: String(r.value) }));
}

export const ReportPanel: FC<ReportPanelProps> = ({
  result,
  interpretation,
  submittedContext,
  domain,
  savedScanId,
  reportBusy,
  reportError,
  onExportPdf,
  onCopyFindings,
  onEscalate,
  className = "",
}) => {
  const sortedScores = [...result.scores].sort((a, b) => b.confidence - a.confidence);
  const rows = submittedContext ? contextRows(domain, submittedContext) : [];
  const shortId = savedScanId ? savedScanId.slice(0, 8) : null;

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader
          icon={<FileText className="h-4 w-4" />}
          title="Structured report"
          subtitle="Assembled from real study output — editable by clinicians in a production workflow."
          actions={<Badge tone="warn">Preliminary AI draft</Badge>}
        />
        <CardBody className="space-y-5">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Primary impression</p>
                <p className="mt-0.5 text-xl font-bold text-navy">{result.label}</p>
              </div>
              <Badge tone={result.confidence > 0.85 ? "success" : result.confidence >= 0.5 ? "warn" : "critical"}>
                {(result.confidence * 100).toFixed(1)}% confidence
              </Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-xs sm:grid-cols-4">
              <dd className="text-muted">
                Model <span className="font-mono text-navy">{result.model}</span>
              </dd>
              <dd className="text-muted">
                Domain <span className="capitalize text-navy">{result.model_domain ?? domain}</span>
              </dd>
              <dd className="text-muted">
                Input <span className="font-mono text-navy">{result.input_shape?.join(" × ")}</span>
              </dd>
              <dd className="text-muted">
                Scan ID <span className="font-mono text-navy">{shortId ?? "unsaved"}</span>
              </dd>
            </dl>
            {reportError ? (
              <p role="alert" className="mt-3 rounded-md border border-critical/30 bg-[#fdeef1] px-3 py-2 text-xs text-critical">
                {reportError}
              </p>
            ) : null}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Class probability distribution</h4>
            <ul className="mt-3 divide-y divide-line">
              {sortedScores.map((s) => (
                <li key={s.label} className="flex items-center justify-between py-1.5 text-sm">
                  <span className={s.label === result.label ? "font-semibold text-navy" : "text-muted"}>{s.label}</span>
                  <span className={`font-mono ${s.label === result.label ? "text-primary" : "text-muted"}`}>
                    {(s.confidence * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {interpretation ? (
            <div className="space-y-4">
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Interpretation</h4>
                <p className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-sm leading-relaxed text-navy/80">
                  {interpretation.meaning}
                </p>
              </section>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Recommendations</h4>
                <ul className="mt-2 space-y-1.5 text-sm text-navy/80">
                  {interpretation.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </section>
              {interpretation.redFlags.length > 0 ? (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-critical">Red flags</h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-navy/80">
                    {interpretation.redFlags.map((flag, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 text-critical">⚠</span>
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Clinical context</h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-xs sm:grid-cols-3">
                {rows.map((row) => (
                  <div key={row.id} className="flex justify-between gap-2">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className="font-medium text-navy">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-muted">{CLINICAL_CONTEXT_DISCLAIMER}</p>
            </section>
          ) : null}

          <section className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3 text-[11px] text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <p>
              This report is a preliminary AI draft for clinician review. It is not a signed radiological
              report, does not constitute a diagnosis, and must be confirmed by a qualified professional
              before guiding patient care.
            </p>
          </section>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="primary" onClick={onExportPdf} loading={reportBusy}>
              <FileDown className="h-4 w-4" />
              Download PDF report
            </Button>
            <Button variant="secondary" onClick={onCopyFindings}>
              <ClipboardCopy className="h-4 w-4" />
              Copy findings
            </Button>
            <Button variant="ghost" onClick={onEscalate}>
              <Send className="h-4 w-4" />
              Escalate
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};