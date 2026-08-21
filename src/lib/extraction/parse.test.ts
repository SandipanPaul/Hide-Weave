import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanEmail,
  cleanPhone,
  cleanCompanyName,
  findContactLink,
  jsonLdNodes,
  mergeExtracted,
  parseExporter,
} from "./parse";

/**
 * Every test here runs against a page saved from a real exporter site. No
 * network: the fixtures are the contract, so a site redesign can never turn
 * this suite red for the wrong reason.
 */
const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", `${name}.html`), "utf8");

describe("parseExporter, against saved pages", () => {
  it("reads a LocalBusiness block in preference to anything else", () => {
    // barakainternational.in publishes LocalBusiness with name, phone and a
    // PostalAddress, and has no mailto anywhere.
    const result = parseExporter(fixture("barakainternational"));

    expect(result.companyName?.source).toBe("json-ld");
    // Not "Leather Goods Manufacturer in India", which is what the page's
    // LocalBusiness node calls itself.
    expect(result.companyName?.value).toBe("Baraka International");
    expect(result.phone?.source).toBe("json-ld");
    // The site's own structured data omits the country code that its tel: link
    // carries. JSON-LD is consulted first, so this is what it yields.
    expect(result.phone?.value.replace(/\D/g, "")).toBe("9831681173");
    expect(result.address?.source).toBe("json-ld");
    // A PostalAddress object, flattened into the lines people write.
    expect(result.address?.value).toMatch(/,/);
    // Nothing invented: this page really has no email on it.
    expect(result.email).toBeUndefined();
  });

  it("falls back to og:site_name when JSON-LD describes only the page", () => {
    // exelfashions publishes WebPage/WebSite/BreadcrumbList — no Organization —
    // so the company name must come from Open Graph, not from WebPage.name.
    const html = fixture("exelfashions");
    const types = jsonLdNodes(html).map((node) => node["@type"]);
    expect(types).toContain("WebPage");
    expect(types).not.toContain("Organization");

    const result = parseExporter(html);
    expect(result.companyName?.source).toBe("meta");
    expect(result.companyName?.value).toMatch(/XL Enterprises/i);
    expect(result.email?.value).toBe("query@exelfashions.com");
    expect(result.phone?.value.replace(/\D/g, "")).toBe("919871751507");
  });

  it("takes the address from a mailto link when there is no structured data", () => {
    // asianleather.com has neither JSON-LD nor og tags.
    const result = parseExporter(fixture("asianleather"));

    expect(result.email).toEqual({ value: "mail@asianleather.com", source: "link" });
    expect(result.companyName?.source).toBe("title");
    expect(result.companyName?.value).toBe("Asian Leather");
  });

  it("reads both a mailto and a tel from a plain page", () => {
    const result = parseExporter(fixture("nsleather"));

    expect(result.email?.value).toBe("niranjansutradhar@nsleather.com");
    expect(result.email?.source).toBe("link");
    expect(result.phone?.value.replace(/\D/g, "")).toBe("919831203522");
    expect(result.companyName?.value).toBe("NS Leather");
  });

  it("prefers an Organization node over the page's own og tags", () => {
    // mushleather publishes both; the Organization is the business.
    const result = parseExporter(fixture("mushleather"));

    expect(result.companyName?.source).toBe("json-ld");
    expect(result.companyName?.value).toMatch(/mush/i);
    expect(result.email?.value).toBe("customercare@mushleather.com");
  });

  it("ignores a malformed tel: link rather than importing nonsense", () => {
    // mushleather's markup contains `tel:++91`, which is not a phone number.
    const html = fixture("mushleather");
    expect(html).toContain("tel:++91");

    const phone = parseExporter(html).phone;
    // Either a real number found elsewhere, or nothing — never "++91".
    if (phone) expect(phone.value.replace(/\D/g, "").length).toBeGreaterThanOrEqual(7);
  });

  it("finds only a title in an app shell, and reports it as such", () => {
    // dugrosleatherindia.com is an Angular page whose HTML has no content, so
    // the only thing to read is the browser tab's text. It is still offered —
    // a name to correct beats an empty form — but it is labelled as a guess
    // from the title so it is obvious what it is.
    const result = parseExporter(fixture("dugrosleatherindia"));

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
    expect(result.address).toBeUndefined();
    expect(result.companyName?.source).toBe("title");
  });

  it("refuses a placeholder title, but still reads a number out of the text", () => {
    // klasseleather.com's title is literally "Wordpress Site", and it has no
    // structured data, no og tags and no tel: link — just a number on the page.
    const result = parseExporter(fixture("klasseleather"));

    expect(result.companyName).toBeUndefined();
    expect(result.phone?.source).toBe("text");
    expect(result.phone?.value.replace(/\D/g, "")).toBe("919831172150");
  });

  it("never returns an address belonging to the site's tooling", () => {
    for (const name of ["asianleather", "exelfashions", "mushleather", "nsleather"]) {
      const email = parseExporter(fixture(name)).email?.value;
      if (email) {
        expect(email).not.toMatch(/sentry|wixpress|example\.com|\.png$/);
      }
    }
  });
});

