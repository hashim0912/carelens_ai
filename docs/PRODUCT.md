# CareLens AI — Product & Engineering Handoff

> **Purpose of this document:** everything an engineer or AI assistant needs to
> understand, run, and extend the CareLens AI project. It is self-contained.

---

## 1. What CareLens AI is

CareLens AI is a **medical imaging assistant platform**. A user (clinician/admin)
uploads a medical image (e.g. a chest X-ray or brain MRI), the platform runs it
through bundled **TensorFlow Lite (`.tflite`) models**, and returns a
classification with per-class confidence scores. Scans and their results are
stored against users and (optionally) patients.

It is a **research/educational** tool. It is **not** a certified medical device,
and the bundled model weights are low-accuracy (see §8).

**Products in the suite**
- **Web app** — React SPA for login, dashboard, user management, and scanning.
- **Mobile app** — Expo / React Native app that runs models **on-device**.
- **API** — NestJS + Prisma backend (auth, users, patients, scans, predictions, inference proxy).
- **Inference service** — Python FastAPI service that executes the `.tflite` files.

**Origin:** the project is a **rewrite/migration** of an older decompiled Flutter
("Vital Scan / CareLens") mobile app plus an Angular web app. The original Flutter
app shipped the `.tflite` models as assets; those were extracted, hash-verified,
and are reused here. The original app referenced only `newPneumoniaModel.tflite`.

---

## 2. Repository layout (monorepo)

```
carlens_ai/
├─ apps/
│  ├─ api/            # NestJS + Prisma REST API            (port 3000, prefix /api)
│  ├─ web/            # React 19 + Vite + Tailwind SPA      (port 5173)
│  ├─ mobile/         # Expo (SDK 52) React Native app      (on-device inference)
│  └─ inference/      # Python FastAPI tflite service       (port 8001)
├─ packages/
│  ├─ config/         # shared tsconfig presets (@carelens/config)
│  ├─ shared/         # zod schemas, TS types, API paths (@carelens/shared)
│  └─ ml/             # model registry + preprocessing (@carelens/ml)
├─ models/            # 5 extracted .tflite files + manifest.json (hashes)
├─ saliency/          # occlusion-saliency tooling + generated heatmaps
├─ docker-compose.yml # postgres + inference + api
├─ turbo.json         # Turborepo task graph
├─ pnpm-workspace.yaml
└─ package.json       # root scripts
```

**Package names:** `@carelens/api`, `@carelens/web`, `@carelens/mobile`,
`@carelens/config`, `@carelens/shared`, `@carelens/ml`.

---

## 3. Tech stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (ESM everywhere), Python 3.14 (inference) |
| Web | React 19, Vite 6, React Router 7, TanStack Query 5, Tailwind 4, zod |
| Mobile | Expo SDK 52, expo-router, react-native-fast-tflite, expo-image-manipulator, jpeg-js |
| API | NestJS 11, Prisma 6, JWT (access + refresh), bcryptjs, class-validator, zod |
| DB | PostgreSQL 16 (Docker/prod) · SQLite (local dev profile) |
| Inference | FastAPI, uvicorn, Pillow, numpy, `ai-edge-litert` (TFLite runtime) |
| Deploy | Docker Compose (postgres + inference + api) |

**Environment notes (current dev machine):** Windows, PowerShell, Node v24,
pnpm 10.15.1, Python **3.14 only**. **git is NOT installed** and **Docker is NOT
installed** here — so SQLite is used for local dev and Docker Compose is provided
but not runnable on this machine.

---

## 4. How to run (local dev)

Prereqs: Node ≥20, pnpm 10, Python 3.14.

```powershell
# 1. Install JS deps
pnpm install

# 2. Build shared + ml packages (needed by web/api/mobile)
pnpm build

# 3. API (SQLite dev profile: generate client + push schema + seed admin, then watch)
pnpm --filter @carelens/api dev:local          # http://localhost:3000/api

# 4. Web
pnpm --filter @carelens/web dev                # http://localhost:5173

# 5. Inference (FastAPI)
cd apps/inference
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001   # http://localhost:8001

# 6. Mobile (optional)
pnpm --filter @carelens/mobile start
```

