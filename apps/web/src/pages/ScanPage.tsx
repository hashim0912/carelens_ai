import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Activity, BrainCircuit, FileText, Send, Scan } from "lucide-react";
import {
  buildClinicalContext,
  DEFAULT_MODEL_ID,
  describeClinicalContext,
  emptyClinicalAnswers,
  getClinicalFields,
  getClinicalInterpretation,
  getModel,
  MODELS,
  type ClinicalAnswers,
  type ModelDomain,
} from "@carelens/ml";
import {
  createScan,
  downloadReportPdf,
  inferencePredict,
  RejectedInferenceError,
  saveBlob,
  submitScanResult,
  type InferenceRejection,
  type InferenceResult,
  type ReportPayload,
} from "../lib/api";
import { DiagnosticViewport, type ViewMode, type WindowLevel } from "../components/diagnostic/DiagnosticViewport";
import { TelemetryProgress, type TelemetryStage } from "../components/diagnostic/TelemetryProgress";
import { ClinicalSummaryCard } from "../components/diagnostic/ClinicalSummaryCard";
import { StudySetupPanel } from "../components/diagnostic/StudySetupPanel";
import { RejectionPanel } from "../components/diagnostic/RejectionPanel";
import { EscalateModal } from "../components/diagnostic/EscalateModal";
import {
  AIAnalysisPanel,
  OverviewResultCard,
  PatientRail,
  ReportPanel,
  ScanPageHeader,
  ScanTabs,
  type ScanTabId,
} from "../components/scan";
import { useTelemetry } from "../hooks/useTelemetry";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useScans } from "../hooks/useScansSearch";
import { EmptyState, Toast } from "../components/ui";

