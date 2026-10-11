import { apiPaths } from "@carelens/shared";
import type {
  AuthResponse,
  CreatePatientInput,
  CreateUserInput,
  Patient,
  Prediction,
  Scan,
  User,
} from "@carelens/shared";
import { API_URL } from "./config";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./store";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}${apiPaths.refresh}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    await clearTokens();
    return false;
  }
  const data = (await res.json()) as AuthResponse;
  await saveTokens(data.accessToken, data.refreshToken);
  return true;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry && (await tryRefresh())) {
    return request<T>(path, init, false);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = body?.message
      ? Array.isArray(body.message)
        ? body.message.join(", ")
        : body.message
      : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const api = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>(apiPaths.login, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await saveTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async register(name: string, email: string, password: string) {
    const data = await request<AuthResponse>(apiPaths.register, {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    await saveTokens(data.accessToken, data.refreshToken);
    return data;
  },

  logout() {
    return clearTokens();
  },

  listUsers() {
    return request<{ users: User[] }>(apiPaths.users);
  },

  createUser(input: CreateUserInput) {
    return request<User>(apiPaths.users, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listScans() {
    return request<{ scans: Scan[]; counts: { total: number; completed: number; failed: number } }>(
      apiPaths.scans,
    );
  },

  createScan(modelId: string, clinicalContext?: Record<string, unknown>) {
    return request<Scan>(apiPaths.scans, {
      method: "POST",
      body: JSON.stringify({ modelId, clinicalContext }),
    });
  },

  submitResult(
    scanId: string,
    result: {
      modelId: string;
      label: string;
      confidence: number;
      scores: { label: string; confidence: number }[];
    },
  ) {
    return request<Prediction>(`/scans/${scanId}/result`, {
      method: "POST",
      body: JSON.stringify(result),
    });
  },

  listPatients() {
    return request<{ patients: Patient[] }>(apiPaths.patients);
  },

  createPatient(input: CreatePatientInput) {
    return request<Patient>(apiPaths.patients, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
