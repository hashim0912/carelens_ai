import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FileText,
  Info,
  Sparkles,
} from "lucide-react";
import type { FC } from "react";
import type { InferenceResult } from "../../lib/api";
import type { ClinicalInterpretation } from "@carelens/ml";
import { CLINICAL_CONTEXT_DISCLAIMER, CLINICAL_DOMAIN_LABELS } from "@carelens/ml";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "../ui";

export interface ClinicalSummaryCardProps {
  result: InferenceResult;
  interpretation: ClinicalInterpretation | null;
  submittedContext: Record<string, unknown> | null;
  domain: "chest" | "brain";
  className?: string;
}

function describeContext(domain: "chest" | "brain", ctx: Record<string, unknown>) {
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
    .map((f) => ({ id: f.id, label: f.label, value: ctx[f.id] }))
    .filter((r) => r.value !== undefined && r.value !== null && r.value !== "")
    .map((r) => ({ id: r.id, label: r.label, value: String(r.value) }));
}

export const ClinicalSummaryCard: FC<ClinicalSummaryCardProps> = ({
  result,
  interpretation,
  submittedContext,
  domain,
  className = "",
}) => {
  const confidencePct = result.confidence * 100;
  const isHigh = confidencePct > 85;
  const isIntermediate = confidencePct >= 50 && confidencePct <= 85;
  const lowConfidenceDomain = result.low_confidence_domain === true;
  const gaugeColor = isHigh ? "#0f9f91" : isIntermediate ? "#e9a23b" : "#dc4c64";

  const sortedScores = [...result.scores].sort((a, b) => b.confidence - a.confidence);
  const contextRows = submittedContext ? describeContext(domain, submittedContext) : [];

  return (
    <Card className={className}>
      <CardHeader
        icon={<Activity className="h-4 w-4" />}
        title="Findings"
        subtitle="Model classification output — not a confirmed diagnosis."
        actions={
          <Badge tone={isHigh ? "success" : isIntermediate ? "warn" : "critical"}>
            {isHigh ? "High confidence" : isIntermediate ? "Intermediate" : "Low confidence"}
          </Badge>
        }
      />

      <CardBody className="space-y-5">
        {lowConfidenceDomain || isIntermediate ? (
          <div
            role="alert"
            className="rounded-lg border border-warn/40 bg-[#fdf3e0] p-3 text-[#8a5a10]"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  {lowConfidenceDomain ? "Body part could not be confirmed" : "Intermediate diagnostic confidence"}
                </p>
                <p className="mt-1 text-xs">
                  {lowConfidenceDomain
                    ? "This image appears to be a medical scan but the body part is ambiguous. Interpret with caution and correlate clinically."
                    : "Confidence is moderate (50–85%). Treat findings as advisory and confirm with clinical correlation or over-read."}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted">Primary impression</p>
              <h2 className="mt-1 text-2xl font-bold text-navy">{result.label}</h2>
              <p className="mt-1 text-sm text-muted">
                Model: <span className="font-mono text-primary">{result.model}</span>
                {result.model_domain ? (
                  <>
                    {" "}
                    · Domain: <span className="capitalize text-navy">{result.model_domain}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="h-20 w-20 -rotate-90" aria-hidden="true">
                  <circle cx="40" cy="40" r="34" stroke="#e1eaf6" strokeWidth="8" fill="none" />
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke={gaugeColor}
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    initial={{ strokeDashoffset: 213.628 }}
                    animate={{ strokeDashoffset: 213.628 * (1 - confidencePct / 100) }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    strokeDasharray="213.628"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-bold text-navy">{confidencePct.toFixed(0)}%</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Confidence</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {interpretation ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-success/30 bg-[#e6f6f4] p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                <div>
                  <p className="text-sm font-semibold text-navy">Interpretation</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy/80">{interpretation.meaning}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-navy">Suggested care pathway</h4>
              </div>
              <ul className="mt-3 space-y-2">
                {interpretation.nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-navy/80">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            {interpretation.redFlags.length > 0 ? (
              <div className="rounded-xl border border-critical/30 bg-[#fdeef1] p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-critical" />
                  <h4 className="text-sm font-semibold text-critical">Red flags / triage indicators</h4>
                </div>
                <ul className="mt-3 space-y-2">
                  {interpretation.redFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-navy/80">
                      <span className="mt-0.5 text-critical">⚠</span>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-line bg-surface p-4">
          <h4 className="text-sm font-semibold text-navy">Class probabilities</h4>
          <ul className="mt-4 space-y-3">
            {sortedScores.map((s) => {
              const isTop = s.label === result.label;
              return (
                <li key={s.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className={isTop ? "font-semibold text-navy" : "text-muted"}>{s.label}</span>
                    <span className={`font-mono ${isTop ? "text-primary" : "text-muted"}`}>
                      {(s.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className={`h-full rounded-full ${isTop ? "bg-primary" : "bg-[#a9b8d6]"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, s.confidence * 100))}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            Scores are raw model outputs and are not calibrated probabilities.
          </p>
        </div>

        <EmptyState
          icon={<Info className="h-5 w-5" />}
          title="No additional lesion-level findings"
          body="This image classifier returns only the class distribution above. It does not report lesion size, location, edema, or midline shift."
          className="items-start border-0 bg-surface-2 text-left"
        />

        {contextRows.length > 0 ? (
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-navy">
                {CLINICAL_DOMAIN_LABELS[domain]} clinical context
              </h4>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {contextRows.map((row) => (
                <div key={row.id} className="flex justify-between gap-2">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="font-medium text-navy">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-muted">{CLINICAL_CONTEXT_DISCLAIMER}</p>
          </div>
        ) : null}

        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          AI-generated result — requires clinical review. Source: model output (classifier). No human-reviewed findings recorded.
        </p>
      </CardBody>
    </Card>
  );
};