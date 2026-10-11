import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  buildClinicalContext,
  CLINICAL_CONTEXT_DISCLAIMER,
  DEFAULT_MODEL_ID,
  describeClinicalContext,
  emptyClinicalAnswers,
  getClinicalFields,
  MedicalImageRejectedError,
  MODELS,
  modelsForDomain,
  type ClinicalAnswers,
  type ClinicalFieldSpec,
} from "@carelens/ml";
import { api } from "@/lib/api";
import { pickImage, uriToRgb } from "@/lib/image";
import { runOnDevice, type DevicePrediction } from "@/lib/inference";

const DOMAIN_LABELS: Record<string, string> = {
  chest: "Chest X-ray",
  brain: "Brain MRI",
};

interface Rejection {
  code: "NOT_A_MEDICAL_IMAGE" | "MODEL_IMAGE_MISMATCH";
  detectedDomain: string;
  suggested: string[];
}

const BOOLEAN_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export default function ScanScreen() {
  const queryClient = useQueryClient();
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ClinicalAnswers>(() =>
    emptyClinicalAnswers("chest"),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submittedContext, setSubmittedContext] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DevicePrediction | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = MODELS.find((m) => m.id === modelId);
  const domain = model?.domain ?? "chest";
  const clinicalFields = getClinicalFields(domain);
  const chestModels = modelsForDomain("chest");
  const brainModels = modelsForDomain("brain");

  function onAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function onPick() {
    setError(null);
    setRejection(null);
    try {
      const uri = await pickImage();
      if (uri) {
        setImageUri(uri);
        setResult(null);
        setSubmittedContext(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pick image");
    }
  }

  function onSelectModel(id: string) {
    setModelId(id);
    setResult(null);
    setRejection(null);
    setError(null);
    setFieldErrors({});
    setSubmittedContext(null);
  }

  async function onAnalyze() {
    if (!imageUri) return;

    const { context, errors } = buildClinicalContext(domain, answers);
    if (errors.length > 0 || !context) {
      const mapped: Record<string, string> = {};
      for (const err of errors) mapped[err.id] = err.message;
      setFieldErrors(mapped);
      setError("Please complete the highlighted clinical fields.");
      return;
    }

    setBusy(true);
    setError(null);
    setRejection(null);
    setResult(null);
    setSubmittedContext(null);
    try {
      const rgb = await uriToRgb(imageUri);
      const prediction = await runOnDevice(modelId, rgb);
      setResult(prediction);
      setSubmittedContext(context);
      try {
        const scan = await api.createScan(modelId, context);
        await api.submitResult(scan.id, {
          modelId: prediction.modelId,
          label: prediction.label,
          confidence: prediction.confidence,
          scores: prediction.scores,
        });
        await queryClient.invalidateQueries({ queryKey: ["scans"] });
      } catch (saveErr) {
        setError(
          `Result generated, but saving to server failed: ${
            saveErr instanceof Error ? saveErr.message : "unknown error"
          }`,
        );
      }
    } catch (err) {
      if (err instanceof MedicalImageRejectedError) {
        setRejection({
          code: err.code,
          detectedDomain: err.detectedDomain,
          suggested:
            err.detectedDomain === "chest"
              ? chestModels.map((m) => m.id)
              : err.detectedDomain === "brain"
                ? brainModels.map((m) => m.id)
                : [],
        });
      } else {
        setError(err instanceof Error ? err.message : "Analysis failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function renderField(field: ClinicalFieldSpec) {
    const value = String(answers[field.id] ?? "");
    const invalid = Boolean(fieldErrors[field.id]);
    const options =
      field.type === "boolean" ? BOOLEAN_OPTIONS : field.options ?? [];

    return (
      <View key={field.id} style={styles.field}>
        <Text style={styles.fieldLabel}>
          {field.label}
          {field.required ? " *" : ""}
        </Text>
        {field.type === "number" ? (
          <TextInput
            style={[styles.input, invalid && styles.inputInvalid]}
            value={value}
            keyboardType="number-pad"
            placeholder="e.g. 45"
            placeholderTextColor="#64748b"
            onChangeText={(text) => onAnswer(field.id, text)}
          />
        ) : (
          <View style={styles.optionRow}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onAnswer(field.id, option.value)}
                style={[
                  styles.optionChip,
                  value === option.value && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    value === option.value && styles.optionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {fieldErrors[field.id] ? (
          <Text style={styles.fieldError}>{fieldErrors[field.id]}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      <Text style={styles.section}>Chest X-ray</Text>
      <View style={styles.chips}>
        {chestModels.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onSelectModel(m.id)}
            style={[styles.chip, m.id === modelId && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                m.id === modelId && styles.chipTextActive,
              ]}
            >
              {m.id}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Brain MRI</Text>
      <View style={styles.chips}>
        {brainModels.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onSelectModel(m.id)}
            style={[styles.chip, m.id === modelId && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                m.id === modelId && styles.chipTextActive,
              ]}
            >
              {m.id}
            </Text>
          </Pressable>
        ))}
      </View>

      {model ? (
        <Text style={styles.hint}>
          {model.file} · Classes: {model.classLabels.join(", ")} · Accuracy:{" "}
          {model.accuracy}
        </Text>
      ) : null}

      <Pressable style={styles.pick} onPress={onPick}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <Text style={styles.pickText}>Pick an image</Text>
        )}
      </Pressable>

      <View style={styles.fieldset}>
        <Text style={styles.fieldsetTitle}>
          {DOMAIN_LABELS[domain]} clinical context
        </Text>
        <Text style={styles.fieldsetNote}>{CLINICAL_CONTEXT_DISCLAIMER}</Text>
        {clinicalFields.map(renderField)}
      </View>

      <Pressable
        style={[styles.analyze, (!imageUri || busy) && styles.disabled]}
        onPress={onAnalyze}
        disabled={!imageUri || busy}
      >
        {busy ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.analyzeText}>Analyze on device</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {rejection ? (
        <View style={styles.rejectionCard}>
          <Text style={styles.rejectionTitle}>
            {rejection.code === "NOT_A_MEDICAL_IMAGE"
              ? "Not a medical image"
              : "Wrong model for this image"}
          </Text>
          <Text style={styles.rejectionText}>
            {rejection.code === "NOT_A_MEDICAL_IMAGE"
              ? "This does not look like a chest X-ray or brain MRI. No prediction was made."
              : `This looks like a ${DOMAIN_LABELS[rejection.detectedDomain] ?? rejection.detectedDomain} image, but the selected model is for a different body part. No prediction was made.`}
          </Text>
          {rejection.suggested.length > 0 ? (
            <View style={styles.suggestRow}>
              {rejection.suggested.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => onSelectModel(id)}
                  style={styles.suggestChip}
                >
                  <Text style={styles.suggestText}>Use {id}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {result ? (
        <View style={styles.resultCard}>
          {result.validation.detected_domain === "unknown" ? (
            <View style={styles.warning}>
              <Text style={styles.warningTitle}>
                Body part could not be confirmed
              </Text>
              <Text style={styles.warningText}>
                This looks like a medical scan but the body part is ambiguous,
                so the result may be unreliable.
              </Text>
            </View>
          ) : null}
          <Text style={styles.resultLabel}>
            Result · {result.modelId}
            {model ? ` (${model.file})` : ""}
          </Text>
          <Text style={styles.resultValue}>{result.label}</Text>
          <Text style={styles.resultConfidence}>
            {(result.confidence * 100).toFixed(1)}% confidence
          </Text>
          <View style={styles.scores}>
            {result.scores.map((s) => (
              <View key={s.label} style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>{s.label}</Text>
                <Text style={styles.scoreValue}>
                  {(s.confidence * 100).toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>

          {submittedContext ? (
            <View style={styles.contextCard}>
              <Text style={styles.contextTitle}>
                {DOMAIN_LABELS[domain]} clinical context
              </Text>
              {describeClinicalContext(domain, submittedContext).map((row) => (
                <View key={row.id} style={styles.contextRow}>
                  <Text style={styles.contextLabel}>{row.label}</Text>
                  <Text style={styles.contextValue}>{row.value}</Text>
                </View>
              ))}
              <Text style={styles.contextNote}>
                {CLINICAL_CONTEXT_DISCLAIMER}
              </Text>
            </View>
          ) : null}

          <Text style={styles.resultMeta}>
            Measured accuracy: {result.accuracy}
          </Text>
          <Text style={styles.disclaimer}>{result.disclaimer}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  section: { color: "#cbd5e1", fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#1e293b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#38bdf8" },
  chipText: { color: "#cbd5e1" },
  chipTextActive: { color: "#0f172a", fontWeight: "700" },
  hint: { color: "#64748b", fontSize: 12 },
  pick: {
    height: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    borderStyle: "dashed",
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pickText: { color: "#94a3b8" },
  preview: { width: "100%", height: "100%" },
  fieldset: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  fieldsetTitle: { color: "#f8fafc", fontWeight: "700" },
  fieldsetNote: { color: "#64748b", fontSize: 12 },
  field: { gap: 6 },
  fieldLabel: { color: "#cbd5e1", fontSize: 13 },
  input: {
    backgroundColor: "#0f172a",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
  },
  inputInvalid: { borderColor: "#f87171" },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    backgroundColor: "#0f172a",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionChipActive: { backgroundColor: "#38bdf8", borderColor: "#38bdf8" },
  optionText: { color: "#cbd5e1", fontSize: 13 },
  optionTextActive: { color: "#0f172a", fontWeight: "700" },
  fieldError: { color: "#f87171", fontSize: 12 },
  analyze: {
    backgroundColor: "#38bdf8",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  analyzeText: { color: "#0f172a", fontWeight: "700", fontSize: 16 },
  error: { color: "#f87171" },
  rejectionCard: {
    backgroundColor: "#450a0a",
    borderColor: "#b91c1c",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  rejectionTitle: { color: "#fecaca", fontWeight: "700", fontSize: 16 },
  rejectionText: { color: "#fca5a5", fontSize: 13 },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  suggestChip: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestText: { color: "#7dd3fc", fontWeight: "600", fontSize: 12 },
  resultCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  resultLabel: { color: "#94a3b8" },
  resultValue: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  resultConfidence: { color: "#38bdf8", marginBottom: 8 },
  scores: { gap: 4 },
  scoreRow: { flexDirection: "row", justifyContent: "space-between" },
  scoreLabel: { color: "#cbd5e1" },
  scoreValue: { color: "#f8fafc" },
  contextCard: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    gap: 4,
    marginTop: 8,
  },
  contextTitle: { color: "#f8fafc", fontWeight: "600", fontSize: 13 },
  contextRow: { flexDirection: "row", justifyContent: "space-between" },
  contextLabel: { color: "#94a3b8", fontSize: 12 },
  contextValue: { color: "#e2e8f0", fontSize: 12 },
  contextNote: { color: "#475569", fontSize: 11, marginTop: 4 },
  resultMeta: { color: "#64748b", fontSize: 12, marginTop: 8 },
  disclaimer: { color: "#fbbf24", fontSize: 12, marginTop: 4 },
  warning: {
    backgroundColor: "#422006",
    borderColor: "#a16207",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 2,
  },
  warningTitle: { color: "#fde68a", fontWeight: "700" },
  warningText: { color: "#fcd34d", fontSize: 12 },
});
