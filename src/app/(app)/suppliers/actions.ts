"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findSupplierNameConflict, findWebsiteConflict } from "@/lib/suppliers/queries";
import { notDeleted, prisma } from "@/lib/db";
import {
  supplierInputSchema,
  failure,
  invalid,
  type ActionResult,
} from "@/lib/schemas";

/**
 * Every action re-validates with the shared Zod schemas. Client-side
 * validation is a convenience; this is the trust boundary.
 */

function revalidateSuppliers(id?: string) {
  revalidatePath("/suppliers");
  if (id) revalidatePath(`/suppliers/${id}`);
  // A supplier's name appears on every project it supplies.
  revalidatePath("/projects");
}

function supplierFormValues(formData: FormData) {
  return {
    companyName: formData.get("companyName"),
    // getAll: the form renders one checkbox per type, all sharing this name,
    // and a supplier is commonly more than one thing.
    types: formData.getAll("types"),
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
 * Two suppliers with the same name or the same website are the same supplier
 * recorded twice. Both are checked app-side, scoped to non-deleted rows.
 */
async function checkConflicts(
  companyName: string,
  website: string | undefined,
  excludeId?: string,
): Promise<ActionResult<never> | null> {
  const byName = await findSupplierNameConflict(companyName, excludeId);
  if (byName) return failure("A supplier with this name already exists.", "companyName");

  const byWebsite = await findWebsiteConflict(website, excludeId);
  if (byWebsite) {
    return failure(`${byWebsite.companyName} already uses this website.`, "website");
  }
  return null;
}

export async function createSupplier(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierInputSchema.safeParse(supplierFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const conflict = await checkConflicts(parsed.data.companyName, parsed.data.website);
  if (conflict) return conflict;

  try {
    const supplier = await prisma.supplier.create({ data: parsed.data });
    revalidateSuppliers(supplier.id);
    return { ok: true, data: { id: supplier.id } };
  } catch {
    return failure("Could not save this supplier. Please try again.");
  }
}

export async function updateSupplier(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierInputSchema.safeParse(supplierFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.supplier.findFirst({
    where: { id, ...notDeleted },
    select: { id: true },
  });
  if (!existing) return failure("This supplier no longer exists.");

  const conflict = await checkConflicts(parsed.data.companyName, parsed.data.website, id);
  if (conflict) return conflict;

  try {
    await prisma.supplier.update({ where: { id }, data: parsed.data });
    revalidateSuppliers(id);
    return { ok: true, data: { id } };
  } catch {
    return failure("Could not save your changes. Please try again.");
  }
}

/**
 * Soft-deletes a supplier.
 *
 * Projects sourced through them are kept and simply lose the reference — an
 * order that happened still happened, and deleting its supply-side record must
 * not remove it from any commission total.
 */
export async function deleteSupplier(id: string): Promise<ActionResult> {
  const supplier = await prisma.supplier.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, _count: { select: { allocations: { where: notDeleted } } } },
  });
  if (!supplier) return failure("This supplier no longer exists.");

  // The orders themselves are kept and simply lose this maker; their
  // quantities stay as they were, so the split shows as partly unassigned.
  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.projectSupplier.updateMany({
      where: { supplierId: id, ...notDeleted },
      data: { deletedAt },
    }),
    prisma.supplier.update({ where: { id }, data: { deletedAt } }),
  ]);

  revalidateSuppliers();
  redirect("/suppliers");
}
