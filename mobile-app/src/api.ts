import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { twoFactorClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { checkedApiOrigin, requestJson } from "./api-transport";

export const API_URL = checkedApiOrigin(process.env.EXPO_PUBLIC_API_URL, __DEV__);
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { timeout: 45_000 },
  plugins: [expoClient({ scheme: "maxtravel", storagePrefix: "maxtravel", storage: SecureStore, disableCache: true }), twoFactorClient()],
});

export async function api<T>(path: string, data?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  if (!path.startsWith("/api/")) throw Error("Invalid API path.");
  const cookie = await authClient.getCookie();
  return requestJson<T>(API_URL + path, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers: {
      Accept: "application/json",
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: API_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    credentials: "omit",
    body: data === undefined ? undefined : JSON.stringify(data),
  }, signal);
}
