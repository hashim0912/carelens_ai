/**
 * Medical-image validation gate (TypeScript mirror of
 * `apps/inference/app/validation.py`).
 *
 * Used by the mobile app to reject non-medical images and cross-domain inputs
 * *before* running `react-native-fast-tflite`, so on-device inference never
 * produces a confident bogus verdict. The Python service runs the same checks
 * authoritatively on the original upload.
 *
 * IMPORTANT: this is a heuristic gate. It is deliberately conservative and can
 * produce false positives/negatives. A learned gate model is recommended (see
 * the `GATE_MODEL` hook in the Python module).
 */

import type { ModelDomain } from "./index.js";

export type DetectedDomain = ModelDomain | "unknown";

/**
 * Thresholds, measured on real sample images (chest X-ray, brain MRI) and a set
 * of programmatically generated negatives (gradient, noise, text document,
 * colour/grayscale screenshot, grayscale photos). Values chosen to sit well
 * clear of the observed populations; see `apps/inference/app/validation.py`
 * for the measured table.
 */
export const VALIDATION_THRESHOLDS = {
  // Stage A - medical-scan plausibility
  minSide: 96,
  minAspect: 0.5,
  maxAspect: 1.6,
  maxColorfulness: 8.0,
  maxColoredFraction: 0.05,
  maxWhiteFraction: 0.3,
  minLaplacianVariance: 15.0,
  maxNeighborRoughness: 0.3,
  maxEdgeDensity: 0.45,
  minUniqueLevels: 180,
  maxFlatFraction: 0.85,
  maxFlatEntropy: 6.0,
  minStd: 10.0,
  // Stage B - domain detection
  brainMinDark: 0.35,
  brainMinCenterRatio: 1.3,
  brainMaxEntropy: 6.5,
  chestMaxDark: 0.2,
  chestMinEntropy: 6.0,
} as const;

export interface ValidationMetrics {
  width: number;
  height: number;
  aspect: number;
  colorfulness: number;
  colored_pixel_fraction: number;
  mean: number;
  std: number;
  dark_fraction: number;
  bright_fraction: number;
  white_fraction: number;
  histogram_entropy: number;
  unique_levels: number;
  laplacian_variance: number;
  edge_density: number;
  neighbor_roughness: number;
  flat_fraction: number;
  center_to_mean: number;
  symmetry: number;
}

export interface ImageValidation {
  is_medical_scan: boolean;
  detected_domain: DetectedDomain;
  confidence: number;
  reasons: string[];
  metrics: ValidationMetrics;
}

export type RejectionCode = "NOT_A_MEDICAL_IMAGE" | "MODEL_IMAGE_MISMATCH";

/** Thrown when an image is rejected before inference may run. */
export class MedicalImageRejectedError extends Error {
  readonly code: RejectionCode;
  readonly detectedDomain: DetectedDomain;
  readonly selectedModelId: string;
  readonly modelDomain: ModelDomain | undefined;

  constructor(
    code: RejectionCode,
    validation: ImageValidation,
    selectedModelId = "",
    modelDomain?: ModelDomain,
  ) {
    super(code);
    this.name = "MedicalImageRejectedError";
    this.code = code;
    this.detectedDomain = validation.detected_domain;
    this.selectedModelId = selectedModelId;
    this.modelDomain = modelDomain;
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function boxStd(g: Float64Array, w: number, h: number, k: number): Float64Array {
  const pad = k >> 1;
  const W = w + 2 * pad;
  const H = h + 2 * pad;
  const gp = new Float64Array(H * W);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(Math.max(y - pad, 0), h - 1);
    for (let x = 0; x < W; x++) {
      const sx = Math.min(Math.max(x - pad, 0), w - 1);
      gp[y * W + x] = g[sy * w + sx]!;
    }
  }
  const stride = W + 1;
  const ii = new Float64Array((H + 1) * stride);
  const ii2 = new Float64Array((H + 1) * stride);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = gp[y * W + x]!;
      ii[(y + 1) * stride + (x + 1)] =
        v + ii[y * stride + (x + 1)]! + ii[(y + 1) * stride + x]! - ii[y * stride + x]!;
      const v2 = v * v;
      ii2[(y + 1) * stride + (x + 1)] =
        v2 + ii2[y * stride + (x + 1)]! + ii2[(y + 1) * stride + x]! - ii2[y * stride + x]!;
    }
  }
  const out = new Float64Array(w * h);
  const n = k * k;
  const rect = (r1: number, c1: number, r2: number, c2: number): number =>
    ii[r2 * stride + c2]! - ii[r1 * stride + c2]! - ii[r2 * stride + c1]! + ii[r1 * stride + c1]!;
  const rect2 = (r1: number, c1: number, r2: number, c2: number): number =>
    ii2[r2 * stride + c2]! - ii2[r1 * stride + c2]! - ii2[r2 * stride + c1]! + ii2[r1 * stride + c1]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sum = rect(y, x, y + k, x + k);
      const sum2 = rect2(y, x, y + k, x + k);
      const mean = sum / n;
      const variance = Math.max(0, sum2 / n - mean * mean);
      out[y * w + x] = Math.sqrt(variance);
    }
  }
  return out;
}

