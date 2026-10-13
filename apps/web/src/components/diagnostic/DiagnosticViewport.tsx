import { useCallback, useMemo, useRef, useState, type FC, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Aperture,
  Contrast,
  Crosshair,
  Layers,
  Maximize2,
  Microscope,
  Minus,
  Move,
  Plus,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { useSaliencyInspector } from "../../hooks/useSaliencyInspector";

export type ViewMode = "overlay" | "sideBySide" | "spotlight";
export type WindowLevel = "default" | "lung" | "bone";

export interface DiagnosticViewportProps {
  preview: string | null;
  saliencyBase64: string | null;
  isLoading: boolean;
  loadingStage: number;
  stageLabels: string[];
  gatingStatus?: string | null;
  className?: string;
  saliencyOpacity: number;
  onSaliencyOpacityChange: (value: number) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  thresholdSpotlight: boolean;
  onThresholdSpotlightChange: (enabled: boolean) => void;
  invertContrast: boolean;
  onInvertContrastChange: (enabled: boolean) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  windowLevel: WindowLevel;
  onWindowLevelChange: (preset: WindowLevel) => void;
}

interface HoverReading {
  x: number;
  y: number;
  intensity: number;
  peak: number;
  nx: number;
  ny: number;
}

const THRESHOLD = 0.75;

export const DiagnosticViewport: FC<DiagnosticViewportProps> = ({
  preview,
  saliencyBase64,
  isLoading,
  loadingStage,
  stageLabels,
  gatingStatus,
  className = "",
  saliencyOpacity,
  onSaliencyOpacityChange,
  viewMode,
  onViewModeChange,
  thresholdSpotlight,
  onThresholdSpotlightChange,
  invertContrast,
  onInvertContrastChange,
  zoom,
  onZoomChange,
  pan,
  onPanChange,
  windowLevel,
  onWindowLevelChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hover, setHover] = useState<HoverReading | null>(null);
  const [pinned, setPinned] = useState<HoverReading | null>(null);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const { ready: inspectorReady, sample: sampleSaliency, applyThreshold } = useSaliencyInspector(saliencyBase64);

  const heatmapSrc = useMemo(() => {
    if (!saliencyBase64) return null;
    if (thresholdSpotlight && inspectorReady) {
      const masked = applyThreshold(THRESHOLD);
      if (masked) return masked;
    }
    return `data:image/png;base64,${saliencyBase64}`;
  }, [saliencyBase64, thresholdSpotlight, inspectorReady, applyThreshold]);

  const reading = pinned ?? hover;
  const activeStageLabel = stageLabels[loadingStage] ?? "";

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart.current) return;
    onPanChange({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  };
  const endDrag = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  const inspectAt = useCallback(
    (el: HTMLImageElement | null, clientX: number, clientY: number) => {
      if (!el || !inspectorReady) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        setHover(null);
        return;
      }
      const sample = sampleSaliency(nx, ny, 6);
      setHover(sample ? { ...sample, nx, ny } : null);
    },
    [inspectorReady, sampleSaliency],
  );

  const scheduleInspect = (e: MouseEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => inspectAt(el, clientX, clientY));
  };

  const handlePin = (e: MouseEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    const sample = sampleSaliency(nx, ny, 6);
    setPinned(sample ? { ...sample, nx, ny } : null);
  };

  const resetView = () => {
    onZoomChange(1);
    onPanChange({ x: 0, y: 0 });
    setPinned(null);
    setHover(null);
  };

  const zoomIn = () => onZoomChange(Math.min(zoom + 0.25, 4));
  const zoomOut = () => onZoomChange(Math.max(zoom - 0.25, 0.5));

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  const windowLevelClass =
    windowLevel === "lung"
      ? "contrast-[1.15] saturate-[1.05]"
      : windowLevel === "bone"
        ? "contrast-[1.3] brightness-[0.95]"
        : "";

  const imageClasses = `max-h-full max-w-full object-contain ${invertContrast ? "invert" : ""} ${windowLevelClass}`;
  const transformStyle = { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" };
  const dragTransition = isDragging ? { duration: 0 } : { duration: 0.25, type: "spring" as const, stiffness: 120, damping: 18 };

  return (
    <div ref={rootRef} className={`flex h-full min-h-[26rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-navy">
          <ScanLine className="h-4 w-4 text-primary" />
          Diagnostic viewport
          <span className="ml-1 hidden items-center gap-1.5 text-xs font-normal text-muted sm:flex">
            <span className={`h-2 w-2 rounded-full ${isLoading ? "animate-pulse bg-primary" : resultState(preview, saliencyBase64)}`} />
            {isLoading ? "Acquiring" : saliencyBase64 ? "Analysed" : preview ? "Loaded" : "Idle"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-1">
            <ModeButton active={viewMode === "overlay"} onClick={() => onViewModeChange("overlay")} title="Blended overlay">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Overlay
            </ModeButton>
            <ModeButton active={viewMode === "sideBySide"} onClick={() => onViewModeChange("sideBySide")} title="Original vs heatmap">
              <Layers className="h-3.5 w-3.5" />
              Compare
            </ModeButton>
            <ModeButton active={viewMode === "spotlight"} onClick={() => onViewModeChange("spotlight")} title="Isolate focal attention">
              <Target className="h-3.5 w-3.5" />
              Spotlight
            </ModeButton>
          </div>

          <button
            type="button"
            onClick={() => onThresholdSpotlightChange(!thresholdSpotlight)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus-ring ${
              thresholdSpotlight ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface-2 text-muted hover:text-navy"
            }`}
            title="Show only attention above 75% intensity"
          >
            <Aperture className="h-3.5 w-3.5" />
            &gt;75%
          </button>

          <button
            type="button"
            onClick={() => onInvertContrastChange(!invertContrast)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus-ring ${
              invertContrast ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface-2 text-muted hover:text-navy"
            }`}
            title="Invert greyscale contrast"
          >
            <Contrast className="h-3.5 w-3.5" />
            Invert
          </button>

          <div className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-1">
            <button type="button" onClick={zoomOut} aria-label="Zoom out" className="rounded p-1 text-muted transition-colors hover:text-navy focus-ring">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-12 text-center text-xs text-navy">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={zoomIn} aria-label="Zoom in" className="rounded p-1 text-muted transition-colors hover:text-navy focus-ring">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <button type="button" onClick={resetView} aria-label="Reset view" className="rounded p-1 text-muted transition-colors hover:text-navy focus-ring">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen" className="rounded p-1 text-muted transition-colors hover:text-navy focus-ring">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <select
            value={windowLevel}
            onChange={(e) => onWindowLevelChange(e.target.value as WindowLevel)}
            aria-label="Window / level preset"
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-navy focus-ring"
          >
            <option value="default">W/L: Default</option>
            <option value="lung">W/L: Lung</option>
            <option value="bone">W/L: Bone</option>
          </select>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-viewer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(40,100,240,0.14),transparent_72%)]" />

        {!preview && !isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Microscope className="h-9 w-9 text-white/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">No scan loaded</p>
              <p className="mt-1 text-xs text-white/45">
                Upload a chest X-ray or brain MRI to begin inspection.
              </p>
            </div>
          </div>
        ) : null}

        {preview && viewMode !== "sideBySide" ? (
          <motion.div className="absolute inset-0 flex items-center justify-center" style={transformStyle} transition={dragTransition}>
            <img
              src={preview}
              alt="Scan"
              className={`cursor-crosshair ${imageClasses}`}
              draggable={false}
              onMouseMove={scheduleInspect}
              onMouseLeave={() => setHover(null)}
              onClick={handlePin}
            />
            {heatmapSrc ? (
              <img
                src={heatmapSrc}
                alt="Saliency overlay"
                className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${
                  viewMode === "spotlight" ? "mix-blend-screen" : "mix-blend-overlay"
                } ${invertContrast ? "invert" : ""}`}
                style={{ opacity: saliencyOpacity / 100 }}
                draggable={false}
              />
            ) : null}
          </motion.div>
        ) : null}

        {preview && viewMode === "sideBySide" ? (
          <div className="grid h-full w-full grid-cols-2 gap-1 p-2">
            <Pane label="Original">
              <motion.div className="flex items-center justify-center" style={transformStyle} transition={dragTransition}>
                <img src={preview} alt="Original scan" className={imageClasses} draggable={false} />
              </motion.div>
            </Pane>
            <Pane label={thresholdSpotlight ? "Heatmap >75%" : "Saliency heatmap"}>
              <motion.div className="flex items-center justify-center" style={transformStyle} transition={dragTransition}>
                <img
                  src={heatmapSrc ?? preview}
                  alt={heatmapSrc ? "Saliency map" : "Original scan (saliency unavailable)"}
                  className={`max-h-full max-w-full object-contain ${invertContrast ? "invert" : ""} ${!heatmapSrc ? `opacity-40 ${windowLevelClass}` : ""}`}
                  draggable={false}
                />
              </motion.div>
            </Pane>
          </div>
        ) : null}

        {saliencyBase64 && !isLoading ? (
          <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-viewer/80 px-3 py-2 backdrop-blur">
            <label className="flex items-center gap-2 text-xs text-white/70">
              <span className="whitespace-nowrap">Heatmap</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={saliencyOpacity}
                onChange={(e) => onSaliencyOpacityChange(Number(e.target.value))}
                className="w-28 accent-[#2864f0] sm:w-40"
                aria-label="Saliency opacity"
              />
              <span className="w-9 text-right font-mono text-[#9cc0ff]">{saliencyOpacity}%</span>
            </label>
            {reading ? (
              <div className="flex items-center gap-2 text-xs text-white/70">
                <Crosshair className="h-3.5 w-3.5 text-[#9cc0ff]" />
                <span className="text-white/50">Patch</span>
                <span className="font-mono text-[#9cc0ff]">[{reading.x}, {reading.y}]</span>
                <span className="h-3 w-px bg-white/15" />
                <span className="text-white/50">Attention</span>
                <span className="font-mono text-[#9cc0ff]">{(reading.intensity * 100).toFixed(0)}%</span>
                {pinned ? <span className="text-amber-300">pinned</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <AnimatePresence>
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-viewer/85 backdrop-blur-sm"
            >
              {preview ? (
                <div className="relative w-40 overflow-hidden rounded-lg border border-primary/30 sm:w-52">
                  <img src={preview} alt="" className="h-full w-full object-contain opacity-30" />
                  <motion.div
                    animate={{ x: ["-120%", "120%"] }}
                    transition={{ duration: 1.7, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#2864f0]/60 to-transparent"
                  />
                  <motion.div
                    animate={{ y: ["0%", "100%", "0%"] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-x-0 h-px bg-[#7357f5]/80 shadow-[0_0_12px_rgba(115,87,245,0.8)]"
                  />
                </div>
              ) : null}
              <div className="text-center">
                <p className="text-sm font-medium text-white">{activeStageLabel}</p>
                <p className="mt-1 text-xs text-white/50">
                  Stage {Math.min(loadingStage + 1, stageLabels.length)} of {stageLabels.length} · clinical inference in progress
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {stageLabels.map((label, index) => (
                  <span
                    key={label}
                    className={`h-1.5 rounded-full transition-all ${index <= loadingStage ? "w-6 bg-[#2864f0]" : "w-3 bg-white/20"}`}
                  />
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-2 text-xs">
        <span className="flex items-center gap-2 text-muted">
          <Maximize2 className="h-3.5 w-3.5" />
          {gatingStatus ?? "Domain gate idle · awaiting study"}
        </span>
        <span className="flex items-center gap-3 text-muted">
          <Move className="h-3.5 w-3.5" />
          <span>Drag to pan when zoomed</span>
          <span className="hidden sm:inline">Click to pin patch</span>
        </span>
      </div>
    </div>
  );
};

function ModeButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors focus-ring ${
        active ? "bg-primary-soft text-primary" : "text-muted hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
      {children}
      <div className="absolute left-2 top-2 rounded bg-viewer/70 px-2 py-1 text-xs text-white/80">{label}</div>
    </div>
  );
}

function resultState(preview: string | null, saliencyBase64: string | null): string {
  if (saliencyBase64) return "bg-success";
  if (preview) return "bg-primary";
  return "bg-line";
}