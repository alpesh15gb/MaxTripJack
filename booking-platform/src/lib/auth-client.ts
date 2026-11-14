"use client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient, phoneNumberClient, twoFactorClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({ plugins: [emailOTPClient(), phoneNumberClient(), twoFactorClient()] });
