import { AlertOctagon, Crosshair, RotateCcw, ShieldAlert } from "lucide-react";
import type { FC } from "react";
import type { InferenceRejection } from "../../lib/api";
import { Badge, Button, Card, CardBody, CardHeader } from "../ui";

export interface RejectionPanelProps {
  rejection: InferenceRejection;
  onSelectModel: (id: string) => void;
  onReset: () => void;
  className?: string;
}

export const RejectionPanel: FC<RejectionPanelProps> = ({
  rejection,
  onSelectModel,
  onReset,
  className = "",
}) => {
  const notMedical = rejection.code === "NOT_A_MEDICAL_IMAGE";
  const reasons = rejection.input_analysis?.reasons ?? [];
  const suggested = rejection.suggested_models ?? [];

  return (
    <Card className={className}>
      <CardHeader
        icon={notMedical ? <AlertOctagon className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        title={notMedical ? "Not a medical image" : "Image / model mismatch"}
        subtitle={rejection.message}
        actions={<Badge tone={notMedical ? "critical" : "warn"}>No prediction</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-muted">
          <p className="text-navy">{rejection.message}</p>
          {rejection.detected_domain ? (
            <p className="mt-1.5">
              Detected domain:{" "}
              <span className="font-mono text-navy">{rejection.detected_domain}</span>
              {rejection.model_domain ? (
                <>
                  {" "}
                  · Selected model domain:{" "}
                  <span className="font-mono text-navy">{rejection.model_domain}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {reasons.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-line pt-2">
              {reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Crosshair className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {suggested.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              Try a model matched to this image
            </p>
            <div className="flex flex-wrap gap-2">
              {suggested.map((id) => (
                <Button key={id} variant="secondary" size="sm" onClick={() => onSelectModel(id)}>
                  Use {id}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <Button variant="secondary" className="w-full" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          Start a new study
        </Button>
        <p className="text-center text-xs text-muted">
          No prediction was produced for this study.
        </p>
      </CardBody>
    </Card>
  );
};