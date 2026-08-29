import { z } from "zod";
import {
  CLIENT_STATUSES,
  EXPENSE_CATEGORIES,
  PROJECT_STATUSES,
  SAMPLING_STATUSES,
} from "@/lib/enums";
import { joinContacts, splitContacts } from "@/lib/contacts";
import { MAIL_PROVIDERS } from "@/lib/mail/providers";
import { resolveCountry } from "@/lib/countries";
import { normalizeWebsite } from "@/lib/url";
import type { ContactKind } from "@/lib/enums";
import { DEFAULT_CURRENCY, MoneyError, parseMoneyToMinor } from "@/lib/money";

/**
 * Shared by client-side forms and server actions. Server actions re-validate
 * with these same schemas — client-side validation is a convenience, never a
 * trust boundary.
 */

/**
 * Normalises the three ways "no value" reaches us into a single `undefined`:
 * an absent FormData field (`null`), an empty input (`""`), and whitespace.
 *
 * The `null` case matters: `FormData.get()` returns null for a field that was
 * never rendered, and a plain `.optional()` rejects null.
 */
const blankToUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Optional free text: blank in, undefined out. */
const optionalText = z.preprocess(blankToUndefined, z.string().optional());

const optionalEmail = z.preprocess(
  blankToUndefined,
  z.email("Enter a valid email address.").optional(),
);

/**
 * A website, stored in canonical form.
 *
 * A bare domain is accepted and assumed to be https — "asianleather.com" is
 * what people type and paste, and rejecting it taught them nothing. Anything
 * that is not a usable web address is still an error rather than a silently
 * dropped value.
 */
const optionalWebsite = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const normalized = normalizeWebsite(value);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a web address, e.g. example.com or https://example.com",
        });
        return undefined;
      }
      return normalized;
    }),
);

/**
 * A country name, an ISO alpha-2 code, or a common alias ("USA", "UK"), stored
 * as the canonical alpha-2 code. Blank means no country; anything unrecognised
 * is an error rather than a silently dropped value.
 */
const optionalCountry = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const code = resolveCountry(value);
      if (!code) {
        ctx.addIssue({
          code: "custom",
          message: `“${value}” is not a country we recognise. Use a name or 2-letter code, e.g. India or IN.`,
        });
        return undefined;
      }
      return code;
    }),
);

/**
 * A list of phone numbers or email addresses.
 *
 * Accepts whatever shape the caller has: a single cell from a CSV
 * ("a@x.com/b@x.com"), several repeated form fields, or nothing at all. All of
 * them are split on the usual delimiters, de-obfuscated, de-duplicated, and
 * come out as an ordered array.
 */
function contactListSchema(kind: ContactKind, invalidMessage?: string) {
  return z.preprocess(
    (value) => {
      const parts = (Array.isArray(value) ? value : [value]).filter(
        (part): part is string => typeof part === "string",
      );
      // Re-joining and splitting once removes duplicates across parts as well
      // as within each one.
      return splitContacts(joinContacts(parts), kind);
    },
    invalidMessage
      ? z.array(z.email(invalidMessage))
      : z.array(z.string().min(1)),
  );
}

/** An optional field that still has a default when omitted (selects, enums). */
function optionalWithDefault<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(blankToUndefined, schema);
}

export const currencySchema = optionalWithDefault(
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code, e.g. INR.")
    .default(DEFAULT_CURRENCY),
);

/**
 * Money arrives from forms and CSVs as text. Parsing needs the currency (to
 * know how many minor digits it has), so this is a factory applied inside the
 * parent object's transform rather than a standalone field schema.
 */
function parseMoneyField(
  value: string,
  currency: string,
  ctx: z.RefinementCtx,
  path: string,
): bigint | undefined {
  try {
    return parseMoneyToMinor(value, currency);
  } catch (err) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: err instanceof MoneyError ? err.message : "Enter a valid amount.",
    });
    return undefined;
  }
}

/** Dates come from <input type="date"> as "YYYY-MM-DD" and are stored UTC-midnight. */
export const dateStringSchema = z
  .string({ error: "A date is required." })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker, or type YYYY-MM-DD.")
  // Date.parse rolls impossible dates over (2026-02-31 becomes 2026-03-03), so
  // the only reliable check is to build the date and read the parts back.
  .refine((v) => {
    const [year, month, day] = v.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "That date doesn't exist.");

const optionalDateString = z.preprocess(blankToUndefined, dateStringSchema.optional());

// ---------------------------------------------------------------- Client

export const clientInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(200),
    address: optionalText,
    country: optionalCountry,
    phones: contactListSchema("PHONE"),
    emails: contactListSchema("EMAIL", "Enter a valid email address."),
    website: optionalWebsite,
    contactPerson: optionalText,
    status: optionalWithDefault(z.enum(CLIENT_STATUSES).default("ACTIVE")),
    fixedMonthly: optionalText,
    currency: currencySchema,
    notes: optionalText,
  })
  // Phone and email are each optional, but a client with neither is
  // unreachable. This is a property of the whole object, so it is refined here
  // and reported at form level rather than blamed on one of the two fields.
  .refine((data) => data.phones.length > 0 || data.emails.length > 0, {
    message: "Give at least one way to reach this client — a phone number or an email address.",
    path: [],
  })
  .transform((data, ctx) => {
    const fixedMonthly =
      data.fixedMonthly === undefined
        ? undefined
        : parseMoneyField(data.fixedMonthly, data.currency, ctx, "fixedMonthly");
    return { ...data, fixedMonthly };
  });


