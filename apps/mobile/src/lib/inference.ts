import {
  argmax,
  getModel,
  IMAGE_PREPROCESSING,
  MedicalImageRejectedError,
  MODEL_DISCLAIMER,
  scalePixel,
  validateImageForModel,
  type ImageValidation,
} from "@carelens/ml";
import {
  loadTensorflowModel,
  type TensorflowModel,
} from "react-native-fast-tflite";
import { MODEL_ASSETS } from "./models";

const cache = new Map<string, Promise<TensorflowModel>>();

function load(modelId: string): Promise<TensorflowModel> {
  let pending = cache.get(modelId);
  if (!pending) {
    const asset = MODEL_ASSETS[modelId];
    if (asset === undefined) throw new Error(`No asset for model ${modelId}`);
    pending = loadTensorflowModel(asset);
    cache.set(modelId, pending);
  }
  return pending;
}

function toProbabilities(values: number[]): number[] {
  const sum = values.reduce((acc, v) => acc + v, 0);
  const withinUnit = values.every((v) => v >= 0 && v <= 1);
  if (withinUnit && Math.abs(sum - 1) < 0.01) return values;

  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const denom = exps.reduce((acc, v) => acc + v, 0);
  return exps.map((v) => v / denom);
}

export interface DevicePrediction {
  modelId: string;
  label: string;
  confidence: number;
  scores: { label: string; confidence: number }[];
  accuracy: string;
  disclaimer: string;
  /** Validation verdict from the same gate used by the server. */
  validation: ImageValidation;
}

/**
 * Runs validation then on-device inference.
 *
 * Throws {@link MedicalImageRejectedError} (code `NOT_A_MEDICAL_IMAGE` or
 * `MODEL_IMAGE_MISMATCH`) — without running the model — when the image is not a
 * medical scan or belongs to a different body-part domain than the model.
 */
export async function runOnDevice(
  modelId: string,
  rgb: Uint8Array,
): Promise<DevicePrediction> {
  const spec = getModel(modelId);
  if (!spec) throw new Error(`Unknown model: ${modelId}`);

  const side = IMAGE_PREPROCESSING.resize;
  const validation = validateImageForModel(
    rgb,
    side,
    side,
    modelId,
    spec.domain,
  );

  const model = await load(modelId);
  const input = model.inputs[0];
  if (!input) throw new Error("Model has no inputs");

  let tensor: Uint8Array | Float32Array;
  if (input.dataType === "uint8") {
    tensor = rgb;
  } else {
    const floats = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) floats[i] = scalePixel(rgb[i]!);
    tensor = floats;
  }

  const outputs = await model.run([tensor]);
  const output = outputs[0];
  if (!output) throw new Error("Model produced no output");

  const floats =
    output instanceof Float32Array
      ? output
      : Float32Array.from(output as unknown as ArrayLike<number>);
  const probs = toProbabilities(Array.from(floats));

  const top = argmax(probs, spec.classLabels);
  if (!top) throw new Error("Output size does not match class labels");

  return {
    modelId,
    label: top.label,
    confidence: top.confidence,
    scores: spec.classLabels.map((label, i) => ({
      label,
      confidence: probs[i] ?? 0,
    })),
    accuracy: spec.accuracy,
    disclaimer: MODEL_DISCLAIMER,
    validation,
  };
}

export { MedicalImageRejectedError };
