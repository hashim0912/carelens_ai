/**
 * Body-part domain a model is trained for. Used to reject cross-domain
 * inputs (e.g. a brain MRI sent to a chest model) before inference runs.
 */
export type ModelDomain = "chest" | "brain";

export interface ModelSpec {
  id: "brain" | "pneumonia" | "model" | "model_unquant" | "new_model";
  file: string;
  kind: "classification";
  /** Body-part domain. Chest models must not be used on brain images and vice versa. */
  domain: ModelDomain;
  inputShape: number[];
  /**
   * Number of output units, confirmed by running each model through
   * ai-edge-litert (P2). Must equal classLabels.length.
   */
  outputClasses: number;
  classLabels: string[];
  /**
   * Class *names* are inferred: the original APK shipped no label metadata.
   * The original Flutter app only referenced newPneumoniaModel.tflite and its
   * UI showed "Pneumonia Detected" / "Normal Breathing Pattern"; the other
   * four models are bundled-but-unused leftovers. Output *counts* are verified.
   */
  labelSource: "inferred" | "verified";
  /**
   * Measured accuracy on a balanced set of real, labeled chest X-rays
   * (18 normal / 18 pneumonia). These are tutorial-grade weights extracted
   * from the original APK and are NOT clinically reliable.
   */
  accuracy: string;
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: "brain",
    file: "brain_model.tflite",
    kind: "classification",
    domain: "brain",
    inputShape: [1, 224, 224, 3],
    outputClasses: 2,
    classLabels: ["no_tumor", "tumor"],
    labelSource: "inferred",
    accuracy: "unverified (brain MRI domain)",
  },
  {
    id: "pneumonia",
    file: "newPneumoniaModel.tflite",
    kind: "classification",
    domain: "chest",
    inputShape: [1, 224, 224, 3],
    outputClasses: 3,
    classLabels: ["NORMAL", "BACTERIAL_PNEUMONIA", "VIRAL_PNEUMONIA"],
    labelSource: "inferred",
    accuracy: "~40% measured (near chance)",
  },
  {
    id: "model",
    file: "model.tflite",
    kind: "classification",
    domain: "chest",
    inputShape: [1, 224, 224, 3],
    outputClasses: 2,
    classLabels: ["NORMAL", "PNEUMONIA"],
    labelSource: "inferred",
    accuracy: "~60% measured",
  },
  {
    id: "model_unquant",
    file: "model_unquant.tflite",
    kind: "classification",
    domain: "chest",
    inputShape: [1, 224, 224, 3],
    outputClasses: 2,
    classLabels: ["NORMAL", "PNEUMONIA"],
    labelSource: "inferred",
    accuracy: "~50% measured (near chance)",
  },
  {
    id: "new_model",
    file: "new_model.tflite",
    kind: "classification",
    domain: "brain",
    inputShape: [1, 224, 224, 3],
    outputClasses: 4,
    classLabels: ["glioma", "meningioma", "pituitary", "no_tumor"],
    labelSource: "inferred",
    accuracy: "unverified (brain MRI domain)",
  },
];

export const DEFAULT_MODEL_ID = "pneumonia" as const;

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Body-part domain for a model id, or undefined for an unknown model. */
export function getModelDomain(id: string): ModelDomain | undefined {
  return getModel(id)?.domain;
}

/** Model ids that belong to the given domain (used to suggest a correct model). */
export function modelsForDomain(domain: ModelDomain): ModelSpec[] {
  return MODELS.filter((m) => m.domain === domain);
}

export interface PreprocessingSpec {
  resize: number;
  /** Pixel scale such that scaled = pixel / scale + offset. */
  scale: number;
  offset: number;
  channels: "RGB" | "GRAYSCALE";
  /**
   * Range verified empirically on real labeled chest X-rays (P0 follow-up).
   * MobileNetV2-style models: `[-1,1]` gave the most balanced, best-scoring
   * outputs (raw = pixel / 127.5 - 1). `[0,1]` saturated inputs to one class.
   */
  range: "TBD" | "[-1,1]" | "[0,1]";
}

export const IMAGE_PREPROCESSING: PreprocessingSpec = {
  resize: 224,
  scale: 127.5,
  offset: -1,
  channels: "RGB",
  range: "[-1,1]",
};

/** Maps an 8-bit pixel channel to the model's expected input range. */
export function scalePixel(value: number): number {
  return value / IMAGE_PREPROCESSING.scale + IMAGE_PREPROCESSING.offset;
}

/**
 * The extracted models are low-accuracy educational weights; predictions must
 * never be presented as a medical diagnosis.
 */
export const MODEL_DISCLAIMER =
  "Experimental model - for research and education only. Not a medical diagnosis.";

export interface PredictionScores {
  label: string;
  confidence: number;
}

export function argmax(scores: number[], labels: string[]): PredictionScores | null {
  if (scores.length !== labels.length || scores.length === 0) return null;
  let best = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > scores[best]!) best = i;
  }
  return {
    label: labels[best]!,
    confidence: scores[best]!,
  };
}

export const CONFIDENCE_THRESHOLD = 0.5;

export * from "./validation.js";
export * from "./clinical.js";
export * from "./report.js";
export * from "./groq.js";
