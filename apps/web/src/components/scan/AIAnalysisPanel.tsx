import {
  AlertTriangle,
  BrainCircuit,
  Cpu,
  Fingerprint,
  Gauge,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import type { FC } from "react";
import type { ModelDomain, ModelSpec } from "@carelens/ml";
import { CLINICAL_DOMAIN_LABELS } from "@carelens/ml";
import type { InferenceResult } from "../../lib/api";
import { Badge, Card, CardBody, CardHeader, Field } from "../ui";

export interface AIAnalysisPanelProps {
  result: InferenceResult;
  model: ModelSpec | undefined;
  domain: ModelDomain;
  className?: string;
}

export const AIAnalysisPanel: FC<AIAnalysisPanelProps> = ({
  result,
  model,
  domain,
  className = "",
}) => {
  const confirmedDomain = result.input_analysis?.detected_domain ?? null;
  const gateVerified = !result.low_confidence_domain && Boolean(confirmedDomain);

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader
          icon={<BrainCircuit className="h-4 w-4" />}
          title="Model & techniques"
          subtitle="The exact model and preprocessing applied to this study."
          actions={<Badge tone="ai">{model?.kind ?? "classification"}</Badge>}
        />
        <CardBody className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-navy">{model?.id ?? result.model}</p>
                <p className="font-mono text-xs text-muted">{model?.file ?? "unknown weights"}</p>
              </div>
              <Badge tone={domain === "chest" ? "info" : "ai"}>
                {CLINICAL_DOMAIN_LABELS[domain]}
              </Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
              <InfoRow icon={<Cpu className="h-3.5 w-3.5" />} label="Input shape" value={result.input_shape?.join(" × ") ?? "—"} />
              <InfoRow icon={<ScanSearch className="h-3.5 w-3.5" />} label="Dtype" value={result.input_dtype ?? "—"} />
              <InfoRow icon={<Gauge className="h-3.5 w-3.5" />} label="Outputs" value={String(model?.outputClasses ?? result.scores.length)} />
              {result.preprocessing ? (
                <InfoRow icon={<Fingerprint className="h-3.5 w-3.5" />} label="Preprocessing" value={result.preprocessing} />
              ) : null}
              <InfoRow
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                label="Perf. notes"
                value={result.accuracy ?? model?.accuracy ?? "not reported"}
              />
              <InfoRow
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="Saliency method"
                value={result.saliency_base64 ? "Occlusion grid" : "Unavailable"}
              />
            </dl>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Domain gate"
          subtitle="Verification that the image matches the model's modality."
          actions={
            gateVerified ? (
              <Badge tone="success">Verified</Badge>
            ) : (
              <Badge tone="warn">
                {result.input_analysis?.detected_domain && result.input_analysis.detected_domain !== "unknown"
                  ? "Ambiguous"
                  : "Not confirmed"}
              </Badge>
            )
          }
        />
        <CardBody className="space-y-4">
          {result.input_analysis ? (
            <div className="rounded-lg border border-line bg-surface-2 p-4 text-xs">
              <p className="text-muted">
                Detected body part:{" "}
                <span className="font-medium text-navy">{result.input_analysis.detected_domain}</span>
                {result.input_analysis.confidence !== undefined && (
                  <>
                    {" "}
                    · gate confidence{" "}
                    <span className="font-mono text-navy">
                      {(result.input_analysis.confidence * 100).toFixed(0)}%
                    </span>
                  </>
                )}
              </p>
              {result.input_analysis.reasons && result.input_analysis.reasons.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                  {result.input_analysis.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">
              The inference service returned no image-validation metadata for this study.
            </p>
          )}
          {result.low_confidence_domain ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-warn/40 bg-[#fdf3e0] p-3 text-xs text-[#8a5a10]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                The body part matched the model's modality but could not be confirmed with confidence.
                Correlate carefully before acting on the classification.
              </span>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Cpu className="h-4 w-4" />}
          title="Decision-support honesty"
          subtitle="What this model can and cannot do."
        />
        <CardBody>
          <Field id="sed-notes" label="" className="mb-0">
            <ul className="space-y-2 text-xs leading-relaxed text-muted">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                This is a single-image classifier. It does not segment anatomy, measure lesions, or localize findings.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ai" />
                {result.accuracy ?? model?.accuracy ?? "Measured accuracy is not reported for this model."} Class scores are raw logits, not calibrated probabilities.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                A saliency overlay highlights regions the model attended to; it is an explanation surface, not expert localization.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-critical" />
                Not for primary diagnosis. A qualified radiologist must review every study before clinical use.
              </li>
            </ul>
          </Field>
        </CardBody>
      </Card>
    </div>
  );
};

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <dt className="text-muted">{label}</dt>
        <dd className="truncate font-medium text-navy" title={value}>
          {value}
        </dd>
      </div>
    </div>
  );
}