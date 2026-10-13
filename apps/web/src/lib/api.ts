// Derive service hosts from the page host so the app also works when opened
// from another device (e.g. a phone) on the same network, instead of always
// pointing at the viewer's own localhost.
const HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";

export const API_URL =
  import.meta.env.VITE_API_URL ?? `http://${HOST}:3000/api`;

export const INFERENCE_URL =
  import.meta.env.VITE_INFERENCE_URL ?? `http://${HOST}:8001`;

import { apiPaths } from "@carelens/shared";
import type {
  AuthResponse,
  ImageValidation,
  InferenceRejection,
} from "@carelens/shared";

export type { ImageValidation, InferenceRejection };

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Thrown when the inference service rejects an image (HTTP 422): the image is
 * not a medical scan, or it belongs to a different body-part domain than the
 * selected model. Carries the structured rejection so the UI can explain it.
 */
export class RejectedInferenceError extends Error {
  constructor(public rejection: InferenceRejection) {
    super(rejection.message);
    this.name = "RejectedInferenceError";
  }
}

// ---------------------------------------------------------------------------
// Token storage
//
// Both the access token (15m) and the refresh token (7d) are persisted. The
// access token is refreshed transparently (see `authedFetch`) so a session
// outlives the short access TTL instead of every request failing with
// "Invalid or expired token" once the access token ages out.
// ---------------------------------------------------------------------------

const ACCESS_KEY = "carelens.accessToken";
const REFRESH_KEY = "carelens.refreshToken";
const hasStorage = typeof localStorage !== "undefined";

function readLocal(key: string): string | null {
  return hasStorage ? localStorage.getItem(key) : null;
}

function writeLocal(key: string, value: string | null) {
  if (!hasStorage) return;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

let accessToken: string | null = readLocal(ACCESS_KEY);
let refreshToken: string | null = readLocal(REFRESH_KEY);

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  writeLocal(ACCESS_KEY, access);
  writeLocal(REFRESH_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  writeLocal(ACCESS_KEY, null);
  writeLocal(REFRESH_KEY, null);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export interface AccessTokenPayload {
  sub?: string;
  email?: string;
  role?: string;
}

/**
 * Decodes the (unverified) access-token payload so the UI can show the signed-in
 * user's identity and role. Never used for authorization — the API re-verifies
 * every request.
 */
export function getAccessTokenPayload(): AccessTokenPayload | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  const segment = parts[1];
  if (parts.length !== 3 || !segment) return null;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as AccessTokenPayload;
  } catch {
    return null;
  }
}

/** Logged in if we hold either token (an expired access token can be refreshed). */
export function isAuthenticated(): boolean {
  return Boolean(accessToken || refreshToken);
}

// ---------------------------------------------------------------------------
// Single-flight refresh + proactive expiry check
// ---------------------------------------------------------------------------

/** Decodes a JWT's `exp` (ms) without verifying it; null when unavailable. */
function jwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  const segment = parts[1];
  if (parts.length !== 3 || !segment) return null;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True when there is no usable access token, or it expires within `skewMs`.
 * When the expiry cannot be read we optimistically proceed and rely on the
 * 401 retry below.
 */
