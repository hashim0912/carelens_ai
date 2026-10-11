/**
 * Report content for a completed scan.
 *
 * Two layers, both pure (no I/O) so web, mobile and the API can share them:
 *
 *  1. `buildReportContent` - a deterministic, label-driven fallback. It only
 *     restates the supplied classifier output and general, non-prescriptive
 *     guidance; it never invents findings or numbers. Used whenever no LLM is
 *     configured/unreachable, and as the shape the LLM output is validated
 *     against.
 *  2. `buildReportPrompt` - a strictly *grounded* prompt for a chat model
 *     (Groq). The model may only restate the provided label/confidence/scores
 *     and domain-appropriate general guidance; it must not diagnose or invent
 *     facts.
 *
 * The zod contract for the returned shape lives in `@carelens/shared`
 * (`reportContentSchema`); a test in `packages/ml` asserts the fallback output
 * stays in sync with it.
 */

import type { ModelDomain } from "./index.js";
import { CLINICAL_DOMAIN_LABELS } from "./clinical.js";

export interface ReportScore {
  label: string;
  confidence: number;
}

/** The verbatim classifier output a report is built from. */
export interface ReportPrediction {
  modelId: string;
  label: string;
  confidence: number;
  scores: ReportScore[];
  /** Human-readable measured accuracy from the model registry (optional). */
  accuracy?: string;
  /** True when the validation gate could not confirm the body part. */
  lowConfidenceDomain?: boolean;
}

/** Structured report content. Mirrors `reportContentSchema` in `@carelens/shared`. */
export interface ReportContent {
  summary: string;
  findings: string[];
  recommendations: string[];
  redFlags: string[];
  limitations: string[];
}

export const REPORT_AI_LABEL = "AI-generated draft - not a diagnosis";
export const REPORT_TEMPLATE_LABEL = "Template guidance - not AI-generated";
export const REPORT_CONTEXT_NOTE =
  "Clinical details are recorded as context only and did not influence the model output.";
export const REPORT_DISCLAIMER =
  "This report is not a medical diagnosis. It accompanies an experimental image classifier and must be reviewed by a qualified clinician.";

interface Playbook {
  meaning: string;
  recommendations: string[];
  redFlags: string[];
}

const CHEST_PLAYBOOK: Record<string, Playbook> = {
  normal: {
    meaning:
      "The image was classified as showing no pneumonia pattern. A normal result does not exclude disease, especially early or subtle infection.",
    recommendations: [
      "Correlate with symptoms, vital signs and examination findings.",
      "If symptoms persist or worsen, arrange clinical review and consider repeat imaging.",
    ],
    redFlags: [
      "Difficulty breathing or breathlessness at rest.",
      "High fever that does not improve, or new confusion.",
      "Chest pain, coughing up blood, or bluish lips or face.",
    ],
  },
  pneumonia: {
    meaning:
      "The image was classified as showing a pattern consistent with pneumonia. This is a screening signal only and requires clinical confirmation.",
    recommendations: [
      "Arrange prompt clinical review and, where appropriate, a clinician-reviewed chest X-ray or CT.",
      "Provide the full symptom history; the classifier cannot identify the organism or disease severity.",
    ],
    redFlags: [
      "Difficulty breathing or low oxygen saturation.",
      "Confusion, very high fever, or rapidly worsening symptoms.",
      "Chest pain or coughing up blood.",
    ],
  },
  bacterial_pneumonia: {
    meaning:
      "The image was classified as showing a pattern the model associates with bacterial pneumonia. The model cannot confirm an organism. This is a screening signal only.",
    recommendations: [
      "Arrange prompt clinical review and, where appropriate, a clinician-reviewed chest X-ray or CT.",
      "Discuss the full symptom history with a clinician; organism identification requires laboratory testing.",
    ],
    redFlags: [
      "Difficulty breathing or low oxygen saturation.",
      "Confusion, very high fever, or rapidly worsening symptoms.",
      "Chest pain or coughing up blood.",
    ],
  },
  viral_pneumonia: {
    meaning:
      "The image was classified as showing a pattern the model associates with viral pneumonia. The model cannot confirm an organism. This is a screening signal only.",
    recommendations: [
      "Arrange prompt clinical review and, where appropriate, a clinician-reviewed chest X-ray or CT.",
      "Discuss the full symptom history with a clinician; organism identification requires laboratory testing.",
    ],
    redFlags: [
      "Difficulty breathing or low oxygen saturation.",
      "Confusion, very high fever, or rapidly worsening symptoms.",
      "Chest pain or coughing up blood.",
    ],
  },
};

