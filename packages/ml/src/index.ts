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
    file: "newPneumoniaModel_v2.tflite",
    kind: "classification",
    domain: "chest",
    inputShape: [1, 224, 224, 3],
    outputClasses: 2,
    classLabels: ["NORMAL", "PNEUMONIA"],
    labelSource: "inferred",
    accuracy: "ImageNet-pretrained DenseNet121 baseline (requires CheXpert fine-tuning for clinical accuracy)",
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

/**
 * Saliency map (occlusion-sensitivity heatmap) for each model.
 * Generated with saliency/gen_saliency.py using 16x16 occlusion patches.
 * Shows which image regions most influence the model's decision.
 * Note: Chest models do NOT reliably localize lung fields - see PRODUCT.md §8.4.
 */
export const SALIENCY_IMAGES: Record<string, string> = {
  pneumonia: "/saliency/carlens_pneumonia_saliency.png",
  model: "/saliency/carlens_model_saliency.png",
  model_unquant: "/saliency/carlens_model_unquant_saliency.png",
  brain: "/saliency/carlens_brain_saliency.png",
  new_model: "/saliency/carlens_new_model_saliency.png",
};

export function getSaliencyImage(modelId: string): string | undefined {
  return SALIENCY_IMAGES[modelId];
}

/**
 * Clinical interpretation guidance per model output label.
 * Provides context-appropriate next steps and red flags.
 * Does NOT replace clinical judgment.
 */
export const CLINICAL_INTERPRETATION: Record<string, Record<string, {
  meaning: string;
  nextSteps: string[];
  redFlags: string[];
}>> = {
  pneumonia: {
    NORMAL: {
      meaning: "No radiographic evidence of pneumonia detected by this model.",
      nextSteps: [
        "Correlate clinically - if symptoms persist, consider repeat imaging or alternative diagnosis",
        "Review for non-infectious causes of symptoms (e.g., COPD exacerbation, heart failure, PE)",
      ],
      redFlags: [
        "High clinical suspicion despite negative imaging warrants further workup",
        "Immunocompromised patients may have atypical presentations",
      ],
    },
    PNEUMONIA: {
      meaning: "Pattern suggestive of pneumonia (binary classification).",
      nextSteps: [
        "Clinical correlation required - this model cannot distinguish bacterial vs viral",
        "Obtain labs (CBC, CRP, procalcitonin), blood cultures if admitted",
        "Empiric antibiotics per severity and local guidelines",
        "Follow-up imaging in 4-6 weeks",
      ],
      redFlags: [
        "Model is ImageNet-pretrained baseline - requires CheXpert fine-tuning for clinical accuracy",
        "Severe sepsis/septic shock criteria: emergent intervention",
        "Consider TB, fungal, or neoplastic mimics in appropriate contexts",
      ],
    },
  },
  model: {
    NORMAL: {
      meaning: "No radiographic evidence of pneumonia detected by this binary model.",
      nextSteps: [
        "Correlate clinically; consider alternative diagnoses if symptoms persist",
        "This model has ~60% measured accuracy - clinical correlation essential",
      ],
      redFlags: [
        "High pre-test probability of pneumonia despite negative result warrants further imaging",
      ],
    },
    PNEUMONIA: {
      meaning: "Pattern suggestive of pneumonia (binary classification).",
      nextSteps: [
        "Clinical correlation required - this model cannot distinguish bacterial vs viral",
        "Obtain labs (CBC, CRP, procalcitonin), blood cultures if admitted",
        "Empiric antibiotics per severity and local guidelines",
        "Follow-up imaging in 4-6 weeks",
      ],
      redFlags: [
        "Model accuracy ~60% - do not rely solely on this prediction",
        "Severe sepsis/septic shock criteria: emergent intervention",
        "Consider TB, fungal, or neoplastic mimics in appropriate contexts",
      ],
    },
  },
  model_unquant: {
    NORMAL: {
      meaning: "No radiographic evidence of pneumonia (unquantized model, ~50% accuracy).",
      nextSteps: [
        "Same as binary model above - clinical correlation mandatory",
        "This unquantized variant performs worse than quantized model.tflite",
      ],
      redFlags: [
        "Lower accuracy than quantized counterpart - higher false negative risk",
      ],
    },
    PNEUMONIA: {
      meaning: "Pattern suggestive of pneumonia (unquantized model).",
      nextSteps: [
        "Same clinical workup as binary model",
        "Consider this result less reliable than model.tflite",
      ],
      redFlags: [
        "~50% accuracy (near chance) - treat as hypothesis-generating only",
      ],
    },
  },
  brain: {
    no_tumor: {
      meaning: "No brain tumor detected on MRI by this model.",
      nextSteps: [
        "Clinical correlation - consider other causes of neurologic symptoms",
        "If high suspicion persists, dedicated neuroradiology review recommended",
      ],
      redFlags: [
        "Small or skull-base lesions may be missed",
        "Non-neoplastic pathology (MS, stroke, infection) not evaluated",
      ],
    },
    tumor: {
      meaning: "Possible brain tumor detected on MRI.",
      nextSteps: [
        "Urgent neurosurgery/neuro-oncology referral",
        "Contrast-enhanced MRI for better characterization",
        "Multidisciplinary tumor board discussion",
      ],
      redFlags: [
        "Mass effect, midline shift, or hydrocephalus: neurosurgical emergency",
        "This is an unverified educational model - confirm with radiologist",
      ],
    },
  },
  new_model: {
    glioma: {
      meaning: "Pattern suggestive of glioma (primary brain tumor).",
      nextSteps: ["Urgent neuro-oncology referral", "Advanced MRI with spectroscopy/perfusion", "Biopsy for molecular characterization (IDH, 1p/19q, MGMT)"],
      redFlags: ["Higher-grade features (enhancement, necrosis) = worse prognosis", "Midline shift or edema with mass effect: consider steroids + urgent surgery"],
    },
    meningioma: {
      meaning: "Pattern suggestive of meningioma (extra-axial tumor).",
      nextSteps: ["Neurosurgery referral for resection consideration", "Contrast MRI to assess dural tail and vascular supply", "Hormone receptor status if recurrent"],
      redFlags: ["Brain invasion (WHO grade II/III) changes management", "Critical location (skull base, optic nerve) requires subspecialty expertise"],
    },
    pituitary: {
      meaning: "Pattern suggestive of pituitary adenoma.",
      nextSteps: ["Endocrinology workup (prolactin, IGF-1, cortisol, ACTH, LH/FSH, TSH)", "Sellal/parasellar MRI with dynamic contrast", "Visual field testing if suprasellar extension"],
      redFlags: ["Pituitary apoplexy: sudden headache, vision loss, ophthalmoplegia = emergency", "Macroadenoma >1cm with chiasmal compression: urgent decompression"],
    },
    no_tumor: {
      meaning: "No tumor detected in 4-class brain model.",
      nextSteps: ["Consider demyelination, infarct, infection, metabolic etiologies", "Neurology referral for workup"],
      redFlags: ["Small lesions below resolution limit may be missed"],
    },
  },
};

export function getClinicalInterpretation(modelId: string, label: string) {
  return CLINICAL_INTERPRETATION[modelId]?.[label] ?? {
    meaning: "No specific guidance available for this result.",
    nextSteps: ["Clinical correlation recommended"],
    redFlags: ["Do not base clinical decisions solely on this model output"],
  };
}

export * from "./validation.js";
export * from "./clinical.js";
export * from "./report.js";
export * from "./groq.js";
