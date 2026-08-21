import { PROJECT_STATUSES } from "@/lib/enums";
import { projectInputSchema } from "@/lib/schemas";
import { blankColumnWarnings, zodIssues } from "../issues";
import type { ImportConfig, MappedRow, RowIssue } from "../types";

/**
 * The Projects import, expressed as configuration for the shared import
 * component.
 *
 * Unlike Clients, a project row points at other records: the client is named
 * in the file, not identified. Names are resolved against the clients and
 * exporters already on file, which is why this is a factory rather than a
 * constant — the caller supplies the lists, so the preview can say "no client
 * called Meridian Foods" while you are still looking at the file, rather than
 * failing at import time.
 */

export type NamedRecord = { id: string; name: string };

/** Case- and whitespace-insensitive, so "meridian foods " still matches. */
export function lookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function indexByName(records: NamedRecord[]): Map<string, NamedRecord> {
  const index = new Map<string, NamedRecord>();
  // First spelling wins, mirroring how the app treats duplicates elsewhere.
  for (const record of records) {
    const key = lookupKey(record.name);
    if (!index.has(key)) index.set(key, record);
  }
  return index;
}

/** The schema names the references by id; the CSV names them by name. */
export function projectCsvColumnFor(field: string): string {
  if (field === "clientId") return "clientName";
  if (field === "exporterId") return "exporterName";
  return field;
}

/**
 * A mapped CSV row in the shape `projectInputSchema` expects, with the named
 * references already resolved to ids. Shared by the preview and the server
 * action so the two can never disagree.
 */
export function projectRowInput(
  mapped: MappedRow,
  clientId: string | undefined,
  exporterId: string | undefined,
) {
  return {
    clientId: clientId ?? "",
    exporterId: exporterId ?? "",
    product: mapped.product ?? "",
    orderId: mapped.orderId ?? "",
    // Required numbers are passed as "" so the schema reports its own message
    // rather than a raw type error.
    quantity: mapped.quantity ?? "",
    unit: mapped.unit,
    orderValue: mapped.orderValue ?? "",
    commissionPercentage: mapped.commissionPercentage ?? "",
    currency: mapped.currency,
    status: mapped.status,
    orderDate: mapped.orderDate ?? "",
    expectedDelivery: mapped.expectedDelivery,
    actualDelivery: mapped.actualDelivery,
    notes: mapped.notes,
  };
}

export type ResolvedReferences = {
  clientId?: string;
  exporterId?: string;
  issues: RowIssue[];
};

/**
 * Turns the names in a row into ids. A name that matches nothing is an error
 * rather than a silently dropped reference — the row asked for that client.
 */
export function resolveReferences(
  mapped: MappedRow,
  clients: Map<string, NamedRecord>,
  exporters: Map<string, NamedRecord>,
): ResolvedReferences {
  const issues: RowIssue[] = [];
  let clientId: string | undefined;
  let exporterId: string | undefined;

  const clientName = mapped.clientName;
  if (clientName) {
    const match = clients.get(lookupKey(clientName));
    if (match) clientId = match.id;
    else {
      issues.push({
        field: "clientName",
        message: `No client called “${clientName}”. Add them on the Clients tab first, or correct the spelling.`,
      });
    }
  }

  const exporterName = mapped.exporterName;
  if (exporterName) {
    const match = exporters.get(lookupKey(exporterName));
    if (match) exporterId = match.id;
    else {
      issues.push({
        field: "exporterName",
        message: `No exporter called “${exporterName}”. Leave the column blank to import without one.`,
      });
    }
  }

  return { clientId, exporterId, issues };
}

