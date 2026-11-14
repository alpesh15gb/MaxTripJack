export type CustomerIdentity = {
  email?: string | null;
  emailVerified?: boolean | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
};

/** Internal aliases satisfy the auth schema; they are never email identities. */
export function isInternalPhoneEmail(email?: string | null) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith("@phone.maxtravel.invalid");
}

export function customerEmail(user?: Pick<CustomerIdentity, "email"> | null) {
  return typeof user?.email === "string" && !isInternalPhoneEmail(user.email) ? user.email.trim() : "";
}

/** Indian mobile shorthand or an explicitly supplied international E.164 number. */
export function normalizeWhatsAppPhone(input: string): string | null {
  if (typeof input !== "string" || input.length > 40 || !/^[+\d ()-]+$/.test(input)) return null;
  const value = input.replace(/[ ()-]/g, "");
  if (/^[6-9]\d{9}$/.test(value)) return `+91${value}`;
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return null;
  if (value.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(value)) return null;
  return value;
}

export function hasVerifiedCustomerIdentity(user?: CustomerIdentity | null) {
  return Boolean(user && ((user.emailVerified === true && customerEmail(user)) ||
    (user.phoneNumberVerified === true && typeof user.phoneNumber === "string" && normalizeWhatsAppPhone(user.phoneNumber) === user.phoneNumber)));
}
