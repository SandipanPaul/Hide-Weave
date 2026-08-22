"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findOrderIdConflict } from "@/lib/projects/queries";
import { dateOnlyToUtc } from "@/lib/dates";
import { notDeleted, prisma } from "@/lib/db";
import {
  failure,
  invalid,
  makePaymentInputSchema,
  projectInputSchema,
  type ActionResult,
} from "@/lib/schemas";

/**
 * Every action re-validates with the shared Zod schemas. Client-side
 * validation is a convenience; this is the trust boundary.
 */

/** A project write changes the list, its own page, and its client's page. */
function revalidateProject(id?: string, clientId?: string) {
  revalidatePath("/projects");
  if (id) revalidatePath(`/projects/${id}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

function projectFormValues(formData: FormData) {
  // Parallel fields, one pair per row of the split, read positionally: the
  // form renders an exporter picker and a quantity box side by side.
  const exporterIds = formData.getAll("exporterId");
  const quantities = formData.getAll("exporterQuantity");

  return {
    clientId: formData.get("clientId"),
    exporters: exporterIds.map((exporterId, index) => ({
      exporterId: String(exporterId ?? ""),
      quantity: quantities[index] ?? "",
    })),
    product: formData.get("product"),
    orderId: formData.get("orderId"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    orderValue: formData.get("orderValue"),
    commissionPercentage: formData.get("commissionPercentage"),
    currency: formData.get("currency"),
    status: formData.get("status"),
    orderDate: formData.get("orderDate"),
    expectedDelivery: formData.get("expectedDelivery"),
    actualDelivery: formData.get("actualDelivery"),
    notes: formData.get("notes"),
  };
}

/**
 * Checks the records a project points at. An id that doesn't resolve is
 * reported against its own field rather than surfacing as a foreign-key error.
 */
async function checkReferences(
  clientId: string,
  exporters: ReadonlyArray<{ exporterId: string }>,
): Promise<ActionResult<never> | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...notDeleted },
    select: { id: true },
  });
  if (!client) return failure("Choose a client that still exists.", "clientId");

  const ids = exporters.map((allocation) => allocation.exporterId);
  if (ids.length > 0) {
    const found = await prisma.exporter.findMany({
      where: { id: { in: ids }, ...notDeleted },
      select: { id: true },
    });
    if (found.length !== new Set(ids).size) {
      return failure("One of those exporters no longer exists.", "exporters");
    }
  }
  return null;
}

/** Nested-create rows for a project's split, numbered in the given order. */
function allocationRows(exporters: ReadonlyArray<{ exporterId: string; quantity: number }>) {
  return exporters.map((allocation, position) => ({ ...allocation, position }));
}

/** The shape both create and update write, once dates are real Dates. */
function projectData(input: z.infer<typeof projectInputSchema>) {
  const { orderDate, expectedDelivery, actualDelivery, ...rest } = input;
  const { exporters, ...columns } = rest;
  void exporters;
  return {
    ...columns,
    orderDate: dateOnlyToUtc(orderDate),
    expectedDelivery: expectedDelivery ? dateOnlyToUtc(expectedDelivery) : null,
    actualDelivery: actualDelivery ? dateOnlyToUtc(actualDelivery) : null,
  };
}

export async function createProject(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectInputSchema.safeParse(projectFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const badReference = await checkReferences(parsed.data.clientId, parsed.data.exporters);
  if (badReference) return badReference;

  if (await findOrderIdConflict(parsed.data.orderId)) {
    return failure("Another project already uses this order ID.", "orderId");
  }

  try {
    const project = await prisma.project.create({
      data: {
        ...projectData(parsed.data),
        exporters: { create: allocationRows(parsed.data.exporters) },
      },
    });
    revalidateProject(project.id, parsed.data.clientId);
    return { ok: true, data: { id: project.id } };
  } catch {
    return failure("Could not save this project. Please try again.");
  }
}

export async function updateProject(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectInputSchema.safeParse(projectFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.project.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, clientId: true, currency: true },
  });
  if (!existing) return failure("This project no longer exists.");

  const badReference = await checkReferences(parsed.data.clientId, parsed.data.exporters);
  if (badReference) return badReference;

  if (await findOrderIdConflict(parsed.data.orderId, id)) {
    return failure("Another project already uses this order ID.", "orderId");
  }

  // Payments are held in the project's currency, so changing it would silently
  // reinterpret every amount already recorded.
  if (parsed.data.currency !== existing.currency) {
    const payments = await prisma.payment.count({ where: { projectId: id, ...notDeleted } });
    if (payments > 0) {
      return failure(
        `This project already has ${payments} payment${payments === 1 ? "" : "s"} recorded in ${
          existing.currency
        }. Delete them before changing the currency.`,
        "currency",
      );
    }
  }

  try {
    // The split is a value, not a record with a history of its own, so it is
    // replaced wholesale rather than reconciled row by row.
    await prisma.$transaction([
      prisma.projectExporter.deleteMany({ where: { projectId: id } }),
      prisma.project.update({
        where: { id },
        data: {
          ...projectData(parsed.data),
          exporters: { create: allocationRows(parsed.data.exporters) },
        },
      }),
    ]);
    revalidateProject(id, parsed.data.clientId);
    // The order may have moved to a different client.
    if (existing.clientId !== parsed.data.clientId) revalidatePath(`/clients/${existing.clientId}`);
    return { ok: true, data: { id } };
  } catch {
    return failure("Could not save your changes. Please try again.");
  }
}

/**
 * Soft-deletes a project along with its payments — the schema's cascade only
 * fires on a real delete, which never happens here.
 */
export async function deleteProject(id: string): Promise<ActionResult> {
  const project = await prisma.project.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, clientId: true },
  });
  if (!project) return failure("This project no longer exists.");

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.payment.updateMany({ where: { projectId: id, ...notDeleted }, data: { deletedAt } }),
    prisma.project.update({ where: { id }, data: { deletedAt } }),
  ]);

  revalidateProject(undefined, project.clientId);
  redirect("/projects");
}

// -------------------------------------------------------------- Payments

/**
 * Payments settle the agent's commission on a project, not the order value,
 * and are recorded in the project's own currency — which is why the schema is
 * built per call rather than shared.
 */
export async function createPayment(
  projectId: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...notDeleted },
    select: { id: true, currency: true, clientId: true },
  });
  if (!project) return failure("This project no longer exists.");

  const parsed = makePaymentInputSchema(project.currency).safeParse({
    projectId,
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn"),
    method: formData.get("method"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return invalid(parsed.error);

  if (parsed.data.amount <= 0n) {
    return failure("Enter an amount greater than zero.", "amount");
  }

  const { paidOn, ...rest } = parsed.data;
  const payment = await prisma.payment.create({
    data: { ...rest, paidOn: dateOnlyToUtc(paidOn) },
  });

  revalidateProject(projectId, project.clientId);
  return { ok: true, data: { id: payment.id } };
}

/**
 * Corrects a payment already recorded.
 *
 * The amount is re-parsed in the project's own currency, not the one the
 * payment was originally entered in — a project cannot change currency while
 * it has payments, so those are always the same thing.
 */
export async function updatePayment(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const payment = await prisma.payment.findFirst({
    where: { id, ...notDeleted },
    select: {
      projectId: true,
      project: { select: { currency: true, clientId: true } },
    },
  });
  if (!payment) return failure("This payment no longer exists.");

  const parsed = makePaymentInputSchema(payment.project.currency).safeParse({
    projectId: payment.projectId,
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn"),
    method: formData.get("method"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return invalid(parsed.error);

  if (parsed.data.amount <= 0n) {
    return failure("Enter an amount greater than zero.", "amount");
  }

  const { paidOn, projectId, ...rest } = parsed.data;
  await prisma.payment.update({
    where: { id },
    data: { ...rest, paidOn: dateOnlyToUtc(paidOn) },
  });

  revalidateProject(projectId, payment.project.clientId);
  return { ok: true, data: { id } };
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const payment = await prisma.payment.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, projectId: true, project: { select: { clientId: true } } },
  });
  if (!payment) return failure("This payment no longer exists.");

  await prisma.payment.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidateProject(payment.projectId, payment.project.clientId);
  return { ok: true, data: undefined };
}
