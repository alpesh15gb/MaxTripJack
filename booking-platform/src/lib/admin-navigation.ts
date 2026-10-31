export const adminDesks = [
  "bookings",
  "companies",
  "pricing",
  "cancellations",
  "payments",
  "refunds",
  "sync",
  "audit",
] as const;

export const adminDeskPermissions = {
  bookings: "bookings:read",
  companies: "companies:manage",
  pricing: "pricing:manage",
  cancellations: "cancellations:manage",
  payments: "finance:read",
  refunds: "refunds:manage",
  sync: "integrations:manage",
  audit: "audit:read",
} as const;
