"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dateOnlyToUtc, todayUtc } from "@/lib/dates";
import { notDeleted, prisma } from "@/lib/db";
import { CLIENT_STATUSES, SAMPLING_STATUSES } from "@/lib/enums";
import { contactRows, findClientConflict, reserveClientCode } from "@/lib/clients/queries";
import {
  clientInputSchema,
  failure,
  invalid,
  samplingInputSchema,
  type ActionResult,
} from "@/lib/schemas";

/**
 * Every action re-validates with the shared Zod schemas. Client-side validation
 * is a convenience; this is the trust boundary.
 */

/** Every client write touches the list, and edits touch the detail page too. */
function revalidateClients(id?: string) {
  revalidatePath("/clients");
  if (id) revalidatePath(`/clients/${id}`);
}

/**
 * Turns a name-or-email collision into the message for the field that caused
 * it. The wording differs between adding and editing, so it is passed in.
 */
function conflictFailure(
  conflict: { name: string; matchedOn: "name" | "email" },
  nameMessage: string,
): ActionResult<never> {
  return conflict.matchedOn === "name"
    ? failure(nameMessage, "name")
    // "emails", plural: that is the field on clientInputSchema and the key the
    // form reads. Naming it "email" put the message on a field nothing renders,
    // so a rejected save looked like a button that did nothing at all.
    : failure(`${conflict.name} already uses one of these email addresses.`, "emails");
}

function clientFormValues(formData: FormData) {
  return {
    name: formData.get("name"),
    address: formData.get("address"),
    country: formData.get("country"),
    // getAll: the form renders one input per number or address, all sharing
    // the field name, and each may itself hold several separated by "/" or ";".
    phones: formData.getAll("phone"),
    emails: formData.getAll("email"),
    website: formData.get("website"),
    contactPerson: formData.get("contactPerson"),
    status: formData.get("status"),
    fixedMonthly: formData.get("fixedMonthly"),
    currency: formData.get("currency"),
    notes: formData.get("notes"),
  };
}

export async function createClient(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = clientInputSchema.safeParse(clientFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const conflict = await findClientConflict({
    name: parsed.data.name,
    emails: parsed.data.emails,
  });
  if (conflict) return conflictFailure(conflict, "A client with this name already exists.");

  try {
    const { phones, emails, ...fields } = parsed.data;
    const client = await prisma.client.create({
      data: {
        ...fields,
        code: await reserveClientCode(),
        contacts: { create: contactRows(phones, emails) },
      },
    });
    revalidateClients();
    return { ok: true, data: { id: client.id } };
  } catch {
    return failure("Could not save this client. Please try again.");
  }
}

export async function updateClient(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = clientInputSchema.safeParse(clientFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.client.findFirst({ where: { id, ...notDeleted } });
  if (!existing) return failure("This client no longer exists.");

  const conflict = await findClientConflict({
    name: parsed.data.name,
    emails: parsed.data.emails,
    excludeId: id,
  });
  if (conflict) return conflictFailure(conflict, "Another client already uses this name.");

  try {
    const { phones, emails, ...fields } = parsed.data;
    // Contacts are values, not records with a history of their own, so they
    // are replaced wholesale rather than soft-deleted and accumulated.
    await prisma.$transaction([
      prisma.clientContact.deleteMany({ where: { clientId: id } }),
      prisma.client.update({
        where: { id },
        data: { ...fields, contacts: { create: contactRows(phones, emails) } },
      }),
    ]);

    revalidateClients(id);
    return { ok: true, data: { id } };
  } catch {
    return failure("Could not save your changes. Please try again.");
  }
}

/**
 * Soft-deletes a client and its samplings.
 *
 * Retainer fees already received are kept: they are money that moved, and the
 * ledger records that regardless of whether the client is still on the books.
 *
 * A client with live projects is refused rather than quietly taking those
 * projects (and their commission history) out of every total.
 */
export async function deleteClient(id: string): Promise<ActionResult> {
  const client = await prisma.client.findFirst({
    where: { id, ...notDeleted },
    include: { _count: { select: { projects: { where: notDeleted } } } },
  });
  if (!client) return failure("This client no longer exists.");

  if (client._count.projects > 0) {
    return failure(
      `${client.name} still has ${client._count.projects} project${
        client._count.projects === 1 ? "" : "s"
      }. Delete or reassign them first.`,
    );
  }

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.clientSampling.updateMany({ where: { clientId: id, ...notDeleted }, data: { deletedAt } }),
    prisma.client.update({ where: { id }, data: { deletedAt } }),
  ]);

  revalidateClients();
  revalidatePath("/finances");
  redirect("/clients");
}

// ------------------------------------------------------------- Samplings

