import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { twoFactorClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
export const API_URL=(process.env.EXPO_PUBLIC_API_URL||"http://127.0.0.1:3000").replace(/\/$/,"");
if(!__DEV__&&!API_URL.startsWith("https://"))throw new Error("Release builds require an HTTPS API URL.");
export const authClient=createAuthClient({baseURL:API_URL,plugins:[expoClient({scheme:"maxtravel",storagePrefix:"maxtravel",storage:SecureStore}),twoFactorClient()]});
export async function api<T>(path:string,data?:unknown,method?:string):Promise<T>{const cookie=await authClient.getCookie();const response=await fetch(API_URL+path,{method:method||(data===undefined?"GET":"POST"),headers:{"Content-Type":"application/json",Origin:new URL(API_URL).origin,...(cookie?{Cookie:cookie}:{})},credentials:"omit",body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||"Unable to complete this request.");return result;}
