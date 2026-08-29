import { describe, expect, it } from "vitest";
import { parseExtraRecipients, withoutClientAddresses } from "@/lib/mail/recipients";

describe("parseExtraRecipients", () => {
  it("reads a bare address", () => {
    const { recipients, invalid } = parseExtraRecipients("jane@example.com");
    expect(invalid).toEqual([]);
    expect(recipients).toEqual([
      {
        email: "jane@example.com",
        greeting: "Jane",
        label: "jane@example.com",
        greetingGuessed: true,
      },
    ]);
  });

  it("reads a name and address, and does not guess the greeting", () => {
    const { recipients } = parseExtraRecipients("Jane Doe <jane@example.com>");
    expect(recipients[0]).toMatchObject({
      email: "jane@example.com",
      greeting: "Jane",
      label: "Jane Doe",
      greetingGuessed: false,
    });
  });

  it("strips an honorific from a given name, as it does for clients", () => {
    expect(parseExtraRecipients("Dr. Lena Fischer <l@x.com>").recipients[0].greeting).toBe("Lena");
  });

  it("splits on commas, semicolons and newlines", () => {
    const { recipients } = parseExtraRecipients("a@x.com, b@x.com; c@x.com\nd@x.com");
    expect(recipients.map((r) => r.email)).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });

  it("keeps a display name containing a comma", () => {
    // Mail clients quote these; splitting naively would break the entry in two.
    const { recipients, invalid } = parseExtraRecipients('"Doe, Jane" <jane@x.com>');
    expect(invalid).toEqual([]);
    expect(recipients[0]).toMatchObject({ email: "jane@x.com", label: "Doe, Jane" });
  });

  it("does not split on a slash, which appears in names", () => {
    expect(parseExtraRecipients("Joy/New <joy@x.com>").recipients).toHaveLength(1);
  });

  it("reports what it could not read rather than dropping it", () => {
    // Silently ignoring a typo means someone simply never hears from you.
    const { recipients, invalid } = parseExtraRecipients("good@x.com, not-an-address, @nope");
    expect(recipients.map((r) => r.email)).toEqual(["good@x.com"]);
    expect(invalid).toEqual(["not-an-address", "@nope"]);
  });

  it("de-duplicates by address, keeping the spelling that has a name", () => {
    const { recipients } = parseExtraRecipients("Jane Doe <jane@x.com>, JANE@x.com");
    expect(recipients).toHaveLength(1);
    expect(recipients[0].label).toBe("Jane Doe");
  });

  it("guesses a first name from a dotted address", () => {
    expect(parseExtraRecipients("jane.doe@x.com").recipients[0].greeting).toBe("Jane");
  });

  it("marks a greeting it had to guess badly", () => {
    // "Dear Info" is wrong, and the screen shows this so it can be corrected.
    expect(parseExtraRecipients("info@x.com").recipients[0]).toMatchObject({
      greeting: "Info",
      greetingGuessed: true,
    });
  });

  it("is empty for empty input", () => {
    expect(parseExtraRecipients("")).toEqual({ recipients: [], invalid: [] });
    expect(parseExtraRecipients(null)).toEqual({ recipients: [], invalid: [] });
    expect(parseExtraRecipients("  ,  ; \n ")).toEqual({ recipients: [], invalid: [] });
  });
});

describe("withoutClientAddresses", () => {
  it("drops a typed address a chosen client already covers", () => {
    const { recipients } = parseExtraRecipients("jane@x.com, other@y.com");
    const kept = withoutClientAddresses(recipients, ["JANE@X.COM"]);
    expect(kept.map((r) => r.email)).toEqual(["other@y.com"]);
  });

  it("keeps everything when no client matches", () => {
    const { recipients } = parseExtraRecipients("jane@x.com");
    expect(withoutClientAddresses(recipients, ["someone@else.com"])).toHaveLength(1);
  });
});