const BRAIN_PLAYBOOK: Record<string, Playbook> = {
  no_tumor: {
    meaning:
      "The image was classified as showing no tumour pattern. A normal result does not exclude a space-occupying lesion, especially small or early findings.",
    recommendations: [
      "Correlate with neurological symptoms and examination findings.",
      "If symptoms persist or progress, arrange specialist review and consider MRI with contrast.",
    ],
    redFlags: [
      "A new seizure, or sudden weakness or numbness on one side.",
      "Severe or worsening headache with vomiting.",
      "New confusion, vision loss, or difficulty speaking.",
    ],
  },
  tumor: {
    meaning:
      "The image was classified as showing a pattern consistent with a space-occupying lesion. This is a screening signal only and requires specialist confirmation.",
    recommendations: [
      "Arrange specialist (neurology/neurosurgery) review and, where appropriate, MRI with contrast.",
      "Provide the full neurological history; the classifier cannot characterise the lesion.",
    ],
    redFlags: [
      "A new seizure, or sudden weakness or numbness on one side.",
      "Severe or worsening headache with vomiting.",
      "New confusion, vision loss, or difficulty speaking.",
    ],
  },
  glioma: {
    meaning:
      "The image was classified as showing a pattern the model associates with a glioma-type lesion. The model cannot confirm a tumour type. This is a screening signal only.",
    recommendations: [
      "Arrange specialist (neurology/neurosurgery) review and MRI with contrast.",
      "Provide the full neurological history; tumour type cannot be confirmed from a single image.",
    ],
    redFlags: [
      "A new seizure, or sudden weakness or numbness on one side.",
      "Severe or worsening headache with vomiting.",
      "New confusion, vision loss, or difficulty speaking.",
    ],
  },
  meningioma: {
    meaning:
      "The image was classified as showing a pattern the model associates with a meningioma-type lesion. The model cannot confirm a tumour type. This is a screening signal only.",
    recommendations: [
      "Arrange specialist (neurology/neurosurgery) review and MRI with contrast.",
      "Provide the full neurological history; tumour type cannot be confirmed from a single image.",
    ],
    redFlags: [
      "A new seizure, or sudden weakness or numbness on one side.",
      "Severe or worsening headache with vomiting.",
      "New confusion, vision loss, or difficulty speaking.",
    ],
  },
  pituitary: {
    meaning:
      "The image was classified as showing a pattern the model associates with a pituitary-region lesion. The model cannot confirm a tumour type. This is a screening signal only.",
    recommendations: [
      "Arrange specialist (endocrinology/neurology) review and MRI with contrast.",
      "Consider endocrine assessment; the classifier cannot assess hormone function.",
    ],
    redFlags: [
      "Sudden severe headache with visual loss (possible pituitary apoplexy).",
      "A new seizure, or sudden weakness or numbness on one side.",
      "New confusion, vision loss, or difficulty speaking.",
    ],
  },
};

