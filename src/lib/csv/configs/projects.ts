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
  exporters: Array<{ exporterId: string; quantity: number }>,
) {
  return {
    clientId: clientId ?? "",
    exporters,
    product: mapped.product ?? "",
    clientReference: mapped.clientReference,
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
  exporters: Array<{ exporterId: string; quantity: number }>;
  issues: RowIssue[];
};

/**
 * One exporter's entry in the Exporter column: a name, optionally followed by
 * how much of the order they are making.
 *
 *   Konkan Marine Exports              the whole order
 *   Konkan Marine: 2000; Gujarat: 3000 a split
 *
 * Semicolons and newlines separate entries. Commas do not — company names are
 * full of them ("Kutch Salt & Minerals, Bhuj").
 */
function splitExporterCell(raw: string): Array<{ name: string; quantity?: string }> {
  return raw
    .split(/[;\r\n]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      // Split on the last colon, so "Acme Ltd: 500" works and a name
      // containing a colon still resolves.
      const at = part.lastIndexOf(":");
      if (at === -1) return { name: part };
      return { name: part.slice(0, at).trim(), quantity: part.slice(at + 1).trim() };
    });
}

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

  const clientName = mapped.clientName;
  if (clientName) {
    const match = clients.get(lookupKey(clientName));
    if (match) clientId = match.id;
    else {
      issues.push({
        field: "clientName",
        message: `No client called \u201C${clientName}\u201D. Add them on the Clients tab first, or correct the spelling.`,
      });
    }
  }

  const allocations: Array<{ exporterId: string; quantity: number }> = [];
  const entries = mapped.exporterName ? splitExporterCell(mapped.exporterName) : [];

  for (const entry of entries) {
    const match = exporters.get(lookupKey(entry.name));
    if (!match) {
      issues.push({
        field: "exporterName",
        message: `No exporter called \u201C${entry.name}\u201D. Leave the column blank to import without one.`,
      });
      continue;
    }

    let quantity: number;
    if (entry.quantity === undefined) {
      // A bare name means they are making all of it — which only makes sense
      // when they are the only one named.
      if (entries.length > 1) {
        issues.push({
          field: "exporterName",
          message: `Give ${entry.name} a quantity, e.g. \u201C${entry.name}: 2000\u201D — the order is split between several exporters.`,
        });
        continue;
      }
      quantity = Number(mapped.quantity ?? 0);
    } else {
      quantity = Number(entry.quantity.replace(/[,\s]/g, ""));
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      issues.push({
        field: "exporterName",
        message: `\u201C${entry.quantity ?? ""}\u201D is not a quantity for ${entry.name}.`,
      });
      continue;
    }

    allocations.push({ exporterId: match.id, quantity });
  }

  return { clientId, exporters: allocations, issues };
}

const FIELDS: ImportConfig["fields"] = [
  {
    key: "orderId",
    label: "Order ID",
    // Optional, and never written: the app issues order references. A value
    // here only says "this row is that existing order", which is what makes an
    // exported file editable and re-importable. Blank means a new order.
    required: false,
    // Only aliases for *our* reference. Anything that names the client's
    // number — "PO", "reference" — now maps to Client reference instead, which
    // is where such a value actually belongs.
    aliases: ["order", "orderno", "ordernumber", "orderid", "orderref"],
    example: "ORD00000042",
    hint: "Leave blank for a new order — the app issues the reference. Fill it in to update an existing one.",
  },
  {
    key: "clientReference",
    label: "Client reference",
    required: false,
    aliases: ["clientref", "clientreference", "customerref", "po", "pono", "ponumber",
              "purchaseorder", "reference", "ref", "invoiceno", "buyerref"],
    example: "4500123",
    hint: "The client's own PO number, in their format. Stored as given and searchable.",
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
    hint: "Optional. A name, or a split: \u201CAcme: 2000; Best Ltd: 3000\u201D.",
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
        projectRowInput(mapped, references.clientId, references.exporters),
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