const TELEMETRY_STAGES: TelemetryStage[] = [
  {
    id: 0,
    label: "Validating Scan Quality & Domain Gate",
    detail: "Analyzing tissue contrast, entropy, aspect ratio",
  },
  {
    id: 1,
    label: "Initializing Neural Inference Engine",
    detail: "Allocating tensor graphs, warming compute kernels",
  },
  {
    id: 2,
    label: "Running Deep Feature Extraction",
    detail: "Forward pass through DenseNet121 backbone",
  },
  {
    id: 3,
    label: "Computing Dynamic Occlusion Saliency",
    detail: "Generating continuous spatial attention matrix",
  },
  {
    id: 4,
    label: "Synthesizing Radiological Report",
    detail: "Compiling clinical decision support briefing",
  },
];

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface EscalationAck {
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function ScanPage() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { data: scansData, isLoading: scansLoading } = useScans();

  // Study inputs
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [answers, setAnswers] = useState<ClinicalAnswers>(() =>
    emptyClinicalAnswers("chest"),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Workspace tab
  const [tab, setTab] = useState<ScanTabId>("overview");

  // Outcome
  const [submittedContext, setSubmittedContext] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [rejection, setRejection] = useState<InferenceRejection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Viewport controls
  const [saliencyOpacity, setSaliencyOpacity] = useState(65);
  const [viewMode, setViewMode] = useState<ViewMode>("overlay");
  const [thresholdSpotlight, setThresholdSpotlight] = useState(false);
  const [invertContrast, setInvertContrast] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [windowLevel, setWindowLevel] = useState<WindowLevel>("default");

  // Actions
  const [copySuccess, setCopySuccess] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalationAck, setEscalationAck] = useState<EscalationAck | null>(null);

  const telemetryStage = useTelemetry(busy, TELEMETRY_STAGES.length, 950);

  const activeModel = getModel(modelId);
  const domain: ModelDomain = activeModel?.domain ?? "chest";
  const clinicalFields = getClinicalFields(domain);
  const lowConfidenceDomain = result?.low_confidence_domain === true;
  const saliencyBase64 = result?.saliency_base64 ?? null;
  const interpretation = result
    ? getClinicalInterpretation(result.model, result.label)
    : null;
  const stageLabels = TELEMETRY_STAGES.map((s) => s.label);
  const stageProgress = Math.round(
    ((telemetryStage + 1) / TELEMETRY_STAGES.length) * 100,
  );

  const gatingStatus = (() => {
    if (rejection) {
      return rejection.detected_domain && rejection.detected_domain !== "unknown"
        ? `Domain gate: detected ${rejection.detected_domain}`
        : "Domain gate: body part could not be confirmed";
    }
    if (result?.input_analysis) {
      return lowConfidenceDomain
        ? "Body part could not be confirmed — interpret with caution"
        : `Domain verified: ${result.input_analysis.detected_domain}`;
    }
    return null;
  })();

  function clearOutcome() {
    setResult(null);
    setRejection(null);
    setError(null);
    setSaveWarning(null);
    setSubmittedContext(null);
    setSavedScanId(null);
    setReportError(null);
  }

  function resetViewport() {
    setSaliencyOpacity(65);
    setViewMode("overlay");
    setThresholdSpotlight(false);
    setInvertContrast(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setWindowLevel("default");
  }

  function acceptFile(f: File | null) {
    if (!f) return;
    const okType =
      /^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/.test(f.type) || f.type === "";
    if (!okType) {
      setError("Unsupported image format. Upload a grayscale PNG or JPEG scan.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("Image exceeds the 20 MB size limit.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    clearOutcome();
    const url = URL.createObjectURL(f);
    setPreview(url);
    resetViewport();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    acceptFile(f);
  }

  function onFileDrop(f: File | null) {
    acceptFile(f);
  }

  function onClearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    clearOutcome();
  }

  function onSelectModel(id: string) {
    const next = getModel(id);
    const nextDomain: ModelDomain = next?.domain ?? "chest";
    setModelId(id);
    clearOutcome();
    if (nextDomain !== domain) setAnswers(emptyClinicalAnswers(nextDomain));
    setFieldErrors({});
  }

  function onAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function onRunAnalysis() {
    if (!file || busy) return;

    const { context, errors } = buildClinicalContext(domain, answers);
    if (errors.length > 0 || !context) {
      const mapped: Record<string, string> = {};
      for (const err of errors) mapped[err.id] = err.message;
      setFieldErrors(mapped);
      setError("Please complete the highlighted clinical fields.");
      return;
    }

    setBusy(true);
    clearOutcome();
    setSubmittedContext(context);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const inference = await inferencePredict(file, modelId, true, controller.signal);
      setResult(inference);
      setBusy(false);
      setCopySuccess(false);

      void (async () => {
        try {
          const scan = await createScan(modelId, context);
          await submitScanResult(scan.id, {
            modelId: inference.model,
            label: inference.label,
            confidence: inference.confidence,
            scores: inference.scores,
          });
          setSavedScanId(scan.id);
          await queryClient.invalidateQueries({ queryKey: ["scans"] });
        } catch (saveErr) {
          setSaveWarning(
            `Result generated, but saving to the server failed: ${
              saveErr instanceof Error ? saveErr.message : "unknown error"
            }`,
          );
        }
      })();
    } catch (err) {
      setBusy(false);
      if (controller.signal.aborted) {
        setError(
          "The request timed out after 60 seconds — the inference service may be busy. Please retry.",
        );
      } else if (err instanceof RejectedInferenceError) {
        setRejection(err.rejection);
      } else {
        setError(err instanceof Error ? err.message : "Prediction failed");
      }
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function onDownloadReport() {
    if (!file || !result) return;
    setReportBusy(true);
    setReportError(null);
    try {
      const payload: ReportPayload = {
        modelId: result.model,
        label: result.label,
        confidence: result.confidence,
        scores: result.scores,
        accuracy: result.accuracy,
        inputShape: result.input_shape,
        inputDtype: result.input_dtype,
        preprocessing: result.preprocessing,
        clinicalContext: submittedContext,
        scanId: savedScanId ?? undefined,
        lowConfidenceDomain: result.low_confidence_domain,
      };
      const { blob, filename } = await downloadReportPdf(file, payload);
      saveBlob(blob, filename);
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : "Could not generate the report",
      );
    } finally {
      setReportBusy(false);
    }
  }

  async function onCopyFindings() {
    if (!result) return;
    const contextRows = submittedContext
      ? describeClinicalContext(domain, submittedContext)
          .map((r) => `${r.label}: ${r.value}`)
          .join(", ")
      : null;
    const lines = [
      "CARELENS AI — STRUCTURED DICOM FINDINGS",
      `Model: ${result.model}${result.model_domain ? ` (${result.model_domain})` : ""}`,
      `Primary impression: ${result.label}`,
      `Top confidence: ${(result.confidence * 100).toFixed(1)}%`,
      "Class probability distribution:",
      ...result.scores.map(
        (s) => `  - ${s.label}: ${(s.confidence * 100).toFixed(1)}%`,
      ),
    ];
    if (interpretation) {
      lines.push("Interpretation:", interpretation.meaning);
      lines.push("Recommended next steps:", ...interpretation.nextSteps.map((s) => `  - ${s}`));
      lines.push("Red flags / triage indicators:", ...interpretation.redFlags.map((s) => `  - ${s}`));
    }
    if (contextRows) lines.push(`Clinical context: ${contextRows}`);
    lines.push(
      "Disclaimer: assistive tool output only — confirm findings with formal radiological review.",
    );

    const ok = await copyText(lines.join("\n"));
    if (ok) {
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2400);
    } else {
      setReportError("Clipboard access was denied. Copy the assembled text manually.");
    }
  }

  function onEscalate(payload: EscalationAck) {
    setEscalateOpen(false);
    setEscalationAck(payload);
    window.setTimeout(() => setEscalationAck(null), 5200);
  }

  function onResetStudy() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setModelId(DEFAULT_MODEL_ID);
    setAnswers(emptyClinicalAnswers("chest"));
    setFieldErrors({});
    clearOutcome();
    resetViewport();
  }

  const viewport = (
    <DiagnosticViewport
      preview={preview}
      saliencyBase64={saliencyBase64}
      isLoading={busy}
      loadingStage={telemetryStage}
      stageLabels={stageLabels}
      gatingStatus={gatingStatus}
      saliencyOpacity={saliencyOpacity}
      onSaliencyOpacityChange={setSaliencyOpacity}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      thresholdSpotlight={thresholdSpotlight}
      onThresholdSpotlightChange={setThresholdSpotlight}
      invertContrast={invertContrast}
      onInvertContrastChange={setInvertContrast}
      zoom={zoom}
      onZoomChange={setZoom}
      pan={pan}
      onPanChange={setPan}
      windowLevel={windowLevel}
      onWindowLevelChange={setWindowLevel}
    />
  );

  const scanNotes = (
    <>
      {result && !saliencyBase64 && (
        <p className="rounded-lg border border-warn/40 bg-[#fdf3e0] px-3 py-2 text-xs text-[#8a5a10]">
          Dynamic occlusion saliency
          {result.saliency_error ? ` (${result.saliency_error})` : ""} is
          unavailable for this study. Showing the raw scan only.
        </p>
      )}
      {result && saliencyBase64 && domain === "chest" && result.model !== "pneumonia" && (
        <p className="rounded-lg border border-warn/40 bg-[#fdf3e0] px-3 py-2 text-xs text-[#8a5a10]">
          Note: legacy chest models do NOT reliably localize lung fields
          (validation findings, PRODUCT.md §8.4).
        </p>
      )}
      {saveWarning && (
        <p
          role="alert"
          className="rounded-lg border border-critical/30 bg-[#fdeef1] px-3 py-2 text-xs text-critical"
        >
          {saveWarning}
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      <ScanPageHeader busy={busy} result={result} rejection={rejection} onResetStudy={onResetStudy} />

      <ScanTabs active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-4">
          {tab === "overview" ? (
            <>
              {viewport}
              {scanNotes}
              {busy ? (
                <div className="card p-5">
                  <TelemetryProgress
                    stages={TELEMETRY_STAGES}
                    currentStage={telemetryStage}
                    isActive
                    stageProgress={stageProgress}
                  />
                </div>
              ) : rejection ? (
                <RejectionPanel rejection={rejection} onSelectModel={onSelectModel} onReset={onResetStudy} />
              ) : result ? (
                <OverviewResultCard
                  result={result}
                  interpretation={interpretation}
                  onOpenFindings={() => setTab("findings")}
                  onExportPdf={onDownloadReport}
                  reportBusy={reportBusy}
                  onEscalate={() => setEscalateOpen(true)}
                />
              ) : (
                <StudySetupPanel
                  models={MODELS}
                  modelId={modelId}
                  onSelectModel={onSelectModel}
                  domain={domain}
                  fields={clinicalFields}
                  answers={answers}
                  fieldErrors={fieldErrors}
                  onAnswer={onAnswer}
                  preview={preview}
                  onFileChange={onFileChange}
                  onFileDrop={onFileDrop}
                  onClearFile={onClearFile}
                  error={error}
                  busy={busy}
                  onSubmit={onRunAnalysis}
                />
              )}
            </>
          ) : null}

          {tab === "images" ? (
            <>
              {viewport}
              {scanNotes}
              {!preview && !result ? (
                <EmptyState
                  icon={<Scan className="h-5 w-5" />}
                  title="No study images yet"
                  body="Scans are not archived on the server. Go to the Overview tab and start a study to inspect an image here."
                />
              ) : null}
            </>
          ) : null}

          {tab === "findings" ? (
            result ? (
              <ClinicalSummaryCard
                result={result}
                interpretation={interpretation}
                submittedContext={submittedContext}
                domain={domain}
              />
            ) : (
              <EmptyState
                icon={<Activity className="h-5 w-5" />}
                title="No findings yet"
                body="Run a study from the Overview tab. The model's class distribution, interpretation, and care pathway will appear here."
              />
            )
          ) : null}

          {tab === "ai-analysis" ? (
            result ? (
              <AIAnalysisPanel result={result} model={activeModel} domain={domain} />
            ) : (
              <EmptyState
                icon={<BrainCircuit className="h-5 w-5" />}
                title="No AI analysis yet"
                body="The model card, domain-gate verdict, and saliency status unlock here once a study completes."
              />
            )
          ) : null}

          {tab === "report" ? (
            result ? (
              <ReportPanel
                result={result}
                interpretation={interpretation}
                submittedContext={submittedContext}
                domain={domain}
                savedScanId={savedScanId}
                reportBusy={reportBusy}
                reportError={reportError}
                onExportPdf={onDownloadReport}
                onCopyFindings={onCopyFindings}
                onEscalate={() => setEscalateOpen(true)}
              />
            ) : (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="No report to assemble"
                body="Export a structured PDF or copy findings once a study has completed."
              />
            )
          ) : null}
        </section>

        <PatientRail
          user={user}
          submittedContext={submittedContext}
          domain={domain}
          result={result}
          interpretation={interpretation}
          scans={scansData?.scans}
          scansLoading={scansLoading}
          savedScanId={savedScanId}
          reportBusy={reportBusy}
          onExportPdf={onDownloadReport}
          onCopyFindings={onCopyFindings}
          onEscalate={() => setEscalateOpen(true)}
          onNewStudy={onResetStudy}
        />
      </div>

      <EscalateModal open={escalateOpen} onClose={() => setEscalateOpen(false)} onSubmit={onEscalate} />

      <AnimatePresence>
        {copySuccess && (
          <div className="fixed bottom-6 right-6 z-50">
            <Toast tone="success" title="Findings copied" body="Structured findings are on your clipboard." />
          </div>
        )}
        {escalationAck && (
          <div className="fixed bottom-6 right-6 z-50">
            <Toast
              tone="info"
              icon={<Send className="h-4 w-4" />}
              title="Escalation queued for senior over-read"
              body={`Urgency: ${escalationAck.urgency} · ${escalationAck.reason}`}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}