"use server";

import { revalidatePath } from "next/cache";
import { dateOnlyToUtc } from "@/lib/dates";
import { notDeleted, prisma } from "@/lib/db";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { failure, invalid, makeExpenseInputSchema, type ActionResult } from "@/lib/schemas";

/**
 * Expenses — money the agent spent.
 *
 * These live in their own module rather than under /projects because an
 * expense need not have a project: overheads are recorded from the Finances
 * page with no order behind them. Both kinds go through the same three
 * actions, and `projectId` is the only thing that differs.
 *
 * An expense never changes what a client owes. It is deducted from earnings,
 * not from receivables — see src/lib/projects/ledger.ts.
 */

function revalidateExpense(projectId: string | null) {
  revalidatePath("/finances");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/**
 * The currency an expense is recorded in.
 *
 * On a project it is the project's own, always — an expense denominated
 * differently from the order it belongs to could never be netted against its
 * commission. Off a project the caller passes the one being viewed.
 */
async function resolveCurrency(
  projectId: string | undefined,
  fallback: string,
): Promise<{ currency: string; projectId: string | null } | null> {
  if (!projectId) return { currency: fallback, projectId: null };

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...notDeleted },
    select: { id: true, currency: true },
  });
  return project ? { currency: project.currency, projectId: project.id } : null;
}

/** Sentinel for "an id was given and it does not resolve" — distinct from none. */
const MISSING = Symbol("missing client");

/**
 * The client a spend was for. Optional throughout: an overhead is for nobody
 * in particular, and saying so is not an error.
 */
async function resolveClient(clientId: string | undefined): Promise<string | null | typeof MISSING> {
  if (!clientId) return null;
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...notDeleted },
    select: { id: true },
  });
  return client ? client.id : MISSING;
}

function expenseFormValues(formData: FormData) {
  return {
    projectId: formData.get("projectId"),
    clientId: formData.get("clientId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    incurredOn: formData.get("incurredOn"),
    category: formData.get("category"),
    notes: formData.get("notes"),
  };
}

export async function createExpense(
  /** The currency to record a *general* expense in; ignored when it has a project. */
  fallbackCurrency: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const rawProjectId = String(formData.get("projectId") ?? "").trim() || undefined;
  const resolved = await resolveCurrency(rawProjectId, fallbackCurrency || DEFAULT_CURRENCY);
  if (!resolved) return failure("That project no longer exists.");

  const parsed = makeExpenseInputSchema(resolved.currency).safeParse(expenseFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  if (parsed.data.amount <= 0n) {
    return failure("Enter an amount greater than zero.", "amount");
  }

  const clientId = await resolveClient(parsed.data.clientId);
  if (clientId === MISSING) return failure("Choose a client that still exists.", "clientId");

  // The form's projectId has already been resolved to a real project above.
  const { incurredOn, projectId, ...rest } = parsed.data;
  void projectId;
  const expense = await prisma.expense.create({
    data: {
      ...rest,
      clientId,
      projectId: resolved.projectId,
      currency: resolved.currency,
      incurredOn: dateOnlyToUtc(incurredOn),
    },
  });

  revalidateExpense(resolved.projectId);
  return { ok: true, data: { id: expense.id } };
}

/**
 * Corrects an expense already recorded. Which project it belongs to is fixed
 * at creation: moving a spend between orders would silently rewrite two
 * projects' net figures at once, and deleting and re-adding says so plainly.
 */
export async function updateExpense(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.expense.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, projectId: true, currency: true },
  });
  if (!existing) return failure("This expense no longer exists.");

  const parsed = makeExpenseInputSchema(existing.currency).safeParse(expenseFormValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  if (parsed.data.amount <= 0n) {
    return failure("Enter an amount greater than zero.", "amount");
  }

  const clientId = await resolveClient(parsed.data.clientId);
  if (clientId === MISSING) return failure("Choose a client that still exists.", "clientId");

  // Which project an expense belongs to is fixed at creation, so the form's
  // projectId is deliberately not written here. The client is not: naming who
  // a spend was for is a correction, not a re-filing of the money.
  const { incurredOn, projectId, ...rest } = parsed.data;
  void projectId;
  await prisma.expense.update({
    where: { id },
    data: { ...rest, clientId, incurredOn: dateOnlyToUtc(incurredOn) },
  });

  revalidateExpense(existing.projectId);
  return { ok: true, data: { id } };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const expense = await prisma.expense.findFirst({
    where: { id, ...notDeleted },
    select: { id: true, projectId: true },
  });
  if (!expense) return failure("This expense no longer exists.");

  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidateExpense(expense.projectId);
  return { ok: true, data: undefined };
}
