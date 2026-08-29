import { describe, expect, it } from "vitest";
import { greetingFor, hasPlaceholder, renderBody, toHtml } from "@/lib/mail/template";

describe("greetingFor", () => {
  it("uses the contact person's first name", () => {
    expect(greetingFor({ name: "Meridian Foods Ltd", contactPerson: "Daniel Okoro" })).toBe(
      "Daniel",
    );
  });

  it("strips an honorific so the greeting is not 'Dear Mr'", () => {
    expect(greetingFor({ name: "Acme", contactPerson: "Mr. Daniel Okoro" })).toBe("Daniel");
    expect(greetingFor({ name: "Acme", contactPerson: "Dr Lena Fischer" })).toBe("Lena");
  });

  it("falls back to the whole company name, never its first word", () => {
    expect(greetingFor({ name: "Meridian Foods Ltd", contactPerson: null })).toBe(
      "Meridian Foods Ltd",
    );
    expect(greetingFor({ name: "Meridian Foods Ltd", contactPerson: "   " })).toBe(
      "Meridian Foods Ltd",
    );
  });

  it("handles a single-word contact person", () => {
    expect(greetingFor({ name: "Acme", contactPerson: "Ahmed" })).toBe("Ahmed");
  });
});

describe("renderBody", () => {
  it("replaces every occurrence, not just the first", () => {
    expect(renderBody("Dear <name>, thank you <name>.", "Lena")).toBe(
      "Dear Lena, thank you Lena.",
    );
  });

  it("matches the placeholder whatever its case", () => {
    expect(renderBody("Dear <Name>,", "Lena")).toBe("Dear Lena,");
  });

  it("leaves other angle-bracket text alone", () => {
    expect(renderBody("Quote <ref> for <name>", "Lena")).toBe("Quote <ref> for Lena");
  });

  it("returns the body untouched when there is no placeholder", () => {
    expect(renderBody("Our new range is out.", "Lena")).toBe("Our new range is out.");
  });
});

describe("hasPlaceholder", () => {
  it("does not change its answer when asked twice", () => {
    // A /g regex advances lastIndex between .test() calls; this is the guard
    // against that bug coming back.
    const body = "Dear <name>,";
    expect(hasPlaceholder(body)).toBe(true);
    expect(hasPlaceholder(body)).toBe(true);
  });

  it("is false for a body that names nobody", () => {
    expect(hasPlaceholder("Our new range is out.")).toBe(false);
  });
});

describe("toHtml", () => {
  it("keeps line breaks and escapes the rest", () => {
    expect(toHtml("a & b\n<c>")).toBe("a &amp; b<br>\n&lt;c&gt;");
  });

  it("does not let a client's name inject markup", () => {
    const text = renderBody("Dear <name>,", "<script>alert(1)</script>");
    expect(toHtml(text)).toBe("Dear &lt;script&gt;alert(1)&lt;/script&gt;,");
  });
});
