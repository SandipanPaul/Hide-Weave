"use server";

import { revalidatePath } from "next/cache";
import { extractFromWebsite } from "@/lib/extraction";
import { notDeleted, prisma } from "@/lib/db";
import { exporterInputSchema, formatZodError, type ActionResult } from "@/lib/schemas";
import { findExporterNameConflict, findWebsiteConflict } from "@/lib/exporters/queries";

/**
 * Website extraction, as the browser sees it.
 *
 * The fetch happens here, on the server: the browser never requests the site
 * itself, so the timeout, redirect limit, size cap, robots.txt check and
 * address filtering cannot be bypassed by the page being read.
 *
 * Nothing is written to the database. The result lands in a form.
 */

export type ExtractedValues = {
  companyName: string;
  website: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  sourceUrl: string;
};

/** One thing the page gave up, in words the user can judge. */
export type PickedField = {
  field: string;
  label: string;
  value: string;
  /** Where it came from, e.g. "a mailto: link". */
  from: string;
};

export type ExtractionResult =
  | {
      ok: true;
      values: ExtractedValues;
      /** Which fields were guessed rather than typed. */
      autoFilled: string[];
      /** Everything found, with its source, so the user can check each one. */
      picked: PickedField[];
      finalUrl: string;
      alsoRead: string | null;
      /** An existing exporter already using this site, if there is one. */
      existing: { id: string; companyName: string } | null;
    }
  | { ok: false; message: string };

/** Plain English for where a value came from. */
const SOURCE_LABELS: Record<string, string> = {
  "json-ld": "the site's structured data",
  meta: "the page's metadata",
  link: "a link on the page",
  text: "the page text",
  title: "the page title",
};

const FIELD_LABELS: Record<string, string> = {
  companyName: "Company name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  notes: "Notes",
};

export async function extractExporter(rawUrl: string): Promise<ExtractionResult> {
  const outcome = await extractFromWebsite(rawUrl);
  if (!outcome.ok) return { ok: false, message: outcome.message };

  const { fields } = outcome;
  const values: ExtractedValues = {
    companyName: fields.companyName?.value ?? "",
    website: outcome.url,
    contactPerson: "",
    email: fields.email?.value ?? "",
    phone: fields.phone?.value ?? "",
    address: fields.address?.value ?? "",
    // The site's own description is a starting point for notes, never a fact
    // about the business.
    notes: fields.description?.value ?? "",
    sourceUrl: outcome.url,
  };

  // Whatever the page gave up goes into the form, however it was found — a
  // guess the user can correct beats an empty field they have to research.
  const picked: PickedField[] = [];
  const record = (field: keyof ExtractedValues, source: string | undefined) => {
    if (values[field] === "" || !source) return;
    picked.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      value: values[field],
      from: SOURCE_LABELS[source] ?? source,
    });
  };

  record("companyName", fields.companyName?.source);
  record("email", fields.email?.source);
  record("phone", fields.phone?.source);
  record("address", fields.address?.source);
  record("notes", fields.description?.source);

  return {
    ok: true,
    values,
    autoFilled: picked.map((item) => item.field),
    picked,
    finalUrl: outcome.finalUrl,
    alsoRead: outcome.alsoRead,
    existing: await findWebsiteConflict(outcome.url),
  };
}

/**
 * Applies re-extracted values to an existing exporter, after the user has seen
 * the diff and chosen what to accept.
 *
 * Validated with the same schema as every other write — the values passed in
 * came from a web page, which is the least trustworthy source in the app.
 */
export async function applyExtractedFields(
  id: string,
  values: Record<string, string>,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.exporter.findFirst({
    where: { id, ...notDeleted },
    select: {
      companyName: true,
      website: true,
      contactPerson: true,
      email: true,
      phone: true,
      address: true,
      sourceUrl: true,
      notes: true,
    },
  });
  if (!existing) {
    return { ok: false, formErrors: ["This exporter no longer exists."], fieldErrors: {} };
  }

  // Only the accepted fields change; everything else keeps what it had.
  const merged = {
    companyName: values.companyName ?? existing.companyName,
    website: values.website ?? existing.website,
    contactPerson: values.contactPerson ?? existing.contactPerson,
    email: values.email ?? existing.email,
    phone: values.phone ?? existing.phone,
    address: values.address ?? existing.address,
    sourceUrl: values.sourceUrl ?? existing.sourceUrl,
    notes: values.notes ?? existing.notes,
  };

  const parsed = exporterInputSchema.safeParse(merged);
  if (!parsed.success) {
    const { formErrors, fieldErrors } = formatZodError(parsed.error);
    return { ok: false, formErrors, fieldErrors };
  }

  const nameConflict = await findExporterNameConflict(parsed.data.companyName, id);
  if (nameConflict) {
    return {
      ok: false,
      formErrors: [],
      fieldErrors: { companyName: ["An exporter with this name already exists."] },
    };
  }

  await prisma.exporter.update({ where: { id }, data: parsed.data });
  revalidatePath("/exporters");
  revalidatePath(`/exporters/${id}`);
  return { ok: true, data: { id } };
}
