/**
 * Tests for the report content builder + Groq prompt grounding.
 *
 * Run with: node --test test/report.test.mjs   (after `tsc -p tsconfig.json`)
 */
import assert from "node:assert/strict";
import test from "node:test";

import { reportContentSchema } from "@carelens/shared";

import {
  buildReportContent,
  buildReportPrompt,
  getModel,
  REPORT_AI_LABEL,
  REPORT_TEMPLATE_LABEL,
} from "../dist/index.js";

function predictionFor(modelId, label, overrides = {}) {
  return {
    modelId,
    label,
    confidence: 0.8,
    scores: [
      { label, confidence: 0.8 },
      { label: "other_class", confidence: 0.2 },
    ],
    ...overrides,
  };
}

test("fallback content matches the shared schema for both domains", () => {
  const cases = [
    ["pneumonia", "BACTERIAL_PNEUMONIA"],
    ["model", "NORMAL"],
    ["brain", "tumor"],
    ["new_model", "glioma"],
  ];
  for (const [modelId, label] of cases) {
    const model = getModel(modelId);
    const content = buildReportContent(
      model.domain,
      predictionFor(modelId, label, { accuracy: model.accuracy }),
    );
    const parsed = reportContentSchema.safeParse(content);
    assert.equal(parsed.success, true, `${modelId}/${label} failed schema`);
  }
});

test("fallback content keys stay in sync with the shared schema", () => {
  const model = getModel("pneumonia");
  const content = buildReportContent(model.domain, predictionFor("pneumonia", "NORMAL"));
  assert.deepEqual(
    Object.keys(content).sort(),
    Object.keys(reportContentSchema.shape).sort(),
  );
});

test("fallback echoes the prediction verbatim and never invents a class", () => {
  const content = buildReportContent(
    "chest",
    predictionFor("pneumonia", "VIRAL_PNEUMONIA"),
  );
  assert.match(content.summary, /VIRAL_PNEUMONIA/);
  assert.match(content.summary, /80\.0%/);
  assert.ok(content.findings.some((f) => f.includes("VIRAL_PNEUMONIA")));
  assert.ok(content.findings.some((f) => f.includes("other_class")));
});

test("a small margin is reported as uncertainty", () => {
  const content = buildReportContent("chest", {
    modelId: "model",
    label: "NORMAL",
    confidence: 0.52,
    scores: [
      { label: "NORMAL", confidence: 0.52 },
      { label: "PNEUMONIA", confidence: 0.48 },
    ],
  });
  assert.match(content.summary, /uncertain/i);
});

test("an unconfirmed body part is flagged", () => {
  const content = buildReportContent("brain", {
    ...predictionFor("brain", "no_tumor"),
    lowConfidenceDomain: true,
  });
  assert.match(content.summary, /unreliable/i);
});

test("an unknown label falls back to generic guidance but stays valid", () => {
  const content = buildReportContent("chest", predictionFor("model", "SOMETHING_NEW"));
  assert.equal(reportContentSchema.safeParse(content).success, true);
  assert.ok(content.recommendations.length > 0);
  assert.ok(content.redFlags.length > 0);
});

test("the labels are distinct and set the AI/template boundary", () => {
  assert.notEqual(REPORT_AI_LABEL, REPORT_TEMPLATE_LABEL);
  assert.match(REPORT_AI_LABEL, /not a diagnosis/i);
});

test("the prompt is grounded in the supplied values", () => {
  const { system, user } = buildReportPrompt(
    "chest",
    predictionFor("pneumonia", "BACTERIAL_PNEUMONIA"),
    { age: 62, fever: true },
  );
  assert.match(system, /never invent/i);
  assert.match(system, /never state or imply a diagnosis/i);
  assert.match(user, /BACTERIAL_PNEUMONIA/);
  assert.match(user, /"confidence": 0.8/);
  assert.match(user, /bacterial_pneumonia/i);
  assert.match(user, /fever/);
  assert.match(user, /"summary"/);
});

test("the prompt has no clinical context when none is provided", () => {
  const { user } = buildReportPrompt("brain", predictionFor("brain", "tumor"));
  assert.match(user, /"clinicalContext": null/);
});