/**
 * Compute the gate features from interleaved RGB bytes.
 * @param rgb interleaved R,G,B bytes (length = width*height*3)
 */
export function analyzeMedicalImage(
  rgb: Uint8Array,
  width: number,
  height: number,
): ImageValidation {
  const n = width * height;
  const gray = new Float64Array(n);
  let colorSum = 0;
  let colored = 0;
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    colorSum += spread;
    if (spread > 24) colored++;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum;
    const bin = Math.min(255, Math.max(0, Math.round(lum)));
    hist[bin] = hist[bin]! + 1;
  }
  const colorfulness = colorSum / n;
  const coloredFraction = colored / n;

  let graySum = 0;
  let graySumSq = 0;
  let dark = 0;
  let bright = 0;
  let white = 0;
  for (let i = 0; i < n; i++) {
    const v = gray[i]!;
    graySum += v;
    graySumSq += v * v;
    if (v < 45) dark++;
    if (v > 210) bright++;
    if (v > 235) white++;
  }
  const mean = graySum / n;
  const std = Math.sqrt(Math.max(0, graySumSq / n - mean * mean));

  let entropy = 0;
  let uniqueLevels = 0;
  for (let i = 0; i < 256; i++) {
    const p = hist[i]! / n;
    if (p > 0) {
      entropy -= p * Math.log2(p);
      uniqueLevels++;
    }
  }

  // Laplacian magnitude stats.
  let lapSum = 0;
  let lapSumSq = 0;
  let edges = 0;
  let lapCount = 0;
  if (width >= 3 && height >= 3) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const lap =
          4 * gray[i]! -
          gray[i - 1]! -
          gray[i + 1]! -
          gray[i - width]! -
          gray[i + width]!;
        lapSum += lap;
        lapSumSq += lap * lap;
        if (Math.abs(lap) > 30) edges++;
        lapCount++;
      }
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0;
  const laplacianVariance = lapCount
    ? Math.max(0, lapSumSq / lapCount - lapMean * lapMean)
    : 0;
  const edgeDensity = lapCount ? edges / lapCount : 0;

  // Neighbour roughness (high-frequency energy relative to contrast).
  let dxSum = 0;
  let dxCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      dxSum += Math.abs(gray[y * width + x + 1]! - gray[y * width + x]!);
      dxCount++;
    }
  }
  let dySum = 0;
  let dyCount = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      dySum += Math.abs(gray[(y + 1) * width + x]! - gray[y * width + x]!);
      dyCount++;
    }
  }
  const dx = dxCount ? dxSum / dxCount : 0;
  const dy = dyCount ? dySum / dyCount : 0;
  const neighborRoughness = (dx + dy) / (2 * std + 1e-6);

  // Local flatness (3x3 box std < 3).
  const box = boxStd(gray, width, height, 3);
  let flat = 0;
  for (let i = 0; i < n; i++) if (box[i]! < 3) flat++;
  const flatFraction = flat / n;

  // Center vs overall brightness (brain MRI: single bright object centered).
  const cy0 = Math.floor(height * 0.3);
  const cy1 = Math.floor(height * 0.7);
  const cx0 = Math.floor(width * 0.3);
  const cx1 = Math.floor(width * 0.7);
  let centerSum = 0;
  let centerCount = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      centerSum += gray[y * width + x]!;
      centerCount++;
    }
  }
  const centerMean = centerCount ? centerSum / centerCount : 0;
  const centerToMean = centerMean / (mean + 1e-6);

  // Left-right symmetry.
  const half = Math.floor(width / 2);
  let symSum = 0;
  let symCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < half; x++) {
      const l = gray[y * width + x]!;
      const r = gray[y * width + (width - 1 - x)]!;
      symSum += Math.abs(l - r);
      symCount++;
    }
  }
  const symmetry = symCount ? symSum / symCount / 255 : 0;

  const metrics: ValidationMetrics = {
    width,
    height,
    aspect: round(width / height, 3),
    colorfulness: round(colorfulness, 3),
    colored_pixel_fraction: round(coloredFraction, 4),
    mean: round(mean, 1),
    std: round(std, 1),
    dark_fraction: round(dark / n, 4),
    bright_fraction: round(bright / n, 4),
    white_fraction: round(white / n, 4),
    histogram_entropy: round(entropy, 2),
    unique_levels: uniqueLevels,
    laplacian_variance: round(laplacianVariance, 1),
    edge_density: round(edgeDensity, 4),
    neighbor_roughness: round(neighborRoughness, 3),
    flat_fraction: round(flatFraction, 3),
    center_to_mean: round(centerToMean, 3),
    symmetry: round(symmetry, 3),
  };

  const reasons: string[] = [];
  const T = VALIDATION_THRESHOLDS;
  if (metrics.width < T.minSide || metrics.height < T.minSide) {
    reasons.push("Image is too small to be a diagnostic scan.");
  }
  if (metrics.aspect < T.minAspect || metrics.aspect > T.maxAspect) {
    reasons.push("Unusual aspect ratio (typical of screenshots, not scans).");
  }
  if (
    metrics.colorfulness >= T.maxColorfulness ||
    metrics.colored_pixel_fraction >= T.maxColoredFraction
  ) {
    reasons.push("Colour image: medical scans (X-ray/MRI) are grayscale.");
  }
  if (metrics.white_fraction >= T.maxWhiteFraction) {
    reasons.push("Mostly white: looks like a document, not a scan.");
  }
  if (metrics.laplacian_variance < T.minLaplacianVariance) {
    reasons.push("Almost no texture detail: looks uniform/synthetic.");
  }
  if (
    metrics.neighbor_roughness >= T.maxNeighborRoughness ||
    metrics.edge_density >= T.maxEdgeDensity
  ) {
    reasons.push("High-frequency noise or dense edges: not a natural scan.");
  }
  if (metrics.unique_levels < T.minUniqueLevels) {
    reasons.push("Limited tonal palette: looks like a UI screenshot.");
  }
  if (
    metrics.flat_fraction >= T.maxFlatFraction &&
    metrics.histogram_entropy <= T.maxFlatEntropy
  ) {
    reasons.push("Large flat UI-style regions: not a scan.");
  }
  if (metrics.std < T.minStd) {
    reasons.push("Almost blank / no contrast.");
  }
  const isMedical = reasons.length === 0;

  let detected: DetectedDomain = "unknown";
  let confidence = 0;
  if (isMedical) {
    if (
      metrics.dark_fraction >= T.brainMinDark &&
      metrics.center_to_mean >= T.brainMinCenterRatio &&
      metrics.histogram_entropy <= T.brainMaxEntropy
    ) {
      detected = "brain";
      confidence = Math.min(
        1,
        0.5 +
          0.25 * Math.min(1, metrics.dark_fraction / 0.6) +
          0.25 * Math.min(1, (metrics.center_to_mean - 1) / 1.0),
      );
    } else if (
      metrics.dark_fraction <= T.chestMaxDark &&
      metrics.histogram_entropy >= T.chestMinEntropy
    ) {
      detected = "chest";
      confidence = Math.min(
        1,
        0.5 +
          0.25 * Math.min(1, (T.chestMaxDark - metrics.dark_fraction) / T.chestMaxDark) +
          0.25 * Math.min(1, (metrics.histogram_entropy - T.chestMinEntropy) / 2),
      );
    }
  }

  return {
    is_medical_scan: isMedical,
    detected_domain: detected,
    confidence: round(confidence, 3),
    reasons,
    metrics,
  };
}

/**
 * Validate an image for a specific model. Throws `MedicalImageRejectedError`
 * when the image is not a medical scan or belongs to a different domain, so the
 * caller can skip inference entirely.
 */
export function validateImageForModel(
  rgb: Uint8Array,
  width: number,
  height: number,
  modelId: string,
  modelDomain?: ModelDomain,
): ImageValidation {
  const validation = analyzeMedicalImage(rgb, width, height);
  if (!validation.is_medical_scan) {
    throw new MedicalImageRejectedError(
      "NOT_A_MEDICAL_IMAGE",
      validation,
      modelId,
      modelDomain,
    );
  }
  if (
    validation.detected_domain !== "unknown" &&
    modelDomain !== undefined &&
    validation.detected_domain !== modelDomain
  ) {
    throw new MedicalImageRejectedError(
      "MODEL_IMAGE_MISMATCH",
      validation,
      modelId,
      modelDomain,
    );
  }
  return validation;
}