const FIELDS: ImportConfig["fields"] = [
  {
    key: "orderId",
    label: "Order ID",
    required: true,
    aliases: ["order", "orderno", "ordernumber", "orderref", "reference", "ref", "invoiceno", "pono", "po"],
    example: "ORD-2026-0042",
    hint: "Must be unique across all projects.",
  },
  {
    key: "clientName",
    label: "Client",
    required: true,
    aliases: ["client", "buyer", "buyersname", "buyername", "customer", "customername", "party", "partyname"],
    example: "Meridian Foods Ltd",
    hint: "Must match a client already on file, by name.",
  },
  {
    key: "product",
    label: "Product",
    required: true,
    aliases: ["item", "goods", "commodity", "description", "productname"],
    example: "Basmati rice, 1121 steam",
  },
  {
    key: "quantity",
    label: "Quantity",
    required: true,
    aliases: ["qty", "quantum", "volume"],
    example: "1000",
  },
  {
    key: "unit",
    label: "Unit",
    aliases: ["uom", "units", "measure"],
    example: "kg",
    hint: "Defaults to pcs.",
  },
  {
    key: "orderValue",
    label: "Order value",
    required: true,
    aliases: ["value", "ordervalue", "amount", "totalvalue", "total", "consignmentvalue", "invoicevalue"],
    example: "2500000.00",
    hint: "The consignment total, not your commission.",
  },
  {
    key: "commissionPercentage",
    label: "Commission %",
    required: true,
    aliases: [
      "comm",
      "commission",
      "commpct",
      "commissionpct",
      "commissionpercent",
      "commrate",
      "rate",
      "percentage",
      "pct",
    ],
    example: "2.5",
    hint: "A number between 0 and 100. The amount is computed, never imported.",
  },
  {
    key: "currency",
    label: "Currency",
    aliases: ["ccy", "currencycode"],
    example: "INR",
    hint: "3-letter code. Defaults to INR.",
  },
  {
    key: "exporterName",
    label: "Exporter",
    aliases: ["exporter", "supplier", "suppliername", "vendor", "source"],
    example: "Konkan Marine Exports",
    hint: "Optional. Must match an exporter already on file.",
  },
  {
    key: "status",
    label: "Status",
    aliases: ["orderstatus", "stage"],
    example: "CONFIRMED",
    hint: `One of ${PROJECT_STATUSES.join(", ")}. Defaults to QUOTED.`,
  },
  {
    key: "orderDate",
    label: "Order date",
    required: true,
    aliases: ["date", "ordered", "orderedon", "orderdt", "podate", "invoicedate"],
    example: "2026-08-01",
    hint: "Format YYYY-MM-DD.",
  },
  {
    key: "expectedDelivery",
    label: "Expected delivery",
    aliases: ["expected", "eta", "deliverydate", "expecteddate", "shipby"],
    example: "2026-09-15",
  },
  {
    key: "actualDelivery",
    label: "Actual delivery",
    aliases: ["delivered", "deliveredon", "actual", "actualdate"],
    example: "",
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["comment", "comments", "remarks"],
    example: "Part shipment agreed.",
  },
];

/** Columns whose emptiness is not worth warning about on every row. */
const QUIET_WHEN_EMPTY = new Set(["unit", "currency", "status", "exporterName", "notes"]);

export function buildProjectImportConfig(
  clients: NamedRecord[],
  exporters: NamedRecord[],
): ImportConfig {
  const clientIndex = indexByName(clients);
  const exporterIndex = indexByName(exporters);

  return {
    entityLabel: "projects",
    fields: FIELDS,

    validateRow(mapped: MappedRow, mappedKeys: string[]) {
      const errors: RowIssue[] = [];
      const warnings: RowIssue[] = [];

      const references = resolveReferences(mapped, clientIndex, exporterIndex);
      errors.push(...references.issues);

      const parsed = projectInputSchema.safeParse(
        projectRowInput(mapped, references.clientId, references.exporterId),
      );

      if (!parsed.success) {
        // An unresolved name already has a better message than "required".
        const alreadyReported = errors.map((issue) => issue.field ?? "");
        errors.push(...zodIssues(parsed.error, projectCsvColumnFor, alreadyReported));
      }

      warnings.push(...blankColumnWarnings(mapped, mappedKeys, FIELDS, QUIET_WHEN_EMPTY));

      return { errors, warnings };
    },
  };
}
