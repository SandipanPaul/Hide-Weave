import { describe, expect, it } from "vitest";
import { displayHost, normalizeWebsite, websiteKey } from "./url";

describe("normalizeWebsite", () => {
  it("assumes https when someone types a bare domain", () => {
    expect(normalizeWebsite("asianleather.com")).toBe("https://asianleather.com");
    expect(normalizeWebsite("  klasseleather.com  ")).toBe("https://klasseleather.com");
  });

  it("keeps the scheme that was given", () => {
    expect(normalizeWebsite("http://nsleather.com")).toBe("http://nsleather.com");
  });

  it("lower-cases the scheme and host but never the path", () => {
    expect(normalizeWebsite("HTTPS://WWW.TrioGroup.IN/About-Us")).toBe(
      "https://www.triogroup.in/About-Us",
    );
  });

  it("drops a bare trailing slash, keeping a real path", () => {
    expect(normalizeWebsite("https://www.torerocorp.com/")).toBe("https://www.torerocorp.com");
    expect(normalizeWebsite("https://mushleather.com/contact/")).toBe(
      "https://mushleather.com/contact/",
    );
  });

  it("drops the fragment, which never identifies a different site", () => {
    expect(normalizeWebsite("https://barakainternational.in/#contact")).toBe(
      "https://barakainternational.in",
    );
  });

  it("refuses anything that is not a web address", () => {
    expect(normalizeWebsite("mailto:info@example.com")).toBeNull();
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("ftp://files.example.com")).toBeNull();
    expect(normalizeWebsite("not a url")).toBeNull();
    // No dot, so not a public site — this is how "localhost" is kept out.
    expect(normalizeWebsite("localhost:3000")).toBeNull();
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
  });
});

describe("websiteKey", () => {
  it("treats the same site written four ways as one", () => {
    const forms = [
      "https://www.asianleather.com/",
      "http://asianleather.com",
      "ASIANLEATHER.COM",
      "https://www.asianleather.com",
    ];
    const keys = new Set(forms.map(websiteKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("asianleather.com");
  });

  it("keeps genuinely different sites apart", () => {
    expect(websiteKey("https://nsleather.com")).not.toBe(websiteKey("https://mushleather.com"));
    // A subdomain is a different host, not a "www" variant.
    expect(websiteKey("https://shop.exelfashions.com")).not.toBe(
      websiteKey("https://exelfashions.com"),
    );
  });

  it("is empty for a missing or unusable website, so it never matches", () => {
    expect(websiteKey(null)).toBe("");
    expect(websiteKey("not a url")).toBe("");
  });
});

describe("displayHost", () => {
  it("reduces a URL to the domain people recognise", () => {
    expect(displayHost("https://www.dugrosleatherindia.com/")).toBe("dugrosleatherindia.com");
    expect(displayHost("https://balajiexport.com/products")).toBe("balajiexport.com");
    expect(displayHost(null)).toBe("");
  });
});
