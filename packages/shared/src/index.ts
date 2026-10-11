import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const userRoleSchema = z.enum(["ADMIN", "DOCTOR", "STAFF"]);

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  createdAt: z.string().datetime(),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: userRoleSchema,
});

export type User = z.infer<typeof userSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;

// ---------------------------------------------------------------------------
// Scan / Prediction
// ---------------------------------------------------------------------------

export const scanStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

// ---------------------------------------------------------------------------
// Clinical context (intake recorded alongside a scan)
//
// Context only: the image models take no tabular input, so these values never
// influence the prediction. Field ids mirror the catalog in `@carelens/ml`
// (`CLINICAL_FIELDS`); a cross-check test keeps the two in sync.
// ---------------------------------------------------------------------------

export const sexAnswerSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
export const smokingStatusSchema = z.enum(["never", "former", "current"]);

export const chestClinicalContextSchema = z.object({
  age: z.number().int().min(0).max(120),
  sex: sexAnswerSchema,
  fever: z.boolean(),
  cough: z.boolean(),
  shortness_of_breath: z.boolean(),
  sputum: z.boolean().optional(),
  chest_pain: z.boolean().optional(),
  smoking_status: smokingStatusSchema.optional(),
  immunocompromised: z.boolean().optional(),
  recent_hospitalization: z.boolean().optional(),
  recent_antibiotics: z.boolean().optional(),
});

export const brainClinicalContextSchema = z.object({
  age: z.number().int().min(0).max(120),
  sex: sexAnswerSchema,
  headache: z.boolean(),
  seizures: z.boolean(),
  vision_changes: z.boolean().optional(),
  focal_weakness: z.boolean().optional(),
  nausea_vomiting: z.boolean().optional(),
  prior_cancer: z.boolean().optional(),
  immunosuppression: z.boolean().optional(),
});

export const clinicalContextSchema = z.union([
  chestClinicalContextSchema,
  brainClinicalContextSchema,
]);

export type SexAnswer = z.infer<typeof sexAnswerSchema>;
export type SmokingStatus = z.infer<typeof smokingStatusSchema>;
export type ChestClinicalContext = z.infer<typeof chestClinicalContextSchema>;
export type BrainClinicalContext = z.infer<typeof brainClinicalContextSchema>;
export type ClinicalContext = z.infer<typeof clinicalContextSchema>;

/** The clinical-context schema for a body-part domain. */
export function clinicalContextSchemaForDomain(
  domain: "chest" | "brain",
): typeof chestClinicalContextSchema | typeof brainClinicalContextSchema {
  return domain === "brain" ? brainClinicalContextSchema : chestClinicalContextSchema;
}

export const scanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  patientId: z.string().uuid().nullable(),
  modelId: z.string(),
  status: scanStatusSchema,
  clinicalContext: clinicalContextSchema.nullish(),
  report: z.unknown().nullish(),
  createdAt: z.string().datetime(),
});

export const createScanSchema = z.object({
  patientId: z.string().uuid().nullish(),
  modelId: z.string(),
  clinicalContext: clinicalContextSchema.optional(),
});

export type Scan = z.infer<typeof scanSchema>;
export type ScanStatus = z.infer<typeof scanStatusSchema>;
export type CreateScanInput = z.infer<typeof createScanSchema>;

export const predictionSchema = z.object({
  id: z.string().uuid(),
  scanId: z.string().uuid(),
  modelId: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  details: z.array(
    z.object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
  createdAt: z.string().datetime(),
});

export type Prediction = z.infer<typeof predictionSchema>;

// ---------------------------------------------------------------------------
// Patient
// ---------------------------------------------------------------------------

export const patientSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dateOfBirth: z.string().nullish(),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
  createdAt: z.string().datetime(),
});

export const createPatientSchema = z.object({
  name: z.string().min(2).max(200),
  dateOfBirth: z.string().date().nullish(),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
});

