import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "./robots";

const UA = "HideAndWeave";

describe("isAllowed", () => {
  it("allows everything when there is no robots.txt", () => {
    expect(isAllowed(null, "/", UA)).toBe(true);
    expect(isAllowed("", "/contact", UA)).toBe(true);
  });

  it("respects a blanket disallow", () => {
    expect(isAllowed("User-agent: *\nDisallow: /", "/", UA)).toBe(false);
    expect(isAllowed("User-agent: *\nDisallow: /", "/contact", UA)).toBe(false);
  });

  it("treats an empty Disallow as permission, not prohibition", () => {
    expect(isAllowed("User-agent: *\nDisallow:", "/anything", UA)).toBe(true);
  });

  it("only blocks the paths it names", () => {
    const robots = "User-agent: *\nDisallow: /wp-admin/\nDisallow: /cart";
    expect(isAllowed(robots, "/wp-admin/options.php", UA)).toBe(false);
    expect(isAllowed(robots, "/cart", UA)).toBe(false);
    expect(isAllowed(robots, "/contact", UA)).toBe(true);
  });

  it("lets a longer Allow override a broader Disallow", () => {
    const robots = "User-agent: *\nDisallow: /\nAllow: /contact";
    expect(isAllowed(robots, "/contact", UA)).toBe(true);
    expect(isAllowed(robots, "/products", UA)).toBe(false);
  });

  it("prefers a group naming us over the wildcard group", () => {
    const robots = `User-agent: *
Disallow:

User-agent: HideAndWeave
Disallow: /`;
    expect(isAllowed(robots, "/", UA)).toBe(false);
    expect(isAllowed(robots, "/", "SomeoneElse")).toBe(true);
  });

  it("understands wildcards and end-anchored patterns", () => {
    const robots = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /private/*/secret";
    expect(isAllowed(robots, "/brochure.pdf", UA)).toBe(false);
    expect(isAllowed(robots, "/brochure.pdf.html", UA)).toBe(true);
    expect(isAllowed(robots, "/private/a/secret", UA)).toBe(false);
  });

  it("ignores comments and directives that are not rules", () => {
    const robots = `# a comment
Sitemap: https://example.test/sitemap.xml
User-agent: *   # trailing comment
Crawl-delay: 10
Disallow: /admin`;
    expect(isAllowed(robots, "/admin", UA)).toBe(false);
    expect(isAllowed(robots, "/", UA)).toBe(true);
  });
});

describe("parseRobots", () => {
  it("shares one rule set between consecutive user-agent lines", () => {
    const groups = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x");
    expect(groups).toHaveLength(1);
    expect(groups[0].agents).toEqual(["a", "b"]);
    expect(groups[0].rules).toEqual([{ allow: false, path: "/x" }]);
  });

  it("starts a new group when a user-agent follows a rule", () => {
    const groups = parseRobots("User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y");
    expect(groups).toHaveLength(2);
  });
});
