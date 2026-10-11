# CareLens AI — Memory / Status

Living handoff document. Every session should start here, update it at the end,
and keep it in sync with `docs/PRODUCT.md` (the detailed product spec).

> Last updated: **2026-10-11** · Repo: `https://github.com/hashim0912/carelens_ai` (branch `main`)
> Initial commit: `25f5939` (146 files, pushed via GitHub Desktop).

---

## 1. Project at a glance

A medical-imaging "diagnostic support" platform: a user uploads a chest X-ray or
brain MRI, the platform runs a real on-device TFLite model with a strict domain /
out-of-distribution gate, records clinical context, and lets the user download a
PDF report with AI-drafted recommendations.

| Layer | Tech | Notes |
|---|---|---|
| App | pnpm monorepo + turbo | `pnpm@10.15.1`, Node >= 20 |
| Inference | Python FastAPI + `ai-edge-litert` (TFLite) | port **8001** |
| API | NestJS 11 + Prisma + JWT | port **3000**, prefix `/api` |
| Web | Vite + React | port **5173** |
| Mobile | Expo SDK 52 + react-native-fast-tflite | Phase 2 features pending |
| Packages | `@carelens/ml` (pure logic, mirrored TS) · `@carelens/shared` (zod schemas) · `@carelens/config` | build to `dist/` |

**Model registry** (`packages/ml/src/index.ts` + `apps/inference/app/models.py`,
kept mirrored): `brain`, `pneumonia` (default), `model`, `model_unquant`,
`new_model`. Each has a `domain: "chest" | "brain"`. Weight files live in
`./models` (gitignored? **no** — committed at initial push, ~10 MB).

**Login**: `admin@carelens.ai` / `admin1234` (dev seed; configurable via
`SEED_ADMIN_*`).

---

## 2. Quick start

### Local (SQLite dev profile — this is what was exercised)

```powershell
# inference (needs Python 3.12-ish + ai-edge-litert)
$env:CARELENS_MODELS_DIR="C:\Users\13\Desktop\carlens_ai\models"
python -m uvicorn app.main:app --reload --port 8001   # (workdir apps/inference)

# api + web + packages
pnpm install
pnpm --filter @carelens/api db:local          # prisma generate+pull sqlite + seed
pnpm --filter @carelens/api dev               # NestJS watch on :3000
pnpm --filter @carelens/web dev               # Vite on :5173
```

`apps/api/.env` (gitignored — real secrets live here; `.env.example` ships).

### Docker (Compose — NOT yet exercised on this machine)

`docker-compose.yml` brings up postgres:16, inference, and the API. No Docker
installed locally, so the Compose path is **untested**; SQLite dev profile was
used instead. (Dev DB lives in `dev.db` / sqlite schema, gitignored.)

---

## 3. What is DONE ✅

### 3.1 Domain / OOD gate (prediction validity)
- Every request to `POST /inference/predict` is screened **before** the TFLite
  interpreter runs: non-medical images and wrong-body-part images are rejected
  with **HTTP 422** and **no** `label`/`confidence`/`scores` (top-level JSON).
- Gate = multi-feature heuristic (`apps/inference/app/validation.py`) + a
  learned-classifier hook; preprocessing `pixel/127.5 - 1` ([-1,1]).
- Ambiguous images still run and are reported with `low_confidence_domain`.
- Client grouping: chest vs brain model groups; rejected scans get a REJECTED UI
  card; NestJS passes 422 through; `/scans/:id/fail` records the rejection.
- **Trust rule**: every returned value comes from the real TFLite interpreter —
  never hardcoded/mocked/randomized/cached/fallback. Anti-hardcode pytest suite
  + TS mirror tests guard this.

### 3.2 Clinical intake fields (persisted web + mobile)
- `packages/ml/src/clinical.ts` (shared zod schemas in `@carelens/shared`),
  `Scan.clinicalContext`, API DTO validation, web/mobile UI + tests.
- Strictly **context only** — never changes model output.

### 3.3 Downloadable PDF report — web (Phase 1)
- `POST /api/reports` (multipart `file` + `report` JSON) → `200 application/pdf`
  attachment `carelens-report-<date>.pdf`.
- Rendered server-side with `pdfkit` (`apps/api/src/reports/pdf.ts`): report id,
  model + domain + measured accuracy, input image, verdict + confidence, score
  table, clinical context, AI recommendations, red flags, limitations,
  disclaimer, page footers.
- **Groq AI path** (`groq.service.ts`): server-side only, strict-JSON reply,
  `aiGenerated: true`, stamps `generatedBy` with the model that served.
- **Model resilience**: order = `GROQ_MODEL` → `GROQ_MODEL_FALLBACKS` → Groq
  `/models` discovery (skipping whisper/orpheus/prompt-guard/safeguard) →
  deterministic template (`buildReportContent`). Verified live with
  `openai/gpt-oss-120b`; `generatedBy` difféd for each path.
- Content cached on `Scan.report` — repeat downloads don't re-bill the LLM.

### 3.4 Auth / session fix — "Invalid or expired token" RESOLVED
- **Root cause**: web kept only the access token and never refreshed; 15-minute
  access TTL meant every request 401'd after 15 min. A second latent bug:
  `/auth/refresh` returned byte-identical tokens (no unique claim).