export type Patient = z.infer<typeof patientSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const apiPaths = {
  register: "/auth/register",
  login: "/auth/login",
  refresh: "/auth/refresh",
  users: "/users",
  userById: (id: string) => `/users/${id}`,
  patients: "/patients",
  scans: "/scans",
  scanById: (id: string) => `/scans/${id}`,
  predictionForScan: (scanId: string) => `/predictions/${scanId}`,
  reports: "/reports",
} as const;

export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------------------------------------------------------------------------
// Model domains + inference validation contract
// ---------------------------------------------------------------------------

export const modelDomainSchema = z.enum(["chest", "brain"]);
export const detectedDomainSchema = z.enum(["chest", "brain", "unknown"]);

export const validationMetricsSchema = z.object({
  width: z.number(),
  height: z.number(),
  aspect: z.number(),
  colorfulness: z.number(),
  colored_pixel_fraction: z.number(),
  mean: z.number(),
  std: z.number(),
  dark_fraction: z.number(),
  bright_fraction: z.number(),
  white_fraction: z.number(),
  histogram_entropy: z.number(),
  unique_levels: z.number(),
  laplacian_variance: z.number(),
  edge_density: z.number(),
  neighbor_roughness: z.number(),
  flat_fraction: z.number(),
  center_to_mean: z.number(),
  symmetry: z.number(),
});

export const imageValidationSchema = z.object({
  is_medical_scan: z.boolean(),
  detected_domain: detectedDomainSchema,
  confidence: z.number(),
  reasons: z.array(z.string()),
  metrics: validationMetricsSchema,
});

/** 422 body returned by the inference service when an image is rejected. */
export const inferenceRejectionSchema = z.object({
  status: z.literal("REJECTED"),
  code: z.enum(["NOT_A_MEDICAL_IMAGE", "MODEL_IMAGE_MISMATCH"]),
  message: z.string(),
  selected_model: z.string().optional(),
  model_domain: modelDomainSchema.optional(),
  detected_domain: detectedDomainSchema.optional(),
  suggested_models: z.array(z.string()).optional(),
  input_analysis: imageValidationSchema,
});

export type ModelDomain = z.infer<typeof modelDomainSchema>;
export type DetectedDomain = z.infer<typeof detectedDomainSchema>;
export type ValidationMetrics = z.infer<typeof validationMetricsSchema>;
export type ImageValidation = z.infer<typeof imageValidationSchema>;
export type InferenceRejection = z.infer<typeof inferenceRejectionSchema>;

// ---------------------------------------------------------------------------
// Downloadable scan report (see POST /reports)
//
// The report content is either generated by a Groq chat model or, when no LLM
// is configured/unreachable, by a deterministic label-driven template. Either
// way the shape is the same and the prediction values are echoed verbatim.
// ---------------------------------------------------------------------------

export const reportContentSchema = z.object({
  summary: z.string().min(1).max(2000),
  findings: z.array(z.string().max(500)).max(20).default([]),
  recommendations: z.array(z.string().max(500)).max(20).default([]),
  redFlags: z.array(z.string().max(500)).max(20).default([]),
  limitations: z.array(z.string().max(500)).max(20).default([]),
});

/** A report cached on `Scan.report`. */
export const scanReportSchema = z.object({
  content: reportContentSchema,
  generatedBy: z.string(),
  aiGenerated: z.boolean(),
  modelId: z.string(),
  generatedAt: z.string().datetime(),
});

/**
 * The `report` field of the multipart POST /reports request (JSON string of
 * the classifier output + optional context). The prediction values are the
 * verbatim interpreter output; the server never re-derives them.
 */
export const reportRequestSchema = z.object({
  modelId: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  scores: z.array(
    z.object({ label: z.string(), confidence: z.number().min(0).max(1) }),
  ),
  accuracy: z.string().optional(),
  inputShape: z.array(z.number()).optional(),
  inputDtype: z.string().optional(),
  preprocessing: z.string().optional(),
  clinicalContext: z.record(z.unknown()).nullish(),
  scanId: z.string().uuid().optional(),
  lowConfidenceDomain: z.boolean().optional(),
});

export type ReportContent = z.infer<typeof reportContentSchema>;
export type ScanReport = z.infer<typeof scanReportSchema>;
export type ReportRequest = z.infer<typeof reportRequestSchema>;