function samplingFormValues(formData: FormData) {
  return {
    clientId: formData.get("clientId"),
    scheduledDate: formData.get("scheduledDate"),
    product: formData.get("product"),
    status: formData.get("status"),
    notes: formData.get("notes"),
  };
}

export async function createSampling(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = samplingInputSchema.safeParse(samplingFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, ...notDeleted },
    select: { id: true },
  });
  if (!client) return failure("This client no longer exists.");

  const { scheduledDate, ...rest } = parsed.data;
  const sampling = await prisma.clientSampling.create({
    data: { ...rest, scheduledDate: dateOnlyToUtc(scheduledDate) },
  });

  revalidateClients(parsed.data.clientId);
  return { ok: true, data: { id: sampling.id } };
}

export async function updateSampling(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = samplingInputSchema.safeParse(samplingFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.clientSampling.findFirst({ where: { id, ...notDeleted } });
  if (!existing) return failure("This sampling no longer exists.");

  const { scheduledDate, clientId, ...rest } = parsed.data;
  await prisma.clientSampling.update({
    where: { id },
    data: { ...rest, scheduledDate: dateOnlyToUtc(scheduledDate) },
  });

  revalidateClients(clientId);
  return { ok: true, data: { id } };
}

/** Used by the "mark complete" and "cancel" buttons on the samplings list. */
export async function setSamplingStatus(id: string, status: string): Promise<ActionResult> {
  const parsedStatus = z.enum(SAMPLING_STATUSES).safeParse(status);
  if (!parsedStatus.success) return failure("That is not a valid sampling status.");

  const existing = await prisma.clientSampling.findFirst({
    where: { id, ...notDeleted },
    select: { clientId: true },
  });
  if (!existing) return failure("This sampling no longer exists.");

  await prisma.clientSampling.update({ where: { id }, data: { status: parsedStatus.data } });
  revalidateClients(existing.clientId);
  return { ok: true, data: undefined };
}

export async function deleteSampling(id: string): Promise<ActionResult> {
  const existing = await prisma.clientSampling.findFirst({
    where: { id, ...notDeleted },
    select: { clientId: true },
  });
  if (!existing) return failure("This sampling no longer exists.");

  await prisma.clientSampling.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidateClients(existing.clientId);
  return { ok: true, data: undefined };
}

/**
 * Changes only a client's status.
 *
 * Its own action rather than a trip through `updateClient`: that re-validates
 * the whole record and rewrites the contact rows, which is a lot of machinery —
 * and a lot to go wrong — for a field you change while working down a list. A
 * client whose contacts happened to fail validation could not have their status
 * moved at all.
 */
export async function setClientStatus(id: string, status: string): Promise<ActionResult> {
  const parsed = z.enum(CLIENT_STATUSES).safeParse(status);
  if (!parsed.success) return failure("That is not a status this app knows.");

  const client = await prisma.client.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, status: true },
  });
  if (!client) return failure("This client no longer exists.");
  if (client.status === parsed.data) return { ok: true, data: undefined };

  await prisma.client.update({ where: { id }, data: { status: parsed.data } });

  revalidateClients(id);
  return { ok: true, data: undefined };
}

// -------------------------------------------------------------- Retainer

/**
 * Logging a retainer fee that has been received.
 *
 * The fee is a rate on the client (`fixedMonthly`); this records one instance
 * of it arriving. Deliberately manual: only the agent knows whether a client
 * actually paid, and a schedule that assumed they had would put money in the
 * ledger that nobody had sent.
 *
 * The amount is captured now rather than read live, so changing the rate later
 * never rewrites what was already received.
 */
export async function recordRetainerPaid(clientId: string): Promise<ActionResult> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...notDeleted },
    select: { id: true, fixedMonthly: true, currency: true },
  });
  if (!client) return failure("This client no longer exists.");

  if (client.fixedMonthly === null || client.fixedMonthly <= 0n) {
    return failure("Set a monthly retainer amount on this client first.");
  }

  await prisma.retainerReceipt.create({
    data: {
      clientId,
      amount: client.fixedMonthly,
      currency: client.currency,
      paidOn: todayUtc(),
    },
  });

  revalidateRetainer(clientId);
  return { ok: true, data: undefined };
}

/** Removes a retainer fee logged by mistake. */
export async function deleteRetainerPaid(id: string): Promise<ActionResult> {
  const receipt = await prisma.retainerReceipt.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, clientId: true },
  });
  if (!receipt) return failure("This retainer fee no longer exists.");

  await prisma.retainerReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidateRetainer(receipt.clientId);
  return { ok: true, data: undefined };
}

/** A retainer fee shows on the client's page and in the ledger. */
function revalidateRetainer(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/finances");
}
