/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Send button, clicked the way a person clicks it.
 *
 * This file exists because of a bug that no other kind of test could have
 * caught: the confirmation dialog renders in a portal, so the button inside it
 * was not a DOM descendant of the form, and a plain submit button did nothing
 * at all. Typecheck, lint, unit tests and the production build were all clean
 * while the feature was completely dead in the browser.
 */

// Typed with the action's real signature so the assertions below can read the
// FormData it was called with.
const createCampaign =
  vi.fn<(prev: unknown, formData: FormData) => Promise<{ ok: true; data: { id: string } }>>(
    async () => ({ ok: true, data: { id: "camp1" } }),
  );
// Referenced lazily: vi.mock is hoisted above the declaration above.
vi.mock("../actions", () => ({
  createCampaign: (prev: unknown, formData: FormData) => createCampaign(prev, formData),
}));

const CLIENTS = [
  {
    id: "c1",
    code: "HWC00001",
    name: "Meridian Foods Ltd",
    status: "ACTIVE" as const,
    country: "GB",
    email: "orders@meridian.example",
    greeting: "Daniel",
    isCompanyGreeting: false,
  },
  {
    id: "c2",
    code: "HWC00002",
    name: "Sakura Import Co",
    status: "ACTIVE" as const,
    country: "JP",
    email: "hello@sakura.example",
    greeting: "Lena",
    isCompanyGreeting: false,
  },
];

async function renderForm(options?: { applyAccept?: boolean }) {
  const { ComposeForm } = await import("./compose-form");
  render(<ComposeForm clients={CLIENTS} />);
  return userEvent.setup(options);
}

/** Fills in enough for the Send button to become usable. */
async function compose(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/subject/i), "Spring range");
  await user.type(screen.getByLabelText(/message/i), "Dear <name>,");
}

beforeEach(() => {
  createCampaign.mockClear();
});

afterEach(cleanup);

describe("sending", () => {
  it("submits the campaign when Send now is clicked in the dialog", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));

    await user.click(screen.getByRole("button", { name: /send to 1 recipient/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    // The assertion the portal bug would have failed: the action ran at all.
    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));

    const formData = createCampaign.mock.calls[0]![1];
    expect(formData.get("subject")).toBe("Spring range");
    expect(formData.get("body")).toBe("Dear <name>,");
    expect(formData.getAll("clientId")).toEqual(["c1"]);
  });

  it("sends to typed addresses as well as ticked clients", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Sakura Import Co"));
    await user.type(screen.getByLabelText(/also send to/i), "Ravi Kumar <ravi@example.com>");

    await user.click(screen.getByRole("button", { name: /send to 2 recipients/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    const formData = createCampaign.mock.calls[0]![1];
    expect(formData.getAll("clientId")).toEqual(["c2"]);
    expect(formData.get("extraEmails")).toBe("Ravi Kumar <ravi@example.com>");
  });

  it("cannot be sent with nobody to send to", async () => {
    const user = await renderForm();
    await compose(user);

    expect(screen.getByRole("button", { name: /send to 0 recipients/i })).toBeDisabled();
  });

  it("cannot be sent while an address cannot be read", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.type(screen.getByLabelText(/also send to/i), "not-an-address");

    expect(screen.getByRole("button", { name: /send to 1 recipient/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/not an email address/i);
  });

  it("does nothing when the confirmation is dismissed", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));

    await user.click(screen.getByRole("button", { name: /send to 1 recipient/i }));
    await user.click(await screen.findByRole("button", { name: /not yet/i }));

    expect(createCampaign).not.toHaveBeenCalled();
  });
});

