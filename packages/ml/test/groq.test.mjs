/**
 * Tests for Groq model-resolution helpers (model fallback / discovery).
 *
 * Run with: node --test test/groq.test.mjs   (after `tsc -p tsconfig.json`)
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGroqModelCandidates,
  isChatModel,
  parseModelList,
  pickAvailableGroqModel,
  pickDiscoveredGroqModel,
} from "../dist/index.js";

test("parseModelList splits, trims and de-duplicates", () => {
  assert.deepEqual(parseModelList("a, b ,a,, c\nb"), ["a", "b", "c"]);
  assert.deepEqual(parseModelList(""), []);
  assert.deepEqual(parseModelList(undefined), []);
});

test("buildGroqModelCandidates puts the primary first and de-dupes", () => {
  assert.deepEqual(
    buildGroqModelCandidates("primary", "fallback-1, primary, fallback-2"),
    ["primary", "fallback-1", "fallback-2"],
  );
  assert.deepEqual(buildGroqModelCandidates("only", ""), ["only"]);
  assert.deepEqual(buildGroqModelCandidates("", "a,b"), ["a", "b"]);
});

test("isChatModel rejects audio and guard models", () => {
  for (const id of [
    "whisper-large-v3",
    "whisper-large-v3-turbo",
    "canopylabs/orpheus-v1-english",
    "meta-llama/llama-prompt-guard-2-86m",
    "openai/gpt-oss-safeguard-20b",
  ]) {
    assert.equal(isChatModel(id), false, `${id} should not be a chat model`);
  }
  for (const id of [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "allam-2-7b",
    "llama-3.3-70b-versatile",
  ]) {
    assert.equal(isChatModel(id), true, `${id} should be a chat model`);
  }
});

test("pickAvailableGroqModel returns the first preferred available model", () => {
  assert.equal(
    pickAvailableGroqModel(["a", "b", "c"], ["c", "b"]),
    "b",
  );
  assert.equal(pickAvailableGroqModel(["a"], ["z"]), null);
});

test("pickDiscoveredGroqModel prefers known-good ids and skips tried ones", () => {
  const available = [
    "whisper-large-v3",
    "allam-2-7b",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
  ];
  // gpt-oss-120b is preferred but already tried → next best chat model is returned.
  assert.equal(
    pickDiscoveredGroqModel(
      ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "allam-2-7b"],
      available,
      ["openai/gpt-oss-120b"],
    ),
    "openai/gpt-oss-20b",
  );
  // No preferred model available → any chat model not excluded.
  assert.equal(
    pickDiscoveredGroqModel(["gone-model"], available, []),
    "allam-2-7b",
  );
  // Only non-chat models remain → null.
  assert.equal(
    pickDiscoveredGroqModel(["x"], ["whisper-large-v3"], []),
    null,
  );
});
