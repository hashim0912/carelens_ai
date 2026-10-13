import { ArrowRight, FileDown, ShieldAlert } from "lucide-react";
import type { FC } from "react";
import type { ClinicalInterpretation } from "@carelens/ml";
import type { InferenceResult } from "../../lib/api";
import { Badge, Button, Card, CardBody, CardHeader } from "../ui";

export interface OverviewResultCardProps {
  result: InferenceResult;
  interpretation: ClinicalInterpretation | null;
  onOpenFindings: () => void;
  onExportPdf: () => void;
  reportBusy: boolean;
  onEscalate: () => void;
}

const CONFIDENCE_TONE = (confidence: number) =>
  confidence > 0.85 ? "success" : confidence >= 0.5 ? "warn" : "critical";

export const OverviewResultCard: FC<OverviewResultCardProps> = ({
  result,
  interpretation,
  onOpenFindings,
  onExportPdf,
  reportBusy,
  onEscalate,
}) => {
  const topTwo = [...result.scores].sort((a, b) => b.confidence - a.confidence).slice(0, 2);
  const high = result.confidence > 0.85;
  const intermediate = result.confidence >= 0.5 && result.confidence <= 0.85;

  return (
    <Card>
      <CardHeader
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Result ready"
        subtitle="Preliminary AI classification — awaiting clinician review."
        actions={
          <Badge tone={CONFIDENCE_TONE(result.confidence)}>
            {(result.confidence * 100).toFixed(0)}% confidence
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {result.low_confidence_domain || intermediate ? (
          <div
            role="alert"
            className="rounded-lg border border-warn/40 bg-[#fdf3e0] p-3 text-xs text-[#8a5a10]"
          >
            {result.low_confidence_domain
              ? "Body part could not be confirmed for this scan — interpret with caution."
              : "Intermediate confidence — treat as advisory and correlate clinically."}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Primary impression</p>
            <p className="mt-0.5 text-xl font-bold text-navy">{result.label}</p>
            <p className="mt-0.5 text-xs text-muted">
              Model <span className="font-mono text-primary">{result.model}</span>
              {result.model_domain ? <> · {result.model_domain}</> : null}
            </p>
          </div>
          <div className="flex gap-1.5">
            {topTwo.map((s) => (
              <Badge key={s.label} tone={s.label === result.label ? "info" : "neutral"}>
                {s.label} {(s.confidence * 100).toFixed(0)}%
              </Badge>
            ))}
          </div>
        </div>

        {interpretation ? (
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-navy/80">
            {interpretation.meaning}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" onClick={onOpenFindings}>
            View full findings
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={onExportPdf} loading={reportBusy}>
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="ghost" onClick={onEscalate}>
            Escalate
          </Button>
        </div>
        <p className="text-xs text-muted">
          {high
            ? "High diagnostic confidence — still requires radiologist sign-off before it can guide care."
            : "This result is not diagnostic on its own. Confirm with formal radiological review."}
        </p>
      </CardBody>
    </Card>
  );
};