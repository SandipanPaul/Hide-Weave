import { expect } from "vitest";

/**
 * Calling server actions from tests.
 *
 * Actions take FormData, which is tedious to build by hand and was being built
 * by hand in three files with three slightly different helpers. One of them
 * quietly did not support repeated fields, which is how a multi-value form
 * gets tested without ever exercising the multi-value path.
 */

/**
 * FormData from a plain object. An array becomes repeated fields, which is what
 * `formData.getAll` reads — checkboxes, contact lists, allocations.
 */
export function formData(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  }
  return data;
}

/**
 * Asserts a rejection is reported somewhere the user will see it.
 *
 * An error filed against a field no form renders makes the save silently do
 * nothing — the button looks dead and no message appears. That reached
 * production once, on a duplicate email filed under "email" when the form only
 * ever read "emails". Every conflict test asserts the key, not just the
 * failure, and this is the assertion that does it.
 */
export function expectRenderedKeys(
  result: { ok: false; fieldErrors: Record<string, string[] | undefined> },
  rendered: readonly string[],
): void {
  const allowed = new Set(rendered);
  for (const field of Object.keys(result.fieldErrors)) {
    // Named in the message so a failure says which key, not just "false".
    expect(allowed.has(field), `"${field}" is not a field the form renders`).toBe(true);
  }
}
