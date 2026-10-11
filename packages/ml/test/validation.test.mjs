/**
 * Tests for the TypeScript medical-image validation gate.
 *
 * Run with: node --test test/validation.test.mjs   (after `tsc -p tsconfig.json`)
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMedicalImage,
  getModelDomain,
  MODELS,
  modelsForDomain,
} from "../dist/index.js";

const W = 224;
const H = 224;

function build(fn) {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * W + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }
  return rgb;
}

function analyzeGray(fn) {
  return analyzeMedicalImage(build((x, y) => {
    const v = fn(x, y);
    return [v, v, v];
  }), W, H);
}

// Deterministic pseudo-random noise.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("registry exposes domains", () => {
  assert.equal(getModelDomain("pneumonia"), "chest");
  assert.equal(getModelDomain("model"), "chest");
  assert.equal(getModelDomain("model_unquant"), "chest");
  assert.equal(getModelDomain("brain"), "brain");
  assert.equal(getModelDomain("new_model"), "brain");
  assert.equal(getModelDomain("nope"), undefined);
  assert.deepEqual(
    modelsForDomain("brain").map((m) => m.id).sort(),
    ["brain", "new_model"],
  );
  assert.equal(MODELS.every((m) => m.domain === "chest" || m.domain === "brain"), true);
});

test("colour image is rejected", () => {
  const random = rng(1);
  const rgb = build(() => [
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    Math.floor(random() * 256),
  ]);
  const result = analyzeMedicalImage(rgb, W, H);
  assert.equal(result.is_medical_scan, false);
  assert.ok(result.reasons.length > 0);
});

test("plain gradient is rejected (no texture)", () => {
  const result = analyzeGray((x) => (x / (W - 1)) * 255);
  assert.equal(result.is_medical_scan, false);
});

test("uniform image is rejected", () => {
  const result = analyzeGray(() => 128);
  assert.equal(result.is_medical_scan, false);
});

test("noise is rejected", () => {
  const random = rng(7);
  const result = analyzeGray(() => Math.floor(random() * 256));
  assert.equal(result.is_medical_scan, false);
});

test("chest-like grayscale scan is accepted and detected as chest", () => {
  const random = rng(11);
  const result = analyzeGray(
    (x, y) =>
      130 +
      92 * Math.sin(x / 38) * Math.cos(y / 47) +
      (random() - 0.5) * 12,
  );
  assert.equal(result.is_medical_scan, true, JSON.stringify(result.reasons));
  assert.equal(result.detected_domain, "chest");
});

test("brain-like grayscale scan is accepted and detected as brain", () => {
  const random = rng(13);
  const result = analyzeGray((x, y) => {
    const r = Math.hypot(x - W / 2, y - H / 2);
    if (r > 72) return 0;
    return 230 - 195 * (r / 72) + (random() - 0.5) * 12;
  });
  assert.equal(result.is_medical_scan, true, JSON.stringify(result.reasons));
  assert.equal(result.detected_domain, "brain");
});
