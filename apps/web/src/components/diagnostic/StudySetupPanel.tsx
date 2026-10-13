import {
  AlertTriangle,
  Brain,
  HeartPulse,
  Stethoscope,
  UploadCloud,
  X,
} from "lucide-react";
import type { FC, DragEvent, ChangeEvent } from "react";
import type {
  ClinicalAnswers,
  ClinicalFieldSpec,
  ModelDomain,
  ModelSpec,
} from "@carelens/ml";
import { CLINICAL_DOMAIN_LABELS } from "@carelens/ml";
import { Badge, Button, Field, inputClass } from "../ui";

export interface StudySetupPanelProps {
  models: readonly ModelSpec[];
  modelId: string;
  onSelectModel: (id: string) => void;
  domain: ModelDomain;
  fields: ClinicalFieldSpec[];
  answers: ClinicalAnswers;
  fieldErrors: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  preview: string | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (file: File | null) => void;
  onClearFile: () => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  className?: string;
}

const FULL_WIDTH_FIELDS = new Set([
  "immunocompromised",
  "immunosuppression",
  "prior_cancer",
  "recent_hospitalization",
  "recent_antibiotics",
  "vision_changes",
  "focal_weakness",
  "nausea_vomiting",
]);

export const StudySetupPanel: FC<StudySetupPanelProps> = ({
  models,
  modelId,
  onSelectModel,
  domain,
  fields,
  answers,
  fieldErrors,
  onAnswer,
  preview,
  onFileChange,
  onFileDrop,
  onClearFile,
  error,
  busy,
  onSubmit,
  className = "",
}) => {
  const activeModel = models.find((m) => m.id === modelId);
  const chestModels = models.filter((m) => m.domain === "chest");
  const brainModels = models.filter((m) => m.domain === "brain");

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    onFileDrop(e.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Stethoscope className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-navy">New study</h3>
            <p className="text-xs text-muted">Select a model, upload a scan, add context.</p>
          </div>
        </div>
        <Badge tone={domain === "chest" ? "info" : "ai"} icon={domain === "chest" ? <HeartPulse className="h-3 w-3" /> : <Brain className="h-3 w-3" />}>
          {CLINICAL_DOMAIN_LABELS[domain]}
        </Badge>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="space-y-2">
          <label htmlFor="study-model" className="block text-xs font-medium uppercase tracking-wider text-muted">
            Inference model
          </label>
          <select id="study-model" value={modelId} onChange={(e) => onSelectModel(e.target.value)} className={inputClass}>
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
          {activeModel ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge>{activeModel.outputClasses} classes</Badge>
              <Badge>{activeModel.classLabels.join(", ")}</Badge>
              {activeModel.statusBadge ? (
                <Badge tone="success">{activeModel.statusBadge}</Badge>
              ) : (
                <Badge tone="warn">{activeModel.accuracy}</Badge>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="study-image-input" className="block text-xs font-medium uppercase tracking-wider text-muted">
            Diagnostic image
          </label>
          {preview ? (
            <div className="relative flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
              <img
                src={preview}
                alt="Selected scan"
                className="h-20 w-20 flex-shrink-0 rounded-md border border-line object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy">Scan image staged</p>
                <p className="text-xs text-muted">Ready for analysis · replace via drag &amp; drop</p>
              </div>
              <button
                type="button"
                onClick={onClearFile}
                title="Clear image"
                aria-label="Clear image"
                className="rounded p-1.5 text-muted transition-colors hover:bg-line/50 hover:text-navy focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="study-image-input"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-primary">
                <UploadCloud className="h-5 w-5" />
              </span>
              <p className="text-sm text-navy">
                <span className="font-medium text-primary">Click to upload</span> or drop an image
              </p>
              <p className="text-xs text-muted">PNG / JPEG · grayscale scans recommended · max 20 MB</p>
              <input id="study-image-input" type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
            </label>
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-navy">
              {CLINICAL_DOMAIN_LABELS[domain]} clinical context
            </h4>
            <span className="text-[11px] text-muted">Context only · not model input</span>
          </div>
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
            These values are recorded for the clinical record and the report. They are not fed to the image model.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => {
              const raw = answers[field.id];
              const value = raw === undefined || raw === null ? "" : String(raw);
              const invalid = Boolean(fieldErrors[field.id]);
              return (
                <Field
                  key={field.id}
                  id={`ctx-${field.id}`}
                  label={field.label}
                  required={field.required}
                  error={fieldErrors[field.id]}
                  helper={field.help}
                  className={FULL_WIDTH_FIELDS.has(field.id) ? "col-span-2" : "col-span-1"}
                >
                  {field.type === "number" ? (
                    <input
                      id={`ctx-${field.id}`}
                      type="number"
                      value={value}
                      min={field.min}
                      max={field.max}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? `ctx-${field.id}-error` : undefined}
                      onChange={(e) => onAnswer(field.id, e.target.value)}
                      className={inputClass}
                    />
                  ) : (
                    <select
                      id={`ctx-${field.id}`}
                      value={value}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? `ctx-${field.id}-error` : undefined}
                      onChange={(e) => onAnswer(field.id, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select…</option>
                      {field.type === "boolean"
                        ? [
                            <option key="true" value="true">
                              Yes
                            </option>,
                            <option key="false" value="false">
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
                </Field>
              );
            })}
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-critical/30 bg-[#fdeef1] p-3 text-sm text-critical"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button variant="primary" className="w-full" onClick={onSubmit} disabled={!preview} loading={busy}>
          {busy ? "Running diagnostic…" : "Run full diagnostic analysis"}
        </Button>
      </div>
    </div>
  );
};