// -------------------------------------------------------- ClientSampling

export const samplingInputSchema = z.object({
  clientId: z.string().min(1, "A client is required."),
  scheduledDate: dateStringSchema,
  product: optionalText,
  status: optionalWithDefault(z.enum(SAMPLING_STATUSES).default("SCHEDULED")),
  notes: optionalText,
});


// -------------------------------------------------------------- Exporter

export const exporterInputSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required.").max(200),
  website: optionalWebsite,
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  address: optionalText,
  sourceUrl: optionalWebsite,
  notes: optionalText,
});


// --------------------------------------------------------------- Project

/**
 * Which exporters are making an order, and how much each is making.
 *
 * Rows with no exporter chosen are dropped rather than rejected: the form
 * always shows one empty row to type into, and an untouched one is not an
 * error. A row with an exporter but no quantity is an error — that is someone
 * who started and did not finish.
 */
const exporterSplitSchema = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter((row) => {
      if (!row || typeof row !== "object") return false;
      const { exporterId, quantity } = row as Record<string, unknown>;
      const blankQuantity = quantity === "" || quantity === null || quantity === undefined;
      return !(String(exporterId ?? "") === "" && blankQuantity);
    });
  },
  z.array(
    z.object({
      exporterId: z.string().min(1, "Choose an exporter, or clear the quantity."),
      quantity: z.coerce
        .number({ error: "Quantity must be a number." })
        .int("Quantity must be a whole number.")
        .positive("Quantity must be greater than zero."),
    }),
  ),
);

export const projectInputSchema = z
  .object({
    clientId: z.string().min(1, "A client is required."),
    exporters: exporterSplitSchema,
    product: z.string().trim().min(1, "Product is required.").max(200),
    // Whatever the client calls this order. Never validated for shape: a PO
    // number is theirs, and rejecting an unfamiliar one would be wrong.
    clientReference: optionalText,
    quantity: z.coerce
      .number({ error: "Quantity must be a number." })
      .int("Quantity must be a whole number.")
      .positive("Quantity must be greater than zero."),
    unit: optionalWithDefault(z.string().trim().min(1).max(20).default("pcs")),
    orderValue: z.string().trim().min(1, "Order value is required."),
    commissionPercentage: z.coerce
      .number({ error: "Commission % must be a number." })
      .min(0, "Commission % cannot be negative.")
      .max(100, "Commission % cannot exceed 100."),
    currency: currencySchema,
    status: optionalWithDefault(z.enum(PROJECT_STATUSES).default("QUOTED")),
    orderDate: dateStringSchema,
    expectedDelivery: optionalDateString,
    actualDelivery: optionalDateString,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    // The split is checked here rather than on the field, because it only
    // means anything against the project's own quantity.
    const seen = new Set<string>();
    for (const [index, allocation] of data.exporters.entries()) {
      if (seen.has(allocation.exporterId)) {
        ctx.addIssue({
          code: "custom",
          path: ["exporters", index, "exporterId"],
          message: "This exporter is already on the order. Change their quantity instead.",
        });
      }
      seen.add(allocation.exporterId);
    }

    const allocated = data.exporters.reduce((total, item) => total + item.quantity, 0);
    if (allocated > data.quantity) {
      ctx.addIssue({
        code: "custom",
        path: ["exporters"],
        message: `The split adds up to ${allocated.toLocaleString("en-IN")}, which is more than the order's ${data.quantity.toLocaleString("en-IN")}.`,
      });
    }
  })
  .transform((data, ctx) => {
    const orderValue = parseMoneyField(data.orderValue, data.currency, ctx, "orderValue");
    // A consignment worth nothing, or less than nothing, is not an order. Left
    // unchecked this flowed straight into commission and every total above it.
    if (orderValue !== undefined && orderValue <= 0n) {
      ctx.addIssue({
        code: "custom",
        path: ["orderValue"],
        message: "Order value must be greater than zero.",
      });
    }
    return { ...data, orderValue: orderValue ?? 0n };
  });



// --------------------------------------------------------------- Payment

/**
 * A payment settles the agent's commission on a project — not the order value.
 * The currency is inherited from the parent project and passed in for parsing.
 */
