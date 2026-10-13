import { useEffect, useState } from "react";

/**
 * Advances a stage index while `active`, clamping at the final stage.
 *
 * The inference backend is a single `POST /predict`, so real per-stage progress
 * is unavailable; this models the request lifecycle — stages advance on a timer
 * and the last stage is held until the request resolves (`active` turns false).
 */
export function useTelemetry(
  active: boolean,
  stageCount: number,
  intervalMs = 1100,
): number {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active || stageCount <= 1) return;
    setStageIndex(0);
    const id = window.setInterval(() => {
      setStageIndex((current) =>
        current < stageCount - 1 ? current + 1 : current,
      );
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, stageCount, intervalMs]);

  return stageIndex;
}
