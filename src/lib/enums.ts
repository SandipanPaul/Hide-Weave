/**
 * Single source of truth for every status value in the app.
 *
 * These are plain string unions rather than Prisma enums on purpose: SQLite has
 * no native enum type, so using Prisma enums would make the eventual move to
 * Postgres a schema rewrite instead of a connection-string change. The DB stores
 * strings; Zod enforces the allowed set on the way in.
 */

export const CONTACT_KINDS = ["PHONE", "EMAIL"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/**
 * Where a client stands.
 *
 * CHASING is someone being pursued who has not ordered yet — the natural first
 * state for a name that arrived from a contact list. ACTIVE is a client
 * placing orders; INACTIVE is one who has stopped.
 */
export const CLIENT_STATUSES = ["CHASING", "ACTIVE", "INACTIVE"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const SAMPLING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type SamplingStatus = (typeof SAMPLING_STATUSES)[number];

export const PROJECT_STATUSES = [
  "QUOTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "SHIPPED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Statuses where the goods have landed, so commission is firmly owed. */
export const SETTLED_PROJECT_STATUSES: readonly ProjectStatus[] = ["DELIVERED", "CLOSED"];

/** Human-facing labels. Keep DB values machine-shaped, labels pretty. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  QUOTED: "Quoted",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In production",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const SAMPLING_STATUS_LABELS: Record<SamplingStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  CHASING: "Chasing",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

/**
 * "Open" work — what the Clients tab counts per client. Closed and cancelled
 * orders are finished business and are not open; everything else is live.
 */
export const OPEN_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "QUOTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "SHIPPED",
  "DELIVERED",
];

/**
 * What an expense was for. Offered as a picker, stored as a string, and
 * optional — a spend nobody has categorised is still a real spend, and
 * refusing to record it until it is filed correctly loses the number.
 */
export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "SAMPLES",
  "SHIPPING",
  "INSPECTION",
  "ENTERTAINMENT",
  "OFFICE",
  "FEES",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TRAVEL: "Travel",
  SAMPLES: "Samples",
  SHIPPING: "Shipping & courier",
  INSPECTION: "Inspection & testing",
  ENTERTAINMENT: "Client entertainment",
  OFFICE: "Office & admin",
  FEES: "Bank & statutory fees",
  OTHER: "Other",
};

/**
 * What one row of the ledger is.
 *
 * COMMISSION is a payment received against an order. RETAINER is a month a
 * client's retainer charged, derived from its schedule. EXPENSE is money out.
 * They are never added into one figure without saying so — a retainer is not
 * commission earned.
 */
export const LEDGER_KINDS = ["COMMISSION", "RETAINER", "EXPENSE"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  COMMISSION: "Commission",
  RETAINER: "Retainer",
  EXPENSE: "Expense",
};

/**
 * Where a bulk mailing stands.
 *
 * QUEUED is created but not started; SENDING is working through recipients;
 * COMPLETED means nothing is PENDING any more — which is not the same as
 * "everything arrived", since a campaign completes with failures in it. The
 * per-recipient counts, not the campaign status, say whether it went well.
 */
export const CAMPAIGN_STATUSES = ["QUEUED", "SENDING", "COMPLETED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  QUEUED: "Queued",
  SENDING: "Sending",
  COMPLETED: "Completed",
};

export const RECIPIENT_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  PENDING: "Pending",
  SENT: "Sent",
  FAILED: "Failed",
};

/**
 * What a supplier does for us.
 *
 * A list rather than one value: many Indian leather companies tan hides *and*
 * export finished goods, and a great many OEM factories also run private
 * label. Forcing a single label would make the record wrong about the half it
 * had to drop.
 */
export const SUPPLIER_TYPES = ["TANNERY", "EXPORTER", "OEM_FACTORY", "PRIVATE_LABEL"] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

export const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  TANNERY: "Tannery",
  EXPORTER: "Exporter",
  OEM_FACTORY: "OEM factory",
  PRIVATE_LABEL: "Private label",
};

/** What each one means, for the form — these are not obvious to everyone. */
export const SUPPLIER_TYPE_HINTS: Record<SupplierType, string> = {
  TANNERY: "Tans hides into leather",
  EXPORTER: "Ships finished goods abroad",
  OEM_FACTORY: "Makes to a client's own design",
  PRIVATE_LABEL: "Makes goods sold under the client's brand",
};

/** Stored as a comma-separated string; read back as a checked list. */
export function parseSupplierTypes(value: string | null | undefined): SupplierType[] {
  const wanted = new Set((value ?? "").split(",").map((part) => part.trim()));
  // Filtered against the known list, in its order, so a stale value from an
  // older version of the app cannot reach the UI and the badges always read
  // in the same sequence.
  return SUPPLIER_TYPES.filter((type) => wanted.has(type));
}
