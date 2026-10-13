import { useCallback, useEffect, useRef, useState } from "react";

export interface PatchReading {
  /** Patch centre in pixels of the saliency image. */
  x: number;
  y: number;
  /** Mean relative attention in the sampled patch, 0..1. */
  intensity: number;
  /** Peak relative attention in the sampled patch, 0..1. */
  peak: number;
}

export interface SaliencyInspector {
  /** True once the saliency map has been decoded onto an offscreen canvas. */
  ready: boolean;
  /** Decode failure message, if any. */
  error: string | null;
  /** Mean/peak luminance of a patch around normalised (nx, ny) in [0,1]. */
  sample: (nx: number, ny: number, radius?: number) => PatchReading | null;
  /** A PNG data URL keeping only pixels at/above `threshold` (0..1). */
  applyThreshold: (threshold: number) => string | null;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Decodes the base64 occlusion-saliency map once into an offscreen canvas so
 * the viewport can read real pixel intensity for the region inspector and build
 * a true intensity-thresholded overlay (rather than a cosmetic CSS mask).
 */
export function useSaliencyInspector(
  saliencyBase64: string | null,
): SaliencyInspector {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saliencyBase64) {
      canvasRef.current = null;
      setReady(false);
      setError(null);
      return;
    }

    let cancelled = false;
    canvasRef.current = null;
    setReady(false);
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        setError("Canvas rendering unavailable in this browser.");
        return;
      }
      ctx.drawImage(image, 0, 0);
      canvasRef.current = canvas;
      setError(null);
      setReady(true);
    };
    image.onerror = () => {
      if (cancelled) return;
      canvasRef.current = null;
      setReady(false);
      setError("Could not decode the saliency map.");
    };
    image.src = `data:image/png;base64,${saliencyBase64}`;

    return () => {
      cancelled = true;
    };
  }, [saliencyBase64]);

  const sample = useCallback(
    (nx: number, ny: number, radius = 6): PatchReading | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;

      const px = Math.min(
        canvas.width - 1,
        Math.max(0, Math.round(nx * canvas.width)),
      );
      const py = Math.min(
        canvas.height - 1,
        Math.max(0, Math.round(ny * canvas.height)),
      );
      const x0 = Math.max(0, px - radius);
      const y0 = Math.max(0, py - radius);
      const w = Math.min(canvas.width, px + radius + 1) - x0;
      const h = Math.min(canvas.height, py + radius + 1) - y0;
      if (w <= 0 || h <= 0) return null;

      let sum = 0;
      let count = 0;
      let peak = 0;
      try {
        const data = ctx.getImageData(x0, y0, w, h).data;
        for (let i = 0; i < data.length; i += 4) {
          const lum = luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
          sum += lum;
          count += 1;
          if (lum > peak) peak = lum;
        }
      } catch {
        return null;
      }
      if (count === 0) return null;

      return {
        x: px,
        y: py,
        intensity: sum / count / 255,
        peak: peak / 255,
      };
    },
    [],
  );

  const applyThreshold = useCallback((threshold: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d");
    if (!octx) return null;

    const target = octx.createImageData(canvas.width, canvas.height);
    const src = source.data;
    const dst = target.data;
    const cutoff = threshold * 255;
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i] ?? 0;
      const g = src[i + 1] ?? 0;
      const b = src[i + 2] ?? 0;
      const a = src[i + 3] ?? 0;
      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = a > 0 && luminance(r, g, b) >= cutoff ? a : 0;
    }
    octx.putImageData(target, 0, 0);
    return out.toDataURL("image/png");
  }, []);

  return { ready, error, sample, applyThreshold };
}
