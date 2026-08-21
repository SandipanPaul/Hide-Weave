import { describe, expect, it } from "vitest";
import { buildListHref, filterHref, paginate, parseListParams, sortHref } from "./list-params";

const options = { allowedSorts: ["name", "email", "openProjects"], defaultSort: "name" };

describe("parseListParams", () => {
  it("falls back to defaults when nothing is in the URL", () => {
    expect(parseListParams({}, options)).toEqual({
      q: "",
      sort: "name",
      dir: "asc",
      page: 1,
      filters: {},
    });
  });

  it("ignores a sort column that isn't allowed, rather than passing it to the database", () => {
    // This value reaches an orderBy, so an unrecognised column must not survive.
    expect(parseListParams({ sort: "password" }, options).sort).toBe("name");
    expect(parseListParams({ sort: "openProjects" }, options).sort).toBe("openProjects");
  });

  it("clamps a nonsense page to 1 instead of erroring", () => {
    expect(parseListParams({ page: "-3" }, options).page).toBe(1);
    expect(parseListParams({ page: "abc" }, options).page).toBe(1);
    expect(parseListParams({ page: "4.7" }, options).page).toBe(4);
  });

  it("accepts only the two sort directions", () => {
    expect(parseListParams({ dir: "sideways" }, options).dir).toBe("asc");
    expect(parseListParams({ dir: "desc" }, options).dir).toBe("desc");
  });

  it("trims and caps the search term", () => {
    expect(parseListParams({ q: "  konkan  " }, options).q).toBe("konkan");
    expect(parseListParams({ q: "x".repeat(500) }, options).q).toHaveLength(200);
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseListParams({ q: ["first", "second"] }, options).q).toBe("first");
  });
});

describe("buildListHref", () => {
  const current = { q: "tea", sort: "name", dir: "asc" as const, page: 3, filters: {} };

  it("preserves the other params when one changes", () => {
    expect(buildListHref("/clients", current, { page: 4 })).toBe(
      "/clients?q=tea&sort=name&dir=asc&page=4",
    );
  });

  it("omits page 1 and an empty search to keep URLs clean", () => {
    expect(buildListHref("/clients", { ...current, q: "", page: 1 }, {})).toBe(
      "/clients?sort=name&dir=asc",
    );
  });

  it("encodes search terms safely", () => {
    expect(buildListHref("/clients", { ...current, q: "a&b=c" }, {})).toContain("q=a%26b%3Dc");
  });
});

describe("filters", () => {
  const withFilters = {
    q: "",
    sort: "orderDate",
    dir: "desc" as const,
    page: 2,
    filters: { status: "SHIPPED", clientId: "abc" },
  };

  it("only reads the keys the list declares, ignoring junk in the URL", () => {
    const params = parseListParams(
      { status: "SHIPPED", clientId: "abc", nonsense: "x", from: "  " },
      { allowedSorts: ["orderDate"], defaultSort: "orderDate", filterKeys: ["status", "clientId", "from"] },
    );
    // A blank filter is absent, not an empty string to be matched against.
    expect(params.filters).toEqual({ status: "SHIPPED", clientId: "abc" });
  });

  it("carries filters through sorting and paging", () => {
    const href = sortHref("/projects", withFilters, "orderValue");
    expect(href).toContain("status=SHIPPED");
    expect(href).toContain("clientId=abc");
  });

  it("drops a filter from the URL when it is cleared", () => {
    const href = filterHref("/projects", withFilters, "status", null);
    expect(href).not.toContain("status");
    expect(href).toContain("clientId=abc");
  });

  it("returns to page 1 when a filter changes, since the old page is meaningless", () => {
    expect(filterHref("/projects", withFilters, "status", "QUOTED")).not.toContain("page=");
  });
});

describe("sortHref", () => {
  const current = { q: "", sort: "name", dir: "asc" as const, page: 5, filters: {} };

  it("flips direction when the active column is clicked again", () => {
    expect(sortHref("/clients", current, "name")).toContain("dir=desc");
  });

  it("starts a new column at its natural direction", () => {
    // Counts are most useful highest-first, so that column opens descending.
    expect(sortHref("/clients", current, "openProjects", "desc")).toContain("dir=desc");
    expect(sortHref("/clients", current, "email", "asc")).toContain("dir=asc");
  });

  it("returns to page 1, because the old page number means nothing now", () => {
    expect(sortHref("/clients", current, "email")).not.toContain("page=");
  });
});

describe("paginate", () => {
  it("describes a partial final page", () => {
    const result = paginate(120, 3, 50);
    expect(result).toMatchObject({ page: 3, pageCount: 3, from: 101, to: 120, skip: 100 });
  });

  it("clamps a page beyond the end rather than showing an empty table", () => {
    expect(paginate(60, 99, 50).page).toBe(2);
  });

  it("reports one empty page when there are no rows at all", () => {
    expect(paginate(0, 1, 50)).toMatchObject({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });

  it("fills exactly when the total is a multiple of the page size", () => {
    expect(paginate(100, 2, 50)).toMatchObject({ pageCount: 2, from: 51, to: 100 });
  });
});