describe("findContactLink", () => {
  it("finds one contact page on a real site", () => {
    const link = findContactLink(fixture("barakainternational"), "https://barakainternational.in/");
    expect(link).toMatch(/^https:\/\/barakainternational\.in\//);
    expect(link?.toLowerCase()).toMatch(/contact|about/);
  });

  it("prefers a contact page over an about page", () => {
    const html = `
      <a href="/about-us">About us</a>
      <a href="/contact">Contact</a>
      <a href="/impressum">Impressum</a>`;
    expect(findContactLink(html, "https://example.test/")).toBe("https://example.test/contact");
  });

  it("stays on the same site", () => {
    const html = `<a href="https://facebook.example/pages/contact">Contact us</a>`;
    expect(findContactLink(html, "https://example.test/")).toBeNull();
  });

  it("ignores fragments, mailto links and the page it is already on", () => {
    const html = `
      <a href="#contact">Contact</a>
      <a href="mailto:x@example.test">Contact</a>
      <a href="/">Contact</a>`;
    expect(findContactLink(html, "https://example.test/")).toBeNull();
  });

  it("returns null when there is nothing contact-ish", () => {
    expect(findContactLink(`<a href="/products">Products</a>`, "https://example.test/")).toBeNull();
  });
});

describe("field cleaning", () => {
  it("rejects addresses that only look like emails", () => {
    expect(cleanEmail("logo@2x.png")).toBeNull();
    expect(cleanEmail("abc123@sentry.io")).toBeNull();
    expect(cleanEmail("someone@example.com")).toBeNull();
    expect(cleanEmail("not-an-email")).toBeNull();
    expect(cleanEmail("MAIL@AsianLeather.com")).toBe("mail@asianleather.com");
    expect(cleanEmail("mailto:info@torerocorp.com")).toBe("info@torerocorp.com");
  });

  it("rejects digit strings that are not phone numbers", () => {
    expect(cleanPhone("++91")).toBeNull();
    expect(cleanPhone("2024")).toBeNull();
    expect(cleanPhone("1234567890123456789")).toBeNull();
    expect(cleanPhone("")).toBeNull();
  });

  it("keeps a phone number readable", () => {
    expect(cleanPhone("+91 98316 81173")).toBe("+91 98316 81173");
    expect(cleanPhone("033-2345 6789")).toBe("033-2345 6789");
  });

  it("takes the company name from the first segment of a title", () => {
    expect(cleanCompanyName("Asian Leather | Indian Leather Goods Manufacturer")).toBe(
      "Asian Leather",
    );
    expect(cleanCompanyName("Torero Corporation – Leather bag manufacturer")).toBe(
      "Torero Corporation",
    );
    expect(cleanCompanyName("XL Enterprises Limited - Leather Goods Manufacturer")).toBe(
      "XL Enterprises Limited",
    );
    expect(cleanCompanyName("Wordpress Site")).toBeNull();
    expect(cleanCompanyName("Home")).toBeNull();
    // The title of a contact page, reached by following a link from the home
    // page — the page is about contacting them, it is not their name.
    expect(cleanCompanyName("Contact Us")).toBeNull();
  });

  it("does not mistake a date for a phone number", () => {
    // triogroup.in prints "2022-09-13" in its footer, which has eight digits
    // and separators a phone number is allowed to use.
    expect(cleanPhone("2022-09-13")).toBeNull();
    expect(cleanPhone("13/09/2022")).toBeNull();
    expect(cleanPhone("2022.09.13")).toBeNull();
    // Still a phone number, despite the dashes.
    expect(cleanPhone("033-2345-6789")).toBe("033-2345-6789");
  });
});

describe("mergeExtracted", () => {
  it("lets a second page fill only the gaps the first left", () => {
    const home = { companyName: { value: "Baraka", source: "json-ld" as const } };
    const contact = {
      companyName: { value: "Contact Us", source: "title" as const },
      email: { value: "info@baraka.test", source: "link" as const },
    };
    const merged = mergeExtracted(home, contact);

    expect(merged.companyName?.value).toBe("Baraka");
    expect(merged.email?.value).toBe("info@baraka.test");
  });
});
