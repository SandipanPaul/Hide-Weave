"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findExporterNameConflict, findWebsiteConflict } from "@/lib/exporters/queries";
import { notDeleted, prisma } from "@/lib/db";
import {
  exporterInputSchema,
  failure,
  invalid,
  type ActionResult,
} from "@/lib/schemas";

/**
 * Every action re-validates with the shared Zod schemas. Client-side
 * validation is a convenience; this is the trust boundary.
 */

function revalidateExporters(id?: string) {
  revalidatePath("/exporters");
  if (id) revalidatePath(`/exporters/${id}`);
  // An exporter's name appears on every project it supplies.
  revalidatePath("/projects");
}

function exporterFormValues(formData: FormData) {
  return {
    companyName: formData.get("companyName"),
    website: formData.get("website"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    sourceUrl: formData.get("sourceUrl"),
    notes: formData.get("notes"),
  };
}

/**
 * Two exporters with the same name or the same website are the same supplier
 * recorded twice. Both are checked app-side, scoped to non-deleted rows.
 */
async function checkConflicts(
  companyName: string,
  website: string | undefined,
  excludeId?: string,
): Promise<ActionResult<never> | null> {
  const byName = await findExporterNameConflict(companyName, excludeId);
  if (byName) return failure("An exporter with this name already exists.", "companyName");

  const byWebsite = await findWebsiteConflict(website, excludeId);
  if (byWebsite) {
    return failure(`${byWebsite.companyName} already uses this website.`, "website");
  }
  return null;
}

export async function createExporter(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = exporterInputSchema.safeParse(exporterFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const conflict = await checkConflicts(parsed.data.companyName, parsed.data.website);
  if (conflict) return conflict;

  try {
    const exporter = await prisma.exporter.create({ data: parsed.data });
    revalidateExporters(exporter.id);
    return { ok: true, data: { id: exporter.id } };
  } catch {
    return failure("Could not save this exporter. Please try again.");
  }
}

export async function updateExporter(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = exporterInputSchema.safeParse(exporterFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.exporter.findFirst({
    where: { id, ...notDeleted },
    select: { id: true },
  });
  if (!existing) return failure("This exporter no longer exists.");

  const conflict = await checkConflicts(parsed.data.companyName, parsed.data.website, id);
  if (conflict) return conflict;

  try {
    await prisma.exporter.update({ where: { id }, data: parsed.data });
    revalidateExporters(id);
    return { ok: true, data: { id } };
  } catch {
    return failure("Could not save your changes. Please try again.");
  }
}

/**
 * Soft-deletes an exporter.
 *
 * Projects sourced through them are kept and simply lose the reference — an
 * order that happened still happened, and deleting its supply-side record must
 * not remove it from any commission total.
 */
export async function deleteExporter(id: string): Promise<ActionResult> {
  const exporter = await prisma.exporter.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, _count: { select: { projects: { where: notDeleted } } } },
  });
  if (!exporter) return failure("This exporter no longer exists.");

  await prisma.$transaction([
    prisma.project.updateMany({ where: { exporterId: id, ...notDeleted }, data: { exporterId: null } }),
    prisma.exporter.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);

  revalidateExporters();
  redirect("/exporters");
}
