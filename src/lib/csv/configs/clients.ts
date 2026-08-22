import { clientInputSchema, dateStringSchema } from "@/lib/schemas";
import { blankColumnWarnings, zodIssues } from "../issues";
import type { ImportConfig, MappedRow, RowIssue } from "../types";

/**
 * A mapped CSV row in the shape `clientInputSchema` expects. Shared by the
 * preview and the server action, so the two can never drift: whatever the
 * preview judged is exactly what the import re-validates.
 */
export function clientRowInput(mapped: MappedRow) {
  return {
    // Required text is passed as "" rather than undefined so the schema
    // reports "Name is required." instead of a raw type error.
    name: mapped.name ?? "",
    address: mapped.address,
    country: mapped.country,
    // One CSV column may hold several values; the schema splits them.
    phones: mapped.phone,
    emails: mapped.email,
    website: mapped.website,
    contactPerson: mapped.contactPerson,
    status: mapped.status,
    fixedMonthly: mapped.fixedMonthly,
    currency: mapped.currency,
    notes: mapped.notes,
  };
}

/** The schema names the contact lists in the plural; the CSV columns don't. */
export function csvColumnFor(field: string): string {
  return field === "phones" ? "phone" : field === "emails" ? "email" : field;
}

/** Columns whose own problems are already reported as errors. */
const QUIET_WHEN_EMPTY = new Set(["name", "phone", "email"]);

/**
 * The Clients import, expressed as configuration for the shared import
 * component. Validation delegates to the same Zod schema the manual add form
 * and the server action use, so the preview can never disagree with the import.
 */
export const CLIENT_IMPORT_CONFIG: ImportConfig = {
  entityLabel: "clients",

  fields: [
    {
      key: "name",
      label: "Name",
      required: true,
      aliases: [
        "client",
        "clientname",
        "company",
        "companyname",
        "buyer",
        "buyers",
        "buyersname",
        "buyername",
        "customer",
        "customername",
        "party",
        "partyname",
        "firm",
        "firmname",
      ],
      example: "Meridian Foods Ltd",
    },
    {
      key: "phone",
      label: "Phone",
      aliases: [
        "phonenumber",
        "phoneno",
        "mobile",
        "mobileno",
        "mobilenumber",
        "tel",
        "telno",
        "telephone",
        "contactnumber",
        "contactno",
        "contactnos",
        "contact",
        "cell",
        "whatsapp",
      ],
      example: "+44 20 7946 0000",
      hint: "Phone or email is required. Several are fine — separate with / ; , or \\",
    },
    {
      key: "email",
      label: "Email",
      aliases: ["emailaddress", "emailid", "emailids", "mail", "mailid", "mailids", "contactemail"],
      example: "orders@meridianfoods.example.com",
      hint: "Several are fine. “(at)” is read as “@”.",
    },
    {
      key: "contactPerson",
      label: "Contact person",
      aliases: ["contactname", "contactperson", "person", "attn", "attention", "poc"],
      example: "Tom Whitfield",
    },
    {
      key: "address",
      label: "Address",
      aliases: ["location", "city", "billingaddress"],
      example: "12 Dock Road, London",
    },
    {
      key: "country",
      label: "Country",
      aliases: ["countrycode", "nation", "ctry", "countryname"],
      example: "United Kingdom",
      hint: "Name or 2-letter code. “USA” and “UK” are understood.",
    },
    {
      key: "website",
      label: "Website",
      aliases: ["url", "site", "web"],
      example: "https://meridianfoods.example.com",
    },
    {
      key: "status",
      label: "Status",
      aliases: ["active"],
      example: "ACTIVE",
      hint: "CHASING, ACTIVE or INACTIVE. Defaults to ACTIVE.",
    },
    {
      key: "fixedMonthly",
      label: "Monthly retainer",
      aliases: ["retainer", "monthlyfee", "fixedmonthly", "monthly"],
      example: "25000.00",
    },
    {
      key: "currency",
      label: "Currency",
      aliases: ["ccy", "currencycode"],
      example: "INR",
      hint: "3-letter code for the retainer. Defaults to INR.",
    },
    {
      key: "notes",
      label: "Notes",
      aliases: ["comment", "comments", "remarks"],
      example: "Prefers consolidated monthly invoicing.",
    },
    {
      key: "samplingDate",
      label: "Sampling date",
      aliases: ["sampling", "sampledate", "sampleon", "nextsampling"],
      example: "2026-09-15",
      hint: "Optional. Creates one scheduled sampling for the client.",
    },
  ],

  validateRow(mapped: MappedRow, mappedKeys: string[]) {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];

    const parsed = clientInputSchema.safeParse(clientRowInput(mapped));

    if (!parsed.success) errors.push(...zodIssues(parsed.error, csvColumnFor));

    // The sampling date is optional, but a malformed one is an error rather
    // than a silent skip: the row asked for a sampling, and dropping it
    // quietly would lose data the user expected to import.
    if (mapped.samplingDate !== undefined) {
      const date = dateStringSchema.safeParse(mapped.samplingDate);
      if (!date.success) {
        errors.push({
          field: "samplingDate",
          message: date.error.issues[0]?.message ?? "Use the format YYYY-MM-DD.",
        });
      }
    }

    // Name, phone and email already report their own problems as errors.
    warnings.push(
      ...blankColumnWarnings(mapped, mappedKeys, CLIENT_IMPORT_CONFIG.fields, QUIET_WHEN_EMPTY),
    );

    return { errors, warnings };
  },
};