const GENERIC_PLAYBOOK: Record<ModelDomain, Playbook> = {
  chest: {
    meaning:
      "The classifier produced this output from the chest X-ray. It is a screening signal only and requires clinical confirmation.",
    recommendations: [
      "Correlate with symptoms, vital signs and examination findings.",
      "If symptoms persist or worsen, arrange clinical review and consider repeat imaging.",
    ],
    redFlags: [
      "Difficulty breathing at rest, or blue lips or face.",
      "Chest pain, coughing up blood, or rapidly worsening symptoms.",
    ],
  },
  brain: {
    meaning:
      "The classifier produced this output from the brain MRI. It is a screening signal only and requires specialist confirmation.",
    recommendations: [
      "Correlate with neurological symptoms and examination findings.",
      "Arrange specialist review and, where appropriate, MRI with contrast.",
    ],
    redFlags: [
      "A new seizure, or sudden weakness or numbness on one side.",
      "Severe or worsening headache, or new confusion or vision loss.",
    ],
  },
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function playbookFor(domain: ModelDomain, label: string): Playbook {
  const table = domain === "brain" ? BRAIN_PLAYBOOK : CHEST_PLAYBOOK;
  const key = label.trim().toLowerCase();
  return table[key] ?? GENERIC_PLAYBOOK[domain];
}

/**
 * Deterministic, label-driven report content. Never invents facts: every
 * sentence is either the verbatim classifier output or general guidance.
 */
export function buildReportContent(
  domain: ModelDomain,
  prediction: ReportPrediction,
): ReportContent {
  const domainLabel = CLINICAL_DOMAIN_LABELS[domain];
  const playbook = playbookFor(domain, prediction.label);
  const confPct = formatPercent(prediction.confidence);
  const sorted = [...prediction.scores].sort((a, b) => b.confidence - a.confidence);
  const runnerUp = sorted.find((s) => s.label !== prediction.label);
  const margin = runnerUp ? prediction.confidence - runnerUp.confidence : undefined;

  const summaryParts = [
    `${domainLabel} classifier output: "${prediction.label}" at ${confPct} confidence.`,
    playbook.meaning,
  ];
  if (prediction.lowConfidenceDomain) {
    summaryParts.push(
      "The body part could not be confirmed, so treat this result as unreliable.",
    );
  } else if (runnerUp && margin !== undefined && margin < 0.15) {
    summaryParts.push(
      `The margin over the next class (${runnerUp.label}, ${formatPercent(runnerUp.confidence)}) is small, so the result is uncertain.`,
    );
  }

  const findings = [`Dominant class: ${prediction.label} (${confPct}).`];
  if (runnerUp) {
    findings.push(
      `Next class: ${runnerUp.label} (${formatPercent(runnerUp.confidence)}).`,
    );
  }
  findings.push(
    `Full score distribution: ${sorted
      .map((s) => `${s.label} ${formatPercent(s.confidence)}`)
      .join(", ")}.`,
  );

  const limitations = [
    prediction.accuracy
      ? `The classifier's measured accuracy is ${prediction.accuracy}; treat the output as a weak screening signal.`
      : "The classifier is an experimental, low-accuracy model; treat the output as a weak screening signal.",
    "The model does not localise findings and cannot rule out disease.",
    REPORT_CONTEXT_NOTE,
    REPORT_DISCLAIMER,
  ];

  return {
    summary: summaryParts.join(" "),
    findings,
    recommendations: playbook.recommendations,
    redFlags: playbook.redFlags,
    limitations,
  };
}

/**
 * Builds a strictly grounded prompt for a chat model. The model is told to use
 * only the supplied values and to never diagnose or invent facts.
 */
export function buildReportPrompt(
  domain: ModelDomain,
  prediction: ReportPrediction,
  clinicalContext?: Record<string, unknown> | null,
): { system: string; user: string } {
  const system = [
    "You are a careful clinical documentation assistant for CareLens AI, an experimental research tool.",
    "You write a short, plain-language accompaniment to an automated image-classifier result.",
    "Hard rules:",
    "- Never state or imply a diagnosis; always frame the classifier output as uncertain and non-diagnostic.",
    "- Use ONLY the values provided. Never invent findings, measurements, numbers, dates, or patient details.",
    "- Quote the reported label and confidence exactly; do not change them.",
    "- Recommendations must be general, non-prescriptive next steps; red flags are reasons to seek urgent care, not treatment.",
    "- Write for a clinician reader and keep it concise.",
    "- Respond with a single JSON object and nothing else.",
  ].join("\n");

  const payload = {
    domain,
    domainName: CLINICAL_DOMAIN_LABELS[domain],
    modelId: prediction.modelId,
    measuredAccuracy: prediction.accuracy ?? null,
    label: prediction.label,
    confidence: prediction.confidence,
    scores: prediction.scores,
    bodyPartConfirmed: prediction.lowConfidenceDomain ? false : true,
    clinicalContext: clinicalContext ?? null,
  };

  const user = [
    "Automated classifier output (verbatim, do not modify):",
    JSON.stringify(payload, null, 2),
    "",
    "Return a JSON object with exactly these keys:",
    '- "summary": string (2-3 sentences)',
    '- "findings": string[] (what the classifier reported and any uncertainty)',
    '- "recommendations": string[] (general next steps)',
    '- "redFlags": string[] (when to seek urgent care)',
    '- "limitations": string[] (why this is not a diagnosis)',
  ].join("\n");

  return { system, user };
}
