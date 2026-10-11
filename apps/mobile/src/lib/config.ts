import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrl?: string;
  inferenceUrl?: string;
};

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  extra.apiUrl ??
  "http://10.0.2.2:3000/api";

export const INFERENCE_URL =
  process.env.EXPO_PUBLIC_INFERENCE_URL ??
  extra.inferenceUrl ??
  "http://10.0.2.2:8001";