export function makePaymentInputSchema(currency: string) {
  return z
    .object({
      projectId: z.string().min(1, "A project is required."),
      amount: z.string().trim().min(1, "Amount is required."),
      paidOn: dateStringSchema,
      method: optionalText,
      notes: optionalText,
    })
    .transform((data, ctx) => ({
      ...data,
      amount: parseMoneyField(data.amount, currency, ctx, "amount") ?? 0n,
    }));
}


// --------------------------------------------------------------- Expense

/**
 * Money the agent spent. Like a payment, the currency is passed in rather than
 * chosen on the field: an expense on a project is denominated in that
 * project's currency, and a general expense in whichever currency the user is
 * looking at.
 *
 * Unlike a payment, an expense need not belong to a project — office rent and
 * a trade-fair stand are real costs with no order behind them. It may name a
 * client instead, or as well: a sample posted to a prospect was spent *for*
 * someone even though no order exists yet.
 */
export function makeExpenseInputSchema(currency: string) {
  return z
    .object({
      projectId: z.preprocess(blankToUndefined, z.string().optional()),
      clientId: z.preprocess(blankToUndefined, z.string().optional()),
      description: z.string().trim().min(1, "Say what this was for.").max(200),
      amount: z.string().trim().min(1, "Amount is required."),
      incurredOn: dateStringSchema,
      category: optionalWithDefault(z.enum(EXPENSE_CATEGORIES).optional()),
      notes: optionalText,
    })
    .transform((data, ctx) => ({
      ...data,
      amount: parseMoneyField(data.amount, currency, ctx, "amount") ?? 0n,
    }));
}



export type FieldErrors = Record<string, string[] | undefined>;

/**
 * One bulk mailing, as the compose form submits it.
 *
 * Clients are sent as ids rather than addresses: which address to use and what
 * `<name>` becomes are decided on the server from the current client record, so
 * a stale form cannot post a hand-edited address list. Addresses typed by hand
 * are the exception, and are the only ones taken at face value.
 *
 * Neither list is required on its own — a mailing needs at least one recipient
 * from either, which the action checks once both have been resolved.
 */
export const campaignInputSchema = z.object({
  subject: z.string().trim().min(1, "Give the email a subject."),
  body: z.string().trim().min(1, "Write the message before sending it."),
  clientIds: z.array(z.string().min(1)),
  /**
   * Addresses typed by hand, as one string. Parsed rather than validated here:
   * src/lib/mail/recipients.ts owns what counts as a recipient, and the compose
   * screen shows the result of that same parse before anything is sent.
   */
  extraEmails: z.preprocess(blankToUndefined, z.string().optional()),
  /** Addresses copied on every message. Parsed the same way as `extraEmails`. */
  cc: z.preprocess(blankToUndefined, z.string().optional()),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

/**
 * The mail credentials, as the settings form submits them.
 *
 * `password` is optional here rather than required, because leaving the field
 * blank means "keep the one already saved" — the form has no way to show a
 * stored password back, so it cannot round-trip it. Whether a blank is
 * acceptable depends on whether one is already stored, which is a question for
 * the action, not the schema.
 *
 * Whitespace is stripped from the password: Google and Yahoo both display app
 * passwords in four groups of four, people paste them that way, and the spaces
 * are not part of the password.
 */
export const mailSettingsSchema = z.object({
  provider: optionalWithDefault(z.enum(MAIL_PROVIDERS).default("gmail")),
  user: z.email("Enter the address mail should be sent from."),
  fromName: z.preprocess(blankToUndefined, z.string().optional()),
  password: z.preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const stripped = value.replace(/\s+/g, "");
      return stripped === "" ? undefined : stripped;
    },
    z
      .string()
      .min(8, "That looks too short for an app password. Check you pasted the whole thing.")
      .optional(),
  ),
});

export type MailSettingsInput = z.infer<typeof mailSettingsSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; formErrors: string[]; fieldErrors: FieldErrors };

/** A rejected write, with the reasons attached to the fields that caused them. */
export function invalid(error: z.ZodError): ActionResult<never> {
  const { formErrors, fieldErrors } = formatZodError(error);
  return { ok: false, formErrors, fieldErrors };
}

/**
 * A rejected write for a reason Zod cannot know: a name already taken, a
 * record that vanished, a save that failed. Naming a field puts the message
 * on that input; omitting one puts it at the top of the form.
 */
export function failure(message: string, field?: string): ActionResult<never> {
  return field
    ? { ok: false, formErrors: [], fieldErrors: { [field]: [message] } }
    : { ok: false, formErrors: [message], fieldErrors: {} };
}

/**
 * Flattens a ZodError into `{ formErrors, fieldErrors }` for rendering. Object
 * level refinements (like "phone or email") land in formErrors.
 */
export function formatZodError(error: z.ZodError): {
  formErrors: string[];
  fieldErrors: FieldErrors;
} {
  const flat = z.flattenError(error);
  return {
    formErrors: flat.formErrors,
    // Widened deliberately: on schemas with a .transform the inferred output
    // type loses the input keys, but the issues still carry them.
    fieldErrors: flat.fieldErrors as FieldErrors,
  };
}

