import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  buildClinicalContext,
  CLINICAL_CONTEXT_DISCLAIMER,
  CLINICAL_DOMAIN_LABELS,
  DEFAULT_MODEL_ID,
  describeClinicalContext,
  emptyClinicalAnswers,
  getClinicalFields,
  getClinicalInterpretation,
  getSaliencyImage,
  MODEL_DISCLAIMER,
  MODELS,
  type ClinicalAnswers,
} from "@carelens/ml";
import {
  createScan,
  downloadReportPdf,
  InferenceResult,
  inferencePredict,
  RejectedInferenceError,
  saveBlob,
  submitScanResult,
  type InferenceRejection,
} from "../lib/api";

export function ScanPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [preview, setPreview] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ClinicalAnswers>(() =>
    emptyClinicalAnswers("chest"),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submittedContext, setSubmittedContext] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [rejection, setRejection] = useState<InferenceRejection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  function clearOutcome() {
    setResult(null);
    setRejection(null);
    setError(null);
    setSaveWarning(null);
    setSubmittedContext(null);
    setSavedScanId(null);
    setReportError(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    clearOutcome();
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function onSelectModel(id: string) {
    setModelId(id);
    clearOutcome();
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

  async function onPredict(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    const domain = activeModel?.domain ?? "chest";
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
    try {
      const inference = await inferencePredict(file, modelId);
      setResult(inference);

      // Persist the scan together with its clinical context. A save failure
      // must not hide a valid inference result.
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
    } catch (err) {
      if (err instanceof RejectedInferenceError) {
        setRejection(err.rejection);
      } else {
        setError(err instanceof Error ? err.message : "Prediction failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadReport() {
    if (!file || !result) return;
    setReportBusy(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadReportPdf(file, {
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
      });
      saveBlob(blob, filename);
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : "Could not generate the report",
      );
    } finally {
      setReportBusy(false);
    }
  }

  const activeModel = MODELS.find((m) => m.id === modelId);
  const domain = activeModel?.domain ?? "chest";
  const clinicalFields = getClinicalFields(domain);
  const chestModels = MODELS.filter((m) => m.domain === "chest");
  const brainModels = MODELS.filter((m) => m.domain === "brain");
  const lowConfidenceDomain = result?.low_confidence_domain === true;
  // Use dynamic saliency from API response
  const saliencyBase64 = result?.saliency_base64 ?? null;
  // Only use static fallback if it matches the model's domain
  const saliencyStatic = result && getSaliencyImage(result.model) ? getSaliencyImage(result.model) : null;
  const isStaticFallbackDomainMismatch = saliencyStatic && domain !== "chest" && result?.model !== "model" && result?.model !== "model_unquant";
  const interpretation = result ? getClinicalInterpretation(result.model, result.label) : null;

  function renderField(
    field: (typeof clinicalFields)[number],
  ) {
    const value = (answers[field.id] as string | undefined) ?? "";
    const invalid = Boolean(fieldErrors[field.id]);
    const baseClass =
      "w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
    const borderClass = invalid ? "border-red-400" : "border-gray-300";

    return (
      <div key={field.id}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {field.label}
          {field.required ? <span className="text-red-500"> *</span> : null}
        </label>
        {field.type === "number" ? (
          <input
            type="number"
            value={value}
            min={field.min}
            max={field.max}
            onChange={(e) => onAnswer(field.id, e.target.value)}
            className={`${baseClass} ${borderClass}`}
          />
        ) : (
          <select
            value={value}
            onChange={(e) => onAnswer(field.id, e.target.value)}
            className={`${baseClass} ${borderClass}`}
          >
            <option value="">Select…</option>
            {field.type === "boolean"
              ? [
                  <option key="yes" value="true">
                    Yes
                  </option>,
                  <option key="no" value="false">
                    No
                  </option>,
                ]
              : field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
          </select>
        )}
        {fieldErrors[field.id] ? (
          <p className="mt-1 text-xs text-red-600">{fieldErrors[field.id]}</p>
        ) : field.help ? (
          <p className="mt-1 text-xs text-gray-500">{field.help}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="max-w-lg space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Scan</h1>
        <p className="text-sm text-gray-500">
          Classify an image with a CareLens model.
        </p>
      </header>

      <form
        onSubmit={onPredict}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Model
          </label>
          <select
            value={modelId}
            onChange={(e) => onSelectModel(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <optgroup label="Chest X-ray">
              {chestModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.file})
                </option>
              ))}
            </optgroup>
            <optgroup label="Brain MRI">
              {brainModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.file})
                </option>
              ))}
            </optgroup>
          </select>
          {activeModel && (
            <p className="mt-1 text-xs text-gray-500">
              Domain: {CLINICAL_DOMAIN_LABELS[activeModel.domain]} · File:{" "}
              {activeModel.file} · Output classes:{" "}
              {activeModel.classLabels.join(", ")} · Measured accuracy:{" "}
              {activeModel.accuracy}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="w-full text-sm"
          />
          {preview && (
            <img
              src={preview}
              alt="Scan preview"
              className="mt-3 max-h-56 rounded-lg border border-gray-200"
            />
          )}
        </div>

        <fieldset className="space-y-3 border-t border-gray-100 pt-4">
          <legend className="text-sm font-semibold text-gray-900">
            {CLINICAL_DOMAIN_LABELS[domain]} clinical context
          </legend>
          <p className="text-xs text-gray-500">{CLINICAL_CONTEXT_DISCLAIMER}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {clinicalFields.map(renderField)}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saveWarning && <p className="text-sm text-amber-600">{saveWarning}</p>}

        <button
          type="submit"
          disabled={!file || busy}
          className="w-full rounded-md bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {busy ? "Classifying…" : "Run classification"}
        </button>
      </form>

      {rejection && (
        <div
          className={
            rejection.code === "NOT_A_MEDICAL_IMAGE"
              ? "rounded-xl border border-red-300 bg-red-50 p-6"
              : "rounded-xl border border-amber-300 bg-amber-50 p-6"
          }
          role="alert"
        >
          <p className="text-sm font-semibold text-gray-900">
            {rejection.code === "NOT_A_MEDICAL_IMAGE"
              ? "Not a medical image"
              : "Wrong model for this image"}
          </p>
          <p className="mt-1 text-sm text-gray-700">{rejection.message}</p>
          {rejection.suggested_models &&
            rejection.suggested_models.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-600">
                  Try a model for this image:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {rejection.suggested_models.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectModel(id)}
                      className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                    >
                      Use {id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          <p className="mt-3 text-xs text-gray-500">
            No prediction was made.
          </p>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
          {lowConfidenceDomain && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Body part could not be confirmed
              </p>
              <p className="mt-1 text-xs text-amber-700">
                This image looks like a medical scan but the body part is ambiguous, so the result below may be unreliable.
              </p>
            </div>
          )}

          {/* Model & Verdict Header */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Classification Result</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Model: <span className="font-mono text-teal-700">{result.model}</span>
                  {result.model_domain && (
                    <> · Domain: <span className="capitalize">{result.model_domain}</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{result.label}</p>
                  <p className="text-sm text-gray-500">
                    Confidence: <span className="font-medium">{(result.confidence * 100).toFixed(1)}%</span>
                  </p>
                </div>
                <div className="w-px h-10 bg-gray-200 sm:w-px sm:h-10 hidden sm:block" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Model Accuracy</p>
                  <p className="text-sm font-medium text-teal-700">{result.accuracy ?? "N/A"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Class Probabilities */}
          <div className="rounded-lg border border-gray-100 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Class Probabilities</h3>
            <ul className="space-y-3">
              {result.scores.map((s) => (
                <li key={s.label} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-700 font-medium min-w-[140px]">{s.label}</span>
                    <span className="text-gray-500 font-mono text-right w-16">
                      {(s.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, s.confidence * 100))}%`,
                        backgroundColor: s.confidence === result.confidence ? "#0d9488" : "#94a3b8",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Saliency Map / Heatmap - Dynamic from API (user's uploaded image) or static fallback */}
          {saliencyBase64 && (
            <div className="rounded-lg border border-gray-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Saliency Map (Occlusion Sensitivity)
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Heatmap showing which image regions most influenced the model's decision on <strong>your uploaded image</strong>.
                Brighter areas = higher importance. Generated via 16×16 occlusion patches on the fly.
              </p>
              <div className="relative aspect-square max-w-md mx-auto rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                <img
                  src={`data:image/png;base64,${saliencyBase64}`}
                  alt={`Dynamic saliency heatmap for ${result?.model} on your image (top class: ${result?.saliency_top_class})`}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-2 text-xs text-teal-600">
                ✓ Generated dynamically on your uploaded image
              </p>
              {domain === "chest" && (
                <p className="mt-1 text-xs text-amber-600">
                  Note: Chest models do NOT reliably localize lung fields. See validation findings (PRODUCT.md §8.4).
                </p>
              )}
              {domain === "brain" && (
                <p className="mt-1 text-xs text-amber-600">
                  Note: Tutorial-grade model weights may not reliably localize pathology boundaries.
                </p>
              )}
            </div>
          )}

          {/* Static fallback - only show if domain matches (chest models only) */}
          {saliencyStatic && !saliencyBase64 && domain === "chest" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Saliency Map (Pre-generated Reference)
              </h3>
              <p className="text-xs text-amber-700 mb-3">
                Dynamic heatmap generation failed: {result?.saliency_error ?? "unknown"}.
                Showing pre-generated reference heatmap for a <strong>chest X-ray</strong> (not your image).
              </p>
              <div className="relative aspect-square max-w-md mx-auto rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                <img
                  src={saliencyStatic}
                  alt={`Static saliency heatmap for ${result?.model} model (reference chest X-ray)`}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-1 text-xs text-amber-600">
                Note: Chest models do NOT reliably localize lung fields. See validation findings (PRODUCT.md §8.4).
              </p>
            </div>
          )}

          {/* Brain model fallback - show original image with warning instead of chest heatmap */}
          {!saliencyBase64 && domain === "brain" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Saliency Map Unavailable
              </h3>
              <p className="text-xs text-amber-700 mb-3">
                Dynamic heatmap generation failed: {result?.saliency_error ?? "unknown"}.
                No brain MRI reference heatmap available.
              </p>
              <div className="relative aspect-square max-w-md mx-auto rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                {preview && (
                  <img
                    src={preview}
                    alt="Your uploaded brain MRI"
                    className="w-full h-full object-cover opacity-75"
                  />
                )}
              </div>
              <p className="mt-2 text-xs text-amber-600">
                Showing your uploaded brain MRI above. Dynamic occlusion sensitivity unavailable for this model.
              </p>
            </div>
          )}

          {/* Clinical Interpretation */}
          {interpretation && (
            <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
              <h3 className="text-sm font-semibold text-teal-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Clinical Interpretation: {result.label}
              </h3>
              <p className="text-sm text-teal-700 mb-3">{interpretation.meaning}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-white p-3 border border-teal-100">
                  <h4 className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-2">Suggested Next Steps</h4>
                  <ul className="space-y-1 text-xs text-teal-700">
                    {interpretation.nextSteps.map((step, i) => (
                      <li key={i} className="flex gap-1">
                        <span className="text-teal-500">→</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-md bg-white p-3 border border-red-100">
                  <h4 className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">Red Flags / Considerations</h4>
                  <ul className="space-y-1 text-xs text-red-700">
                    {interpretation.redFlags.map((flag, i) => (
                      <li key={i} className="flex gap-1">
                        <span className="text-red-500">⚠</span>
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Clinical Context */}
          {submittedContext && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {CLINICAL_DOMAIN_LABELS[domain]} Clinical Context
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {describeClinicalContext(domain, submittedContext).map((row) => (
                  <div key={row.id} className="flex justify-between gap-2">
                    <dt className="text-gray-500">{row.label}</dt>
                    <dd className="text-gray-800 font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-gray-400">{CLINICAL_CONTEXT_DISCLAIMER}</p>
            </div>
          )}

          {/* Technical Details */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-400 font-mono">
              Input: {result.input_shape.join("×")} {result.input_dtype}
              {result.preprocessing ? ` · Preprocessing: ${result.preprocessing}` : ""}
              {result.accuracy ? ` · Measured accuracy: ${result.accuracy}` : ""}
            </p>
            <p className="mt-1 text-xs font-medium text-amber-600">
              {result.disclaimer ?? MODEL_DISCLAIMER}
            </p>
          </div>

          {/* Report Download */}
          <button
            type="button"
            onClick={onDownloadReport}
            disabled={reportBusy}
            className="w-full rounded-md bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            {reportBusy ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Preparing report…
              </span>
            ) : (
              "Download Report (PDF)"
            )}
          </button>
          <p className="mt-1 text-center text-xs text-gray-400">
            Includes the image, verdict, clinical context, saliency map, and AI-drafted guidance.
          </p>
          {reportError && (
            <p className="mt-2 text-xs text-red-600 text-center">{reportError}</p>
          )}
        </div>
      )}
    </section>
  );
}
