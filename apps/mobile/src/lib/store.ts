import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "carelens.accessToken";
const REFRESH_KEY = "carelens.refreshToken";

export function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