function accessTokenExpiring(skewMs = 60_000): boolean {
  if (!accessToken) return true;
  const exp = jwtExpiryMs(accessToken);
  if (exp == null) return false;
  return Date.now() >= exp - skewMs;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh token for a new pair. Concurrent callers share one
 * in-flight request. Resolves false (and clears the session) on failure.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const token = refreshToken;
  if (!token) return Promise.resolve(false);

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}${apiPaths.refresh}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = (await res.json()) as AuthResponse;
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      // Network error: keep the tokens so a later request can retry.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Session is unrecoverable: drop tokens and send the user to the login page. */
function handleUnauthorized() {
  clearTokens();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

interface AuthedFetchOptions {
  /** Attach the bearer token and auto-refresh on 401. Default true. */
  auth?: boolean;
  /** Retry once after a successful refresh. Default true. */
  retryOn401?: boolean;
}

/**
 * `fetch` wrapper for the API that keeps the access token fresh: it refreshes
 * proactively when the token is near expiry, and reactively on a 401 before
 * retrying the original request once. An unrecoverable 401 clears the session.
 */
async function authedFetch(
  path: string,
  init: RequestInit = {},
  opts: AuthedFetchOptions = {},
): Promise<Response> {
  const { auth = true, retryOn401 = true } = opts;

  if (auth && accessTokenExpiring()) {
    await refreshSession();
  }

  const buildInit = (): RequestInit => {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    return { ...init, headers };
  };

  const tokenUsed = accessToken;
  let res = await fetch(`${API_URL}${path}`, buildInit());

  if (res.status === 401 && auth && retryOn401) {
    // Only refresh if nobody else already rotated the token while this request
    // was in flight; otherwise reuse the fresh one and just retry.
    if (accessToken === tokenUsed) await refreshSession();
    if (accessToken !== tokenUsed) {
      res = await fetch(`${API_URL}${path}`, buildInit());
    }
  }

  if (res.status === 401 && auth) handleUnauthorized();

  return res;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: AuthedFetchOptions = {},
): Promise<T> {
  const res = await authedFetch(path, init, opts);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message)
        ? body.message.join(", ")
        : (body.message ?? message);
    } catch {
      /* keep status text */
    }
    throw new ApiClientError(String(message), res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Logs in and persists the returned access + refresh token pair. */
export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>(
    apiPaths.login,
    { method: "POST", body: JSON.stringify({ email, password }) },
    { auth: false, retryOn401: false },
  );
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export interface InferenceResult {
  status: "COMPLETED";
  model: string;
  model_domain?: "chest" | "brain";
  label: string;
  confidence: number;
  scores: Array<{ label: string; confidence: number }>;
  input_shape: number[];
  input_dtype: string;
  preprocessing?: string;
  accuracy?: string;
  status_badge?: string;
  disclaimer?: string;
  input_analysis?: ImageValidation;
  low_confidence_domain?: boolean;
  saliency_base64?: string;
  saliency_top_class?: string;
  saliency_error?: string;
}

export async function inferencePredict(
  file: File,
  modelId: string,
  generateSaliency = true,
  signal?: AbortSignal,
): Promise<InferenceResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("model_id", modelId);
  body.append("generate_saliency", generateSaliency.toString());
  const res = await fetch(`${INFERENCE_URL}/predict`, {
    method: "POST",
    body,
    signal,
  });
  if (!res.ok) {
    if (res.status === 422) {
      let payload: InferenceRejection | null = null;
      try {
        payload = (await res.json()) as InferenceRejection;
      } catch {
        payload = null;
      }
      if (payload && payload.status === "REJECTED") {
        throw new RejectedInferenceError(payload);
      }
    }
    throw new ApiClientError(`Inference failed: ${res.status}`, res.status);
  }
  return (await res.json()) as InferenceResult;
}

// ---------------------------------------------------------------------------
// Scan persistence (API service)
// ---------------------------------------------------------------------------

export interface CreatedScan {
  id: string;
  modelId: string;
  status: string;
  clinicalContext?: Record<string, unknown> | null;
  createdAt: string;
}

export function createScan(
  modelId: string,
  clinicalContext?: Record<string, unknown>,
): Promise<CreatedScan> {
  return apiFetch<CreatedScan>(apiPaths.scans, {
    method: "POST",
    body: JSON.stringify({ modelId, clinicalContext }),
  });
}

export function submitScanResult(
  scanId: string,
  result: {
    modelId: string;
    label: string;
    confidence: number;
    scores: { label: string; confidence: number }[];
  },
): Promise<unknown> {
  return apiFetch(`/scans/${scanId}/result`, {
    method: "POST",
    body: JSON.stringify(result),
  });
}

// ---------------------------------------------------------------------------
// Downloadable report (API service + Groq)
// ---------------------------------------------------------------------------

export interface ReportPayload {
  modelId: string;
  label: string;
  confidence: number;
  scores: { label: string; confidence: number }[];
  accuracy?: string;
  inputShape?: number[];
  inputDtype?: string;
  preprocessing?: string;
  clinicalContext?: Record<string, unknown> | null;
  scanId?: string;
  lowConfidenceDomain?: boolean;
}

/**
 * Requests a server-rendered PDF report (image + prediction + clinical
 * context + AI recommendations) and returns the file as a Blob. The report
 * content is cached on the scan, so re-downloads are stable. Uses the same
 * token-refresh handling as `apiFetch`.
 */
export async function downloadReportPdf(
  file: File,
  payload: ReportPayload,
): Promise<{ blob: Blob; filename: string }> {
  const body = new FormData();
  body.append("file", file);
  body.append("report", JSON.stringify(payload));

  const res = await authedFetch(apiPaths.reports, { method: "POST", body });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const errorBody = (await res.json()) as { message?: string };
      message = errorBody.message ?? message;
    } catch {
      /* keep status text */
    }
    throw new ApiClientError(String(message), res.status);
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), filename: match?.[1] ?? "carelens-report.pdf" };
}

/** Triggers a browser download for an in-memory Blob. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
