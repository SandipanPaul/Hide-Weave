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

export const CLIENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
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

/** Statuses whose order value and commission count toward business totals. */
export const ACTIVE_PROJECT_STATUSES = PROJECT_STATUSES.filter(
  (s) => s !== "CANCELLED",
) as readonly ProjectStatus[];

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
