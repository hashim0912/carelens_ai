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
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {lowConfidenceDomain && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800">
                Body part could not be confirmed
              </p>
              <p className="text-xs text-amber-700">
                This image looks like a medical scan but the body part is
                ambiguous, so the result below may be unreliable.
              </p>
            </div>
          )}
          <h2 className="text-sm font-medium text-gray-900 mb-2">Result</h2>
          <p className="text-xs text-gray-500 mb-2">
            Model: {result.model}
            {MODELS.find((m) => m.id === result.model)?.file
              ? ` (${MODELS.find((m) => m.id === result.model)!.file})`
              : ""}
          </p>
          <p className="text-lg font-semibold text-gray-900">{result.label}</p>
          <p className="text-sm text-gray-500">
            Confidence: {(result.confidence * 100).toFixed(1)}%
          </p>

          <ul className="mt-3 space-y-2">
            {result.scores.map((s) => (
              <li key={s.label} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">{s.label}</span>
                  <span className="text-gray-500">
                    {(s.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{
                      width: `${Math.max(0, Math.min(100, s.confidence * 100))}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {submittedContext && (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-700">
                {CLINICAL_DOMAIN_LABELS[domain]} clinical context
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {describeClinicalContext(domain, submittedContext).map((row) => (
                  <div key={row.id} className="flex justify-between gap-2">
                    <dt className="text-gray-500">{row.label}</dt>
                    <dd className="text-gray-800">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-gray-400">
                {CLINICAL_CONTEXT_DISCLAIMER}
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-gray-400">
            Input {result.input_shape.join("×")} {result.input_dtype}
            {result.preprocessing ? ` · ${result.preprocessing}` : ""}
            {result.accuracy ? ` · measured accuracy ${result.accuracy}` : ""}
          </p>
          <p className="mt-2 text-xs font-medium text-amber-600">
            {result.disclaimer ?? MODEL_DISCLAIMER}
          </p>

          <button
            type="button"
            onClick={onDownloadReport}
            disabled={reportBusy}
            className="mt-4 w-full rounded-md bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {reportBusy ? "Preparing report…" : "Download report (PDF)"}
          </button>
          <p className="mt-1 text-center text-xs text-gray-400">
            Includes the image, verdict, clinical context and AI-drafted
            guidance.
          </p>
          {reportError && (
            <p className="mt-2 text-xs text-red-600">{reportError}</p>
          )}
        </div>
      )}
    </section>
  );
}