Root scripts: `build`, `dev`, `typecheck`, `lint`, `test`, `format`,
`inference:dev`.

**Default login (seeded):** `admin@carelens.ai` / `admin1234` (role `ADMIN`).

**API `.env`** (`apps/api/.env`):
```
DATABASE_URL="file:./dev.db"
PORT=3000
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / JWT_ACCESS_TTL=15m / JWT_REFRESH_TTL=7d
INFERENCE_URL="http://localhost:8001"
SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
# optional report config (see §9.4)
GROQ_API_KEY=         # unset → deterministic template fallback
GROQ_MODEL="openai/gpt-oss-120b"
GROQ_MODEL_FALLBACKS="openai/gpt-oss-120b,openai/gpt-oss-20b,allam-2-7b"
GROQ_BASE_URL="https://api.groq.com/openai/v1"
GROQ_TIMEOUT_MS=20000
```

**Ports:** API `3000`, Web `5173`, Inference `8001`, Postgres `5432`.

---

## 5. Data model (Prisma)

- **User** — `id`, `email` (unique), `passwordHash`, `name`, `role` (`ADMIN|DOCTOR|STAFF`), `scans[]`, timestamps.
- **Patient** — `id`, `name`, `dateOfBirth?`, `sex?` (`MALE|FEMALE|OTHER`), `scans[]`, `createdAt`.
- **Scan** — `id`, `userId`→User, `patientId?`→Patient, `modelId`, `status` (`PENDING|PROCESSING|COMPLETED|FAILED`), `clinicalContext?` (Json), `report?` (Json), `predictions?` (1:1), `createdAt`.

`Scan.clinicalContext` holds the domain-specific intake answers (see §9.3). It is
**context only** — the TFLite models take no tabular input, so these values are
never fed to the model and cannot change `label`/`confidence`/`scores`.
- **Prediction** — `id`, `scanId`→Scan (unique), `modelId`, `label`, `confidence` (0–1), `details` (Json array of `{label, confidence}`), `createdAt`.

`Scan.report` caches the generated downloadable report (`{content, generatedBy,
aiGenerated, modelId, generatedAt}`, see §9.4) so re-downloads are stable and do
not re-query the LLM. It is written by `POST /reports`; the report text never
alters the prediction.

SQLite has no native enums, so `prisma/schema.sqlite.prisma` uses `String` for
`Role/Sex/ScanStatus`. `prisma/schema.prisma` (Postgres) keeps real enums.

---

## 6. API surface (NestJS, global prefix `/api`)

