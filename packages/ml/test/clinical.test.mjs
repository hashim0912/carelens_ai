/**
 * Tests for the clinical intake catalog and its consistency with the shared
 * zod schemas.
 *
 * Run with: node --test test/clinical.test.mjs   (after `tsc -p tsconfig.json`)
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  brainClinicalContextSchema,
  chestClinicalContextSchema,
} from "@carelens/shared";

import {
  buildClinicalContext,
  CLINICAL_FIELDS,
  describeClinicalContext,
  emptyClinicalAnswers,
  getClinicalFields,
} from "../dist/index.js";

const VALID_CHEST = {
  age: "62",
  sex: "MALE",
  fever: "true",
  cough: "true",
  shortness_of_breath: "false",
};

const VALID_BRAIN = {
  age: "45",
  sex: "FEMALE",
  headache: "true",
  seizures: "false",
};

test("catalog has fields for both domains with unique ids", () => {
  for (const domain of ["chest", "brain"]) {
    const fields = getClinicalFields(domain);
    assert.ok(fields.length > 0, `${domain} has no fields`);
    const ids = fields.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, `${domain} has duplicate ids`);
    for (const field of fields) {
      if (field.type === "select") {
        assert.ok(field.options?.length, `${field.id} select has no options`);
      }
      if (field.type === "number") {
        assert.equal(typeof field.min, "number", `${field.id} missing min`);
        assert.equal(typeof field.max, "number", `${field.id} missing max`);
      }
    }
  }
});

test("getClinicalFields returns a copy, not the catalog itself", () => {
  const fields = getClinicalFields("chest");
  fields.pop();
  assert.equal(
    getClinicalFields("chest").length,
    CLINICAL_FIELDS.chest.length,
  );
});

test("emptyClinicalAnswers marks every field unanswered", () => {
  const answers = emptyClinicalAnswers("brain");
  for (const field of getClinicalFields("brain")) {
    assert.equal(answers[field.id], "");
  }
});

test("buildClinicalContext coerces a valid chest form", () => {
  const { context, errors } = buildClinicalContext("chest", VALID_CHEST);
  assert.deepEqual(errors, []);
  assert.deepEqual(context, {
    age: 62,
    sex: "MALE",
    fever: true,
    cough: true,
    shortness_of_breath: false,
  });
});

test("buildClinicalContext reports missing required fields", () => {
  const { context, errors } = buildClinicalContext("chest", {
    age: "30",
    sex: "OTHER",
  });
  assert.equal(context, undefined);
  const missing = errors.map((e) => e.id).sort();
  assert.deepEqual(missing, ["cough", "fever", "shortness_of_breath"]);
});

test("buildClinicalContext rejects out-of-range and invalid values", () => {
  const range = buildClinicalContext("chest", { ...VALID_CHEST, age: "999" });
  assert.ok(range.errors.some((e) => e.id === "age"));

  const badBool = buildClinicalContext("chest", {
    ...VALID_CHEST,
    fever: "maybe",
  });
  assert.ok(badBool.errors.some((e) => e.id === "fever"));

  const badSelect = buildClinicalContext("brain", {
    ...VALID_BRAIN,
    sex: "UNKNOWN",
  });
  assert.ok(badSelect.errors.some((e) => e.id === "sex"));
});

test("optional fields are omitted when unanswered", () => {
  const { context } = buildClinicalContext("brain", VALID_BRAIN);
  assert.equal("vision_changes" in context, false);
});

test("shared schemas match the catalog fields exactly", () => {
  assert.deepEqual(
    Object.keys(chestClinicalContextSchema.shape).sort(),
    getClinicalFields("chest").map((f) => f.id).sort(),
  );
  assert.deepEqual(
    Object.keys(brainClinicalContextSchema.shape).sort(),
    getClinicalFields("brain").map((f) => f.id).sort(),
  );
});

test("shared schemas accept built contexts and reject cross-domain ones", () => {
  const chest = buildClinicalContext("chest", VALID_CHEST);
  const brain = buildClinicalContext("brain", VALID_BRAIN);

  assert.equal(chestClinicalContextSchema.safeParse(chest.context).success, true);
  assert.equal(brainClinicalContextSchema.safeParse(brain.context).success, true);
  assert.equal(chestClinicalContextSchema.safeParse(brain.context).success, false);
  assert.equal(brainClinicalContextSchema.safeParse(chest.context).success, false);
});

test("describeClinicalContext renders human-readable values", () => {
  const { context } = buildClinicalContext("chest", {
    ...VALID_CHEST,
    smoking_status: "former",
  });
  const rows = describeClinicalContext("chest", context);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.value]));
  assert.equal(byId.age, "62 years");
  assert.equal(byId.fever, "Yes");
  assert.equal(byId.shortness_of_breath, "No");
  assert.equal(byId.smoking_status, "Former");
});