describe("cc", () => {
  it("submits the copy list with the mailing", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.type(screen.getByLabelText(/copy to \(cc\)/i), "boss@example.com");

    await user.click(screen.getByRole("button", { name: /send to 1 recipient/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    expect(createCampaign.mock.calls[0]![1].get("cc")).toBe("boss@example.com");
  });

  it("cannot be sent with a copy address that cannot be read", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.type(screen.getByLabelText(/copy to \(cc\)/i), "not-an-address");

    expect(screen.getByRole("button", { name: /send to 1 recipient/i })).toBeDisabled();
  });

  it("takes several copy addresses at once", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.type(
      screen.getByLabelText(/copy to \(cc\)/i),
      "boss@example.com, Ravi Kumar <ravi@example.com>",
    );

    await user.click(screen.getByRole("button", { name: /send to 1 recipient/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    expect(createCampaign.mock.calls[0]![1].get("cc")).toBe(
      "boss@example.com, Ravi Kumar <ravi@example.com>",
    );
  });

  it("spells out the total when several people are copied", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.click(screen.getByLabelText("Write to Sakura Import Co"));
    await user.type(screen.getByLabelText(/copy to \(cc\)/i), "a@example.com, b@example.com");

    // Two copied on two messages is four emails — the multiplication is the
    // part people do not expect, so it is stated before the send.
    expect(screen.getByText(/4 in total/i)).toBeInTheDocument();
  });

  it("says how many copies the address will actually receive", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.click(screen.getByLabelText("Write to Sakura Import Co"));
    await user.type(screen.getByLabelText(/copy to \(cc\)/i), "boss@example.com");

    // Each client gets their own message, so a single CC lands twice here —
    // the surprising part, and the reason it is spelled out.
    expect(screen.getByText(/2 emails each/i)).toBeInTheDocument();
  });
});

describe("attachments", () => {
  /**
   * Picks files the way the browser hands them over.
   *
   * `applyAccept: false` because the input carries an `accept` list and
   * Testing Library honours it, as a file picker does — so without this a
   * disallowed file never reaches the component and the check below would
   * pass without testing anything. A real browser can still deliver one by
   * drag-and-drop, which is what that check is for.
   */
  async function attach(
    user: ReturnType<typeof userEvent.setup>,
    ...files: { name: string; type: string; bytes: number }[]
  ) {
    await user.upload(
      screen.getByLabelText("Attach files"),
      files.map((file) => new File([new Uint8Array(file.bytes)], file.name, { type: file.type })),
    );
  }

  it("submits the chosen files with the mailing", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await attach(user, { name: "catalogue.pdf", type: "application/pdf", bytes: 128 });

    await user.click(screen.getByRole("button", { name: /send to 1 recipient/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    const files = createCampaign.mock.calls[0]![1].getAll("attachment") as File[];
    expect(files.map((file) => file.name)).toEqual(["catalogue.pdf"]);
  });

  it("removes one file without losing the others", async () => {
    const user = await renderForm();
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await attach(
      user,
      { name: "keep.pdf", type: "application/pdf", bytes: 64 },
      { name: "drop.pdf", type: "application/pdf", bytes: 64 },
    );

    // A file input cannot have items taken out of it, so this is the behaviour
    // most likely to quietly lose the whole selection.
    await user.click(screen.getByRole("button", { name: "Remove drop.pdf" }));

    await user.click(screen.getByRole("button", { name: /send to 1 recipient/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1));
    const files = createCampaign.mock.calls[0]![1].getAll("attachment") as File[];
    expect(files.map((file) => file.name)).toEqual(["keep.pdf"]);
  });

  it("cannot be sent with a file that is not allowed", async () => {
    // The input carries an `accept` list, and both a real file picker and
    // Testing Library honour it — so a disallowed file has to be forced in to
    // reach the component at all. Drag-and-drop is how one arrives in a real
    // browser, and this check is what catches it there.
    const user = await renderForm({ applyAccept: false });
    await compose(user);
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await attach(user, { name: "prices.xlsx", type: "application/vnd.ms-excel", bytes: 64 });

    expect(screen.getByRole("button", { name: /send to 1 recipient/i })).toBeDisabled();
    expect(screen.getByText(/only PDFs and images can be attached/i)).toBeInTheDocument();
  });
});

describe("the chosen recipients", () => {
  it("names who is selected rather than only counting them", async () => {
    const user = await renderForm();
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));

    expect(screen.getByRole("button", { name: "Remove Meridian Foods Ltd" })).toBeInTheDocument();
  });

  it("removes a client when its name is clicked", async () => {
    const user = await renderForm();
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.click(screen.getByRole("button", { name: "Remove Meridian Foods Ltd" }));

    expect(screen.queryByRole("button", { name: "Remove Meridian Foods Ltd" })).toBeNull();
    expect(screen.getByText(/nobody chosen yet/i)).toBeInTheDocument();
  });

  it("keeps a selection that a filter has hidden", async () => {
    const user = await renderForm();
    await user.click(screen.getByLabelText("Write to Meridian Foods Ltd"));
    await user.type(screen.getByLabelText(/search clients/i), "Sakura");

    // Filtering changes what is shown, never what is selected — the chip proves
    // the hidden client is still going to be written to.
    expect(screen.queryByLabelText("Write to Meridian Foods Ltd")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Meridian Foods Ltd" })).toBeInTheDocument();
  });
});
