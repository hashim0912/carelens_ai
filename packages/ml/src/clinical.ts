/**
 * Clinical intake fields collected alongside a scan.
 *
 * IMPORTANT: these fields are *context only*. The bundled TFLite models are
 * pure image classifiers (`float32 [1,224,224,3]`) and take no tabular input,
 * so a clinical answer can never change the label/confidence/scores. The
 * fields exist so the person reading the result sees the image verdict next to
 * the relevant clinical information. The field sets below are chosen to match
 * what each model actually predicts: chest fields track pneumonia signs,
 * brain fields track tumour/space-occupying-lesion signs.
 */

import type { ModelDomain } from "./index.js";

export type ClinicalFieldType = "number" | "boolean" | "select";

export interface ClinicalFieldOption {
  value: string;
  label: string;
}

export interface ClinicalFieldSpec {
  id: string;
  label: string;
  type: ClinicalFieldType;
  required: boolean;
  help?: string;
  unit?: string;
  min?: number;
  max?: number;
  options?: readonly ClinicalFieldOption[];
}

export const SEX_OPTIONS: readonly ClinicalFieldOption[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

export const SMOKING_STATUS_OPTIONS: readonly ClinicalFieldOption[] = [
  { value: "never", label: "Never" },
  { value: "former", label: "Former" },
  { value: "current", label: "Current" },
];

/** Chest X-ray intake - aligned with pneumonia signs and risk factors. */
const CHEST_FIELDS: readonly ClinicalFieldSpec[] = [
  { id: "age", label: "Age", type: "number", required: true, min: 0, max: 120, unit: "years" },
  { id: "sex", label: "Sex", type: "select", required: true, options: SEX_OPTIONS },
  { id: "fever", label: "Fever", type: "boolean", required: true },
  { id: "cough", label: "Cough", type: "boolean", required: true },
  {
    id: "shortness_of_breath",
    label: "Shortness of breath",
    type: "boolean",
    required: true,
  },
  { id: "sputum", label: "Sputum production", type: "boolean", required: false },
  { id: "chest_pain", label: "Chest pain", type: "boolean", required: false },
  {
    id: "smoking_status",
    label: "Smoking status",
    type: "select",
    required: false,
    options: SMOKING_STATUS_OPTIONS,
  },
  { id: "immunocompromised", label: "Immunocompromised", type: "boolean", required: false },
  {
    id: "recent_hospitalization",
    label: "Hospitalized in the last 3 months",
    type: "boolean",
    required: false,
  },
  {
    id: "recent_antibiotics",
    label: "Antibiotics in the last 30 days",
    type: "boolean",
    required: false,
  },
];

/** Brain MRI intake - aligned with tumour / space-occupying-lesion signs. */
const BRAIN_FIELDS: readonly ClinicalFieldSpec[] = [
  { id: "age", label: "Age", type: "number", required: true, min: 0, max: 120, unit: "years" },
  { id: "sex", label: "Sex", type: "select", required: true, options: SEX_OPTIONS },
  { id: "headache", label: "Headache", type: "boolean", required: true },
  { id: "seizures", label: "Seizures", type: "boolean", required: true },
  { id: "vision_changes", label: "Vision changes", type: "boolean", required: false },
  {
    id: "focal_weakness",
    label: "Focal weakness or numbness",
    type: "boolean",
    required: false,
  },
  { id: "nausea_vomiting", label: "Nausea or vomiting", type: "boolean", required: false },
  { id: "prior_cancer", label: "Prior cancer", type: "boolean", required: false },
  { id: "immunosuppression", label: "Immunosuppression", type: "boolean", required: false },
];

export const CLINICAL_FIELDS: Record<ModelDomain, readonly ClinicalFieldSpec[]> = {
  chest: CHEST_FIELDS,
  brain: BRAIN_FIELDS,
};

export const CLINICAL_DOMAIN_LABELS: Record<ModelDomain, string> = {
  chest: "Chest X-ray",
  brain: "Brain MRI",
};

/** Field specs for a domain (a copy, so callers cannot mutate the catalog). */
export function getClinicalFields(domain: ModelDomain): ClinicalFieldSpec[] {
  return [...CLINICAL_FIELDS[domain]];
}

export const CLINICAL_CONTEXT_DISCLAIMER =
  "Clinical details are recorded as context only and do not change the image model's output.";

/**
 * A raw answer as held by a form: `""` means unanswered. Booleans are
 * tri-state (`true`/`false`/`""`) so "No" is distinguishable from "not asked".
 */
export type ClinicalAnswerValue = string | number | boolean | "";

export type ClinicalAnswers = Record<string, ClinicalAnswerValue>;

/** Fresh, all-unanswered answer map for a domain (used to initialise forms). */
export function emptyClinicalAnswers(domain: ModelDomain): ClinicalAnswers {
  const answers: ClinicalAnswers = {};
  for (const field of CLINICAL_FIELDS[domain]) answers[field.id] = "";
  return answers;
}

export interface ClinicalContextError {
  id: string;
  message: string;
}

export interface ClinicalContextResult {
  /** Present only when there are no errors. */
  context?: Record<string, unknown>;
  errors: ClinicalContextError[];
}

function isBlank(value: ClinicalAnswerValue | undefined): boolean {
  return value === undefined || value === "";
}

/**
 * Coerce and validate form answers into a clinical-context object that matches
 * the domain's zod schema on the server. Required-field and range/option checks
 * happen here so both web and mobile reject bad input before saving.
 */
export function buildClinicalContext(
  domain: ModelDomain,
  answers: ClinicalAnswers,
): ClinicalContextResult {
  const errors: ClinicalContextError[] = [];
  const context: Record<string, unknown> = {};

  for (const field of CLINICAL_FIELDS[domain]) {
    const raw = answers[field.id];

    if (isBlank(raw)) {
      if (field.required) {
        errors.push({ id: field.id, message: `${field.label} is required.` });
      }
      continue;
    }

    if (field.type === "number") {
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) {
        errors.push({ id: field.id, message: `${field.label} must be a number.` });
        continue;
      }
      if (field.min !== undefined && value < field.min) {
        errors.push({ id: field.id, message: `${field.label} must be at least ${field.min}.` });
        continue;
      }
      if (field.max !== undefined && value > field.max) {
        errors.push({ id: field.id, message: `${field.label} must be at most ${field.max}.` });
        continue;
      }
      context[field.id] = value;
      continue;
    }

    if (field.type === "boolean") {
      let value: boolean;
      if (typeof raw === "boolean") value = raw;
      else if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else {
        errors.push({ id: field.id, message: `${field.label} must be answered Yes or No.` });
        continue;
      }
      context[field.id] = value;
      continue;
    }

    // select
    const value = String(raw);
    const option = field.options?.find((o) => o.value === value);
    if (!option) {
      errors.push({ id: field.id, message: `${field.label} has an invalid value.` });
      continue;
    }
    context[field.id] = value;
  }

  if (errors.length > 0) return { errors };
  return { context, errors };
}

export interface DescribedClinicalAnswer {
  id: string;
  label: string;
  value: string;
}

/** Human-readable label/value pairs for the answers present in a context. */
export function describeClinicalContext(
  domain: ModelDomain,
  context: Record<string, unknown> | null | undefined,
): DescribedClinicalAnswer[] {
  if (!context) return [];
  const described: DescribedClinicalAnswer[] = [];
  for (const field of CLINICAL_FIELDS[domain]) {
    const raw = context[field.id];
    if (raw === undefined || raw === null || raw === "") continue;
    let value: string;
    if (field.type === "boolean") {
      value = raw === true || raw === "true" ? "Yes" : "No";
    } else if (field.type === "select") {
      value = field.options?.find((o) => o.value === String(raw))?.label ?? String(raw);
    } else {
      value = field.unit ? `${String(raw)} ${field.unit}` : String(raw);
    }
    described.push({ id: field.id, label: field.label, value });
  }
  return described;
}