Auth: JWT Bearer access token; refresh token rotates. Guarded routes require
`Authorization: Bearer <accessToken>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | – | create user + tokens |
| POST | `/auth/login` | – | email/password → access+refresh tokens |
| POST | `/auth/refresh` | – | rotate refresh token |
| GET | `/users` | ✅ | list users |
| GET | `/users/:id` | ✅ | get user |
| POST | `/users` | ✅ | create user (role) |
| GET | `/patients` | ✅ | list patients |
| POST | `/patients` | ✅ | create patient |
| GET | `/scans` | ✅ | list scans (+ counts) |
| POST | `/scans` | ✅ | create scan (`{modelId, patientId?, clinicalContext?}`); `clinicalContext` is validated against the model's domain |
| GET | `/scans/:id` | ✅ | get scan |
| POST | `/scans/:id/result` | ✅ | attach prediction result |
| POST | `/scans/:id/fail` | ✅ | mark a scan FAILED (rejected image); never creates a Prediction |
| GET | `/predictions/:scanId` | ✅ | get prediction for a scan |
| POST | `/inference/predict` | ✅ | **proxy**: forwards multipart upload to the inference service |
| POST | `/reports` | ✅ | build a downloadable PDF report (multipart `file` + `report` JSON); **200** `application/pdf` |
| GET | `/health` | – | `{"status":"ok","service":"carelens-api"}` |

The inference proxy accepts `multipart/form-data` with `file` and `model_id`,
forwards to `INFERENCE_URL/predict`, and returns the inference JSON unchanged.
It now **passes 422 rejections through unchanged** (status + JSON body) instead
of turning them into 500s.

`POST /reports` accepts `multipart/form-data` with `file` (the same image the
user analysed, ≤10 MB) and `report` (a JSON string matching
`reportRequestSchema`). It generates the report text (§9.4), renders a PDF
(§9.4), and streams it back as an attachment with **HTTP 200** (not 201). When
`scanId` is supplied and the caller owns the scan, the generated content is
cached on `Scan.report`; later requests reuse it instead of calling the LLM
again. Missing/invalid input → 400; unknown or unowned `scanId` → 404/403.

---

## 7. Inference service (FastAPI, port 8001)

Endpoints:
- `GET /health` → `{"status":"ok"}`
- `GET /models` → per-model `{id, file, domain, labels, accuracy, disclaimer, present, input{shape,dtype}, output{shape,dtype}}`
- `POST /predict` → `multipart/form-data`: `file`, `model_id` (default `pneumonia`)

`POST /predict` runs in this order:
1. Unknown `model_id` → **400**.
2. **Validation gate** (see §8.3). Not a medical scan → **422** `NOT_A_MEDICAL_IMAGE`.
3. Detected body part ≠ model domain → **422** `MODEL_IMAGE_MISMATCH` (with
   `suggested_models`). Rejections never run the model and contain **no**
   `label` / `confidence` / `scores`.
4. Otherwise run the real TFLite interpreter and return `status:"COMPLETED"`.

Success response shape:
```json
{
  "status": "COMPLETED",
  "model": "model",
  "model_domain": "chest",
  "label": "NORMAL",
  "confidence": 0.9999,
  "scores": [{"label":"NORMAL","confidence":0.9999}, {"label":"PNEUMONIA","confidence":0.0001}],
  "tensor_details": {"output_shape":[1,2], "raw_first":[0.0001, 0.9999]},
  "input_shape": [1,224,224,3],
  "input_dtype": "float32",
  "preprocessing": "pixel / 127.5 - 1 ([-1,1])",
  "accuracy": "~60% measured",
  "disclaimer": "Experimental model - for research and education only. Not a medical diagnosis.",
  "input_analysis": {
    "is_medical_scan": true,
    "detected_domain": "chest",
    "confidence": 0.91,
    "reasons": [],
    "metrics": {"colorfulness": 0.0, "dark_fraction": 0.03, "...": "..."}
  }
}
```

Rejection response shape (HTTP **422**):
```json
{
  "status": "REJECTED",
  "code": "MODEL_IMAGE_MISMATCH",
  "message": "This looks like a chest image but the selected model is for brain. No prediction was made.",
  "selected_model": "brain",
  "model_domain": "brain",
  "detected_domain": "chest",
  "suggested_models": ["pneumonia", "model", "model_unquant"],
  "input_analysis": {"is_medical_scan": true, "detected_domain": "chest", "...": "..."}
}
```
If the image passes Stage A but the body part is ambiguous, the model still runs
and the success response adds `"low_confidence_domain": true`.

CORS default `*` (`CARELENS_CORS_ORIGINS`). Models dir via
`CARELENS_MODELS_DIR` (defaults to repo `models/`). Interpreters are cached.

**Preprocessing pipeline:** `PIL.open → convert("RGB") → resize(224,224) → float32`
→ for float models scale to **[-1,1]** (`pixel/127.5 - 1`); for `uint8` models
clip 0–255. Output is softmax-ed when the tensor isn't already a probability
distribution.

---

## 8. The 5 models (`models/*.tflite`)

All take `float32 [1,224,224,3]`. Class names are **inferred** (no label metadata
shipped) — only the output *counts* are verified by probing the files.

| file | id | Domain | Intended purpose | Output classes | Measured accuracy |
|---|---|---|---|---|---|
| `newPneumoniaModel.tflite` | `pneumonia` | chest | Chest X-ray → pneumonia **type**. The only model the original app used. | `NORMAL`, `BACTERIAL_PNEUMONIA`, `VIRAL_PNEUMONIA` (3) | ~40% (near chance) |
| `model.tflite` | `model` | chest | Chest X-ray → pneumonia **yes/no**. | `NORMAL`, `PNEUMONIA` (2) | ~60% (best) |
| `model_unquant.tflite` | `model_unquant` | chest | Same binary task, unquantized float twin of `model.tflite`. | `NORMAL`, `PNEUMONIA` (2) | ~50% |
| `brain_model.tflite` | `brain` | brain | Brain MRI → tumor yes/no. | `no_tumor`, `tumor` (2) | unverified |
| `new_model.tflite` | `new_model` | brain | Brain MRI → tumor type (4-way). | `glioma`, `meningioma`, `pituitary`, `no_tumor` (4) | unverified |

**Grouping / domains:** chest/pneumonia = `pneumonia` + `model` + `model_unquant`;
brain/MRI = `brain` + `new_model`. Every model carries a `domain`
(`"chest" | "brain"`); `getModelDomain(id)` (TS) / `get_model_domain(id)` (Python)
return it, and `modelsForDomain` / `models_for_domain` list the ids in a domain.
The domain is used by the validation gate to refuse cross-domain uploads.

**Model registry** lives in `packages/ml/src/index.ts` (TS) and is mirrored in
`apps/inference/app/models.py` (Python). Each entry has: `id`, `file`, `domain`,
`outputClasses`, `classLabels`, `labelSource` (`inferred`), and `accuracy`.
`DEFAULT_MODEL_ID = "pneumonia"`. `IMAGE_PREPROCESSING` = 224px, RGB, `[-1,1]`,
with helper `scalePixel(v) = v/127.5 - 1`. `MODEL_DISCLAIMER` is exported and
shown in UIs.

**Model integrity** (`models/manifest.json`, SHA-256):
- brain `5F5E2DE0…`, model `3D9D059B…`, model_unquant `8934B2A8…`,
  newPneumoniaModel `CB5D21D3…`, new_model `35257CFB…` (each ~2.09 MB).

### 8.1 Measured accuracy (real labeled data)
Evaluated on a balanced set of **36 real chest X-rays** (18 normal / 18 pneumonia
from the public `ieee8023/covid-chestxray-dataset`), through the live HTTP API:
`model` ≈ 61%, `model_unquant` ≈ 44%, `pneumonia` ≈ 36% (detected only 2/18
pneumonia). Conclusion: the extracted weights are **tutorial-grade** and not
clinically reliable regardless of preprocessing.

### 8.2 Preprocessing finding
`[-1,1]` (MobileNetV2 convention) produced the most balanced/best outputs;
`[0,1]` saturated most inputs to a single class; `[0,255]` was worst. `[-1,1]`
is therefore used everywhere.

### 8.3 Validation gate (image screening + domain check)
Because the models confidently mislabel non-medical inputs and happily run on
any body part, `POST /predict` screens every image **before** the interpreter is
called. Implemented in `apps/inference/app/validation.py` (authoritative) and
mirrored in `packages/ml/src/validation.ts` (used on-device by the mobile app,
which checks before `react-native-fast-tflite` and skips inference if it fails).

`validate_image(image)` returns
`{is_medical_scan, detected_domain: "chest"|"brain"|"unknown", confidence, reasons, metrics}`.

**Stage A — is it a medical scan?** All checks are grayscale-aware feature tests
(all thresholds are named constants; measured values in the module docstring):

| feature | rejects | medical scans |
|---|---|---|
| colourfulness / coloured fraction | colour photo, UI screenshot | ~0 |
| white fraction `> 0.30` | scanned documents | ≤ 0.05 |
| Laplacian variance `< 15` | flat gradients, blur | ≥ 56 |
| neighbour roughness `≥ 0.30` / edge density `≥ 0.45` | noise, textured photos, text | ≤ 0.075 / ≤ 0.11 |
| unique tonal levels `< 180` | UI screenshots (limited palette) | 255+ |
| flat fraction `≥ 0.85` + entropy `≤ 6` | large flat UI panels | ≤ 0.70 |
| aspect outside `[0.5, 1.6]`, side `< 96px`, std `< 10` | screenshots, thumbnails, blanks | square-ish |

**Stage B — chest vs brain.** Brain MRI = mostly-black background
(`dark_fraction ≥ 0.35`) + a bright object centred in the frame
(`center_to_mean ≥ 1.3`) + narrower tonal range (`entropy ≤ 6.5`). Chest X-ray =
little pure black (`dark_fraction ≤ 0.20`) + full tonal range
(`entropy ≥ 6.0`). Anything ambiguous → `"unknown"` (the model still runs, but
the response is flagged `low_confidence_domain: true`).

**Learned-gate hook:** if `models/gate_model.tflite` exists (3 classes:
`chest_xray` / `brain_mri` / `other`) it is executed first and takes precedence
over the heuristics. The file is **not** shipped — the hook only supports
loading it.

**Measured gate results** (real + generated samples): 3/3 real scans accepted
with the correct domain; 7/7 generated negatives (colour screenshot, grayscale
screenshot, scanned text, gradient, noise, two grayscale photos) rejected. See
`apps/inference/tests/`.

**Verification note:** the gate is heuristic. Measured feature values and the
real/synthetic samples used to tune it are documented in the module and tests;
no accuracy beyond these measured samples is claimed.

### 8.4 Saliency findings
`saliency/gen_saliency.py` computes occlusion-sensitivity heatmaps (16×16 patches)
for the chest models. Result: the chest models **do not localize the lungs** —
`pneumonia`'s decision is driven more by periphery/upper regions than the lung
fields (center importance below average), and `model` is nearly insensitive
(overconfident). This corroborates that the weights are not clinically meaningful.

---

## 9. Frontends

### 9.1 Web (`apps/web`) — Vite SPA, `http://localhost:5173`
Routes (`src/App.tsx`): `/login`; under `Shell` → `/dashboard`, `/users`,
`/add-user`, `/scan` (and `/` → `/dashboard`).
- `lib/api.ts`: `apiFetch` (adds Bearer token, JSON, error mapping), tokens
  persisted in `localStorage` (`carelens.accessToken` + `carelens.refreshToken`),
  `inferencePredict(file, modelId)`, plus `createScan(modelId, clinicalContext)`
  and `submitScanResult(scanId, result)` for persistence. Service URLs are
  **host-aware** (derived from `window.location.hostname`, ports 3000/8001) so
  the app works from other devices on the LAN; override with `VITE_API_URL` /
  `VITE_INFERENCE_URL`. A 422 rejection is surfaced as a
  `RejectedInferenceError` carrying the structured `InferenceRejection`.
  **Session continuity:** because the access token is short-lived (15m), every
  request goes through an auth-aware wrapper that (a) refreshes proactively when
  the token is within ~60s of expiry, and (b) on a `401` refreshes once
  (single-flight, so concurrent requests share one refresh) and retries the
  original request — including the `multipart/form-data` report upload. An
  unrecoverable `401` clears both tokens and redirects to `/login`. This is why
  a long-lived session no longer breaks with "Invalid or expired token" after
  15 minutes; the same recovery is used for the PDF report download.
- `pages/ScanPage.tsx`: model `<select>` grouped into **Chest X-ray** and
  **Brain MRI** `<optgroup>`s, image upload + preview, a **domain-aware clinical
  context** form (see §9.3), then calls `inferencePredict` (genuinely runs the
  model — **not hardcoded**). On success shows the verdict, per-class
  **probability bars**, the entered clinical context, input meta, measured
  accuracy and disclaimer, then persists the scan + result via the API. On a
  **422 rejection** it shows a "Not a medical image" or "Wrong model for this
  image" card with one-tap **suggested-model** buttons and renders **no**
  verdict/bars. Ambiguous body part (`low_confidence_domain`) shows a softer
  warning.
- **Download report (PDF)**: after a successful prediction the Scan page shows a
  **Download report (PDF)** button. It posts the analysed `File` plus the
  prediction to `POST /reports` and saves the returned PDF as
  `carelens-report-<scanId>.pdf` (`downloadReportPdf` + `saveBlob` in
  `lib/api.ts`). See §9.4.

### 9.2 Mobile (`apps/mobile`) — Expo SDK 52, expo-router
Screens: `app/index.tsx` (splash/redirect), `app/login.tsx`,
`app/(app)/index.tsx` (dashboard), `app/(app)/scan.tsx`, `app/(app)/users.tsx`.
- **On-device inference** (`src/lib/inference.ts`): validates the image with the
  shared gate (`validateImageForModel` from `@carelens/ml`) **before** loading
  `react-native-fast-tflite`; on rejection it throws `MedicalImageRejectedError`
  and **skips inference**. Otherwise it builds a `224×224` RGB tensor
  (expo-image-manipulator → jpeg-js), scales with `scalePixel` ([-1,1]), softmaxes
  if needed, and runs the model.
- `src/lib/config.ts`: `API_URL`/`INFERENCE_URL`; default `http://10.0.2.2:3000/api`
  (Android emulator host loopback) — set `EXPO_PUBLIC_API_URL` for a real device.
- Scan screen groups models by domain and shows the rejection card (with
  suggested models) when the gate refuses an image; the model output otherwise
  appears **immediately after on-device inference**, then best-effort saves the
  scan + result to the API. It also renders the same domain-aware clinical
  context form as web and saves the answers with the scan.

### 9.3 Clinical context (intake fields)
Both Scan screens (web + mobile) collect a small, **domain-specific** intake
form alongside the image, so the reader sees the verdict next to relevant
context:
- **Chest X-ray** — age, sex, fever, cough, shortness of breath, sputum,
  chest pain, smoking status, immunocompromised, recent hospitalization/antibiotics.
- **Brain MRI** — age, sex, headache, seizures, vision changes, focal
  weakness, nausea/vomiting, prior cancer, immunosuppression.

The field catalog lives in `packages/ml` (`CLINICAL_FIELDS`,
`getClinicalFields(domain)`) with helpers `emptyClinicalAnswers`,
`buildClinicalContext` (coerce + required/range checks) and
`describeClinicalContext` (render). The zod contract lives in
`@carelens/shared` (`chestClinicalContextSchema` / `brainClinicalContextSchema`,
`clinicalContextSchemaForDomain`); a test in `packages/ml` asserts the two stay
in sync. The API validates `clinicalContext` against the selected model's
domain, so a chest scan cannot carry brain answers.

**These fields never touch the model.** The TFLite models accept only
`float32 [1,224,224,3]` and produce the reported `label`/`confidence`/`scores`
regardless of the intake answers; the context is stored on `Scan.clinicalContext`
and shown in the result card and dashboards.

### 9.4 Downloadable report (PDF + AI recommendations) — web (Phase 1)
After a prediction the user can download a **PDF report** that contains the
**input image**, the real model output and **recommendations/text**, via
`POST /reports` (`apps/api/src/reports/`).

**Request** — `multipart/form-data`:
- `file`: the same image the user analysed (not persisted server-side; the
  client re-supplies it so the report embeds it), ≤10 MB.
- `report`: JSON string matching `reportRequestSchema`
  (`{modelId, label, confidence, scores[], accuracy?, scanId?, clinicalContext?}`).
- `scanId` (optional): when present and owned by the caller (ADMIN bypasses
  ownership), the generated content is cached on `Scan.report` and **reused** on
  later downloads without another LLM call.

**Response** — **HTTP 200** `application/pdf`, `Content-Disposition: attachment`.
Rendered with `pdfkit` (`reports/pdf.ts`): title/Report ID, model + domain,
measured accuracy, the input image, the verdict + confidence, the score table,
the clinical context, then the recommendations section, red flags, limitations
and the disclaimer. Multiple pages get a footer with page numbers and the
"not a medical diagnosis" line.

**Recommendations text** — two paths, both grounded only in the model's own
values (the label must be a real label of the selected model):
- **AI path** — when `GROQ_API_KEY` is set, `reports/groq.service.ts` calls the
  Groq chat-completions API server-side (key never reaches the client) with a
  prompt built by `buildReportPrompt` and parses a strict JSON reply. The report
  is labeled **"AI-generated draft — not a diagnosis"** and stamps the model id
  as `generatedBy`, with `aiGenerated: true`.
  **Model resilience:** because Groq retires models over time, the client tries
  `GROQ_MODEL` first, then each id in `GROQ_MODEL_FALLBACKS` in order, and as a
  last resort discovers any chat-capable model still listed by Groq's `/models`
  (audio/guard models are skipped — see `@carelens/ml` `groq.ts`). Whichever
  model actually served the request is recorded as `generatedBy`, so the report
  keeps working when a model disappears.
- **Deterministic fallback** — when the key is unset, the call fails/times out,
  or the reply is malformed, `buildReportContent` (`packages/ml/src/report.ts`)
  produces a **label-driven template** from a per-label playbook
  (`generatedBy: "template"`, `aiGenerated: false`, labeled **"Template guidance
  — not AI-generated"**). Downloads therefore never fail because the LLM is
  unavailable.
- **Image-embedding safety** — PDFKit decodes PNG pixels with `png-js`, whose
  `decodePixels` inflates the IDAT stream inside an **async** zlib callback that
  `throw`s on error. That throw has no surrounding `try/catch`, so a single
  corrupt/unsupported PNG (any RGBA, paletted-with-`tRNS`, or interlaced image)
  used to **crash the whole API process** — after which every request, including
  the report download, failed. `reports/image-safety.ts` inflates the same IDAT
  bytes up front (`pngPixelsInflate`); an image that fails is skipped and the
  PDF renders the "(the uploaded image could not be embedded)" note instead, so
  the report still downloads. `bootstrap()` also registers a narrow
  `uncaughtException` handler that logs and swallows image-decoder errors
  (`Z_DATA_ERROR`/`Z_BUF_ERROR` from `png-js`/`jpeg-js`) so a malformed upload
  can never take the server down. Covered by `apps/api/test/image-safety.test.mjs`.

The content contract (`ReportContent`) and the prompt live in `@carelens/ml`;
the zod schemas (`reportContentSchema`, `scanReportSchema`, `reportRequestSchema`)
live in `@carelens/shared`. The AI text is advisory context only — it cannot
change `label`/`confidence`/`scores`, and the PDF always repeats the disclaimer.

**Config** (`apps/api/.env`, all optional): `GROQ_API_KEY` (unset → fallback),
`GROQ_MODEL` (any Groq chat model id; `openai/gpt-oss-120b` verified working,
code default `openai/gpt-oss-120b`), `GROQ_MODEL_FALLBACKS` (comma-separated,
tried in order when the primary is unavailable or errors; default
`openai/gpt-oss-120b,openai/gpt-oss-20b,allam-2-7b`), `GROQ_BASE_URL`
(default `https://api.groq.com/openai/v1`), `GROQ_TIMEOUT_MS` (default 20000).

**Scope:** web only this iteration. Mobile report (share/print) is Phase 2
(§13). Images are still not persisted server-side, so reports for past scans
require re-supplying the image.

---

## 10. Auth & roles
- JWT **access** (15m) + **refresh** (7d); refresh rotates. Each issued token
  carries a unique `jti`, so a refresh always returns a genuinely new pair
  (without it, two tokens minted in the same second were byte-for-byte
  identical). The web client transparently refreshes expiring/expired access
  tokens (§9.1); mobile already retried on `401`.
- Roles: `ADMIN`, `DOCTOR`, `STAFF`. Passwords hashed with bcryptjs (10 rounds).
- Web stores both tokens in `localStorage`; mobile uses `expo-secure-store`.
- `JwtAuthGuard` (custom) + `@CurrentUser()` decorator on the API.

---

## 11. Deployment
`docker-compose.yml` defines:
- **postgres:16-alpine** (user/pass/db `carelens`) with healthcheck + volume.
- **inference** (built from `apps/inference/Dockerfile`, mounts `./models` read-only, port 8001).
- **api** (built from `apps/api/Dockerfile`, depends on healthy postgres + inference, port 3000, Postgres `DATABASE_URL`, JWT + seed envs). Optional report env: `GROQ_API_KEY` (unset → deterministic template fallback), `GROQ_MODEL`, `GROQ_MODEL_FALLBACKS`, `GROQ_BASE_URL`, `GROQ_TIMEOUT_MS` (see §9.4).

Note: the API `Dockerfile` uses the Postgres Prisma schema; run
`prisma migrate deploy` (or `db push`) in the container.

---

## 12. Known limitations & gotchas
1. **Model accuracy is poor** (~40–60%) and the chest models don't localize lungs — this is the biggest limitation. Replacing the weights is the highest-value improvement.
2. **Class labels are inferred**, not ground-truth (e.g. `BACTERIAL/VIRAL` mapping is an assumption).
3. **Clinical intake fields are context only.** They are stored and displayed but never fed to the model, so they cannot change the prediction. A genuine multimodal/fusion model would require training data and new weights.
4. **The validation gate is heuristic** and not perfect: it is tuned against a small set of real scans and generated negatives (see §8.3). Unusual-but-valid scans can be rejected, and an atypical grayscale photo could still pass. **A trained gate model (`models/gate_model.tflite`) is recommended** — the loading hook is already in place. The mobile on-device check runs on the 224×224 resized buffer, so aspect/palette cues are weaker there; the server check on the original upload is authoritative.
5. **Local env:** no git, no Docker on this machine → SQLite dev profile; Docker Compose is unexercised here.
6. **Python 3.14 only** locally; the inference container targets a 3.12 base. `ai-edge-litert==2.3.0` is required (importing `ai_edge_litert.interpreter.Interpreter`; the top-level package does not expose it).
7. Prisma build-script warning on pnpm 10 is cosmetic (client is generated explicitly).
8. ESM everywhere: API uses `module: NodeNext` with `.js` extensions in relative imports.
9. Inference tests need `pytest` + `httpx` (`python -m pip install pytest httpx`); run them from `apps/inference` (`python -m pytest`).
10. **Report AI text is advisory only.** When `GROQ_API_KEY` is set, `POST /reports` calls an external LLM (Groq) server-side; the text cannot change the model output and is not a diagnosis. Groq retires models over time, so the client tries `GROQ_MODEL`, then `GROQ_MODEL_FALLBACKS`, then any chat-capable model it discovers via `/models` (verified live: a removed primary falls through to a working model); if everything fails it falls back to the deterministic label-driven template (§9.4). Without a key the template is used directly.
11. **Report images are not persisted.** Reports embed the image supplied in the request, so re-downloading a past scan requires the client to re-supply the image (web keeps it in-session). Mobile report export is Phase 2.

---

## 13. Suggested next steps
1. Swap in a **proper pretrained chest-X-ray pneumonia model** (drop into `models/`, update `packages/ml` + `apps/inference/app/models.py`) — nearest win.
2. Train/ship the **`gate_model.tflite`** (3-class) to replace the heuristics as the authoritative screen.
3. ✅ Done: web now persists scans/results via `POST /scans` + `/scans/:id/result` and both platforms save `clinicalContext`.
4. Persist scan **images** (object storage) and add scan **history/detail** pages (share-reports).
5. Replace `[inferred]` labels with **verified** ones once a label source is found.
6. ✅ Done (web): downloadable **PDF report** with the input image + recommendations via `POST /reports`, AI (Groq) with a deterministic fallback (§9.4).
7. **Mobile report export (Phase 2)**: reuse the report content on-device and share/print via Expo (`expo-print` / `expo-sharing`); requires persisting the scan image server-side (item 4).

---

## 14. Reference artifacts
- `models/manifest.json` — model hashes/sizes.
- `carlens (1).prediction.json` — example multi-model output for one X-ray.
- `saliency/carlens_saliency_montage.png` — saliency overlay (original | pneumonia | model | model_unquant).
- Original extracted models came from a decompiled Flutter APK assets folder.

---

## 15. Glossary
- **TFLite** — TensorFlow Lite; `.tflite` model files.
- **NHWC** — tensor layout `[batch, height, width, channels]`.
- **OOD** — out-of-distribution (input unlike training data).
- **Grad-CAM / occlusion saliency** — visualization of which image regions affect a model's prediction.
- **Monorepo packages** — `@carelens/{config,shared,ml}` consumed by the apps.