- **Fixes**: full session layer in `apps/web/src/lib/api.ts` (both tokens stored;
  proactive refresh near `exp`; reactive 401 refresh + single retry; single-flight;
  reuse already-rotated token; FormData report retry; clear + redirect to
  `/login` on unrecoverable 401). Server adds per-token `jti`
  (`apps/api/src/auth/auth.service.ts`) so refresh genuinely rotates.
- Verified live: `web_auth_test.mjs` **20/20**; `smoke_refresh.py` `rotated:True
  refresh:True`. Mobile already refreshed correctly.

### 3.5 Report image-decoder crash — RESOLVED (root cause + fix)
- **Root cause**: PDFKit decodes PNGs with `png-js`; `decodePixels` inflates the
  IDAT in an **async zlib callback that `throw`s on error** with no try/catch.
  One corrupt/unsupported RGBA/paletted/interlaced PNG **killed the whole API
  process** — after which every request (including the report download) failed.
- **Fix (2 layers)**:
  1. `apps/api/src/reports/image-safety.ts` — `pngPixelsInflate()` inflates the
     same IDAT bytes synchronously up front; bad images skip embedding and the
     PDF renders "(the uploaded image could not be embedded)" instead, so the
     **report still downloads**.
  2. `apps/api/src/main.ts` — narrow `uncaughtException` handler that logs and
     swallows image-decoder errors (`Z_DATA_ERROR` / `Z_BUF_ERROR` / png-js /
     jpeg-js) so a malformed upload can never take the server down.
- Regression test: `apps/api/test/image-safety.test.mjs` (5 tests, wired into
  `@carelens/api` test task).

### 3.6 GitHub — repo initialized & pushed
- Git found bundled with GitHub Desktop (`...\app-3.5.2\resources\app\git\`).
- `git init -b main`, `.gitignore` verified (no node_modules / dist / .env / *.db),
  initial commit `25f5939`, remote `origin` =
  `https://github.com/hashim0912/carelens_ai.git`, pushed via GitHub Desktop.
- Verified remote `main` head == local head (`25f59399e0...`).

### 3.7 Verification suites (last green run 2026-10-11)
| Suite | Result |
|---|---|
| `pnpm test` | **36/36** (ml 31 + api 5) |
| `pnpm typecheck` | **7/7** |
| `pnpm build` | **4/4** |
| `web_auth_test.mjs` (live) | **20/20** |
| `smoke_report_live.py` (live Groq) | **13/13** — `aiGenerated:true`,
  `generatedBy: openai/gpt-oss-120b`, cache reused |
| `report_crash_probe.py` (live) | corrupt RGBA PNGs → 200 PDF, **server stays
  up**; valid RGBA embeds |
| `pytest` (inference) | validation gate + anti-hardcode pass |

---

## 4. What is LEFT / known issues ⏳

1. **Rotate the Groq API key.** It was pasted in plaintext chat. Generate a new
   one in the Groq console and replace `GROQ_API_KEY` in `apps/api/.env`.
2. **Mobile report export (Phase 2)**: share/print via Expo (`expo-print` /
   `expo-sharing`). Needs server-side **image persistence** first.
3. **Server-side image persistence**: currently the client re-supplies the
   `File` per report request; past-scan history reports can't be re-downloaded
   with an embedded image. Blocking item 2 + scan history page.
4. **Docker/Compose unexercised** (no Docker locally). SQLite dev profile works;
   first `docker compose up` run is unvalidated (Postgres + container inference).
5. **Python version drift**: local dev on Python 3.14 vs container
   `python:3.12-slim` + `ai-edge-litert==2.3.0`. Keep the container as the
   source of truth; re-verify locally if Python is downgraded.
6. **`pnpm lint` has no tasks** — exits 0 with a warning. No lint coverage yet.
7. **Prisma engine DLL lock**: stop the running API process tree before
   `prisma generate` on Windows.
8. **Optional**: promote `web_auth_test.mjs` / `smoke_refresh.py` /
   `smoke_report_live.py` / `report_crash_probe.py` from the temp dir into the
   repo as durable live regression guards (they currently live in
   `C:\Users\13\AppData\Local\Temp\opencode\`).
9. **Saliency** exists (`saliency/gen_saliency.py` + montage PNGs) but is not
   wired into the app — candidate feature (Grad-CAM / occlusion overlay).

---

## 5. Engineering notes / gotchas

- **Rebuild packages before consuming apps**: after changing `@carelens/ml` or
  `@carelens/shared`, run their build (`.turbo` handles this in `pnpm build`,
  but the Nest watch process will surface type errors until `dist` is rebuilt).
- The Nest watch process + concurrent `nest build` can race on `dist/` — avoid
  running `pnpm build` while `pnpm --filter @carelens/api dev` is running.
- `@types/pdfkit` omits `openImage`; `pdf.ts` casts it.
- Report AI text is advisory only — it can never alter `label` / `confidence` /
  `scores`; the PDF always repeats the not-a-diagnosis disclaimer.
- Groq `openai/gpt-oss-120b` needs > ~40 tokens (reasoning counts).
- Background API instance: `pnpm --filter @carelens/api dev` with output
  teed to a log; live servers — inference :8001, API :3000, web :5173.

---

## 6. Secrets / hygiene

- `.gitignore` ignores `node_modules/`, `dist/`, `.env*` (keeps `.env.example`),
  `*.db*`, Python caches, logs. Verified the initial commit contains no
  `gsk_`/PAT/JWT values.
- Real credentials live only in `apps/api/.env` (local) or Compose env overrides.
- Never paste keys/tokens into chat (Groq key already leaked once — rotate it).