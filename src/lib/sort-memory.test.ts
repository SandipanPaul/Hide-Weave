import { describe, expect, it } from "vitest";
import {
  formatRememberedSort,
  parseRememberedSort,
  sortCookieName,
} from "./sort-memory";
import { parseListParams } from "./list-params";

describe("remembered sort", () => {
  it("round-trips a column and direction", () => {
    expect(parseRememberedSort(formatRememberedSort("status", "desc"))).toEqual({
      sort: "status",
      dir: "desc",
    });
  });

  it("keeps each list's preference separate", () => {
    expect(sortCookieName("clients")).not.toBe(sortCookieName("projects"));
  });

  it("ignores anything malformed rather than throwing", () => {
    for (const value of [undefined, "", ":", ":asc"]) {
      expect(parseRememberedSort(value), String(value)).toEqual({});
    }
  });

  it("drops a direction it does not recognise but keeps the column", () => {
    expect(parseRememberedSort("status:sideways")).toEqual({ sort: "status", dir: undefined });
  });

  it("survives a value with no direction at all", () => {
    expect(parseRememberedSort("status")).toEqual({ sort: "status", dir: undefined });
  });
});

describe("remembered sort feeding the list params", () => {
  const options = { allowedSorts: ["name", "status", "country"] as const };

  /** Mirrors what rememberedSort() does once the cookie has been read. */
  const resolve = (stored: string | undefined) => {
    const remembered = parseRememberedSort(stored);
    return {
      sort:
        remembered.sort && options.allowedSorts.includes(remembered.sort as "name")
          ? remembered.sort
          : "name",
      dir: remembered.dir ?? ("asc" as const),
    };
  };

  it("sorts by the remembered column when the URL says nothing", () => {
    const remembered = resolve("status:desc");
    const params = parseListParams(
      {},
      { ...options, defaultSort: remembered.sort, defaultDir: remembered.dir },
    );
    expect(params.sort).toBe("status");
    expect(params.dir).toBe("desc");
  });

  it("lets the URL win, so a shared link still means what it says", () => {
    const remembered = resolve("status:desc");
    const params = parseListParams(
      { sort: "country", dir: "asc" },
      { ...options, defaultSort: remembered.sort, defaultDir: remembered.dir },
    );
    expect(params.sort).toBe("country");
    expect(params.dir).toBe("asc");
  });

  it("falls back to the real default when the remembered column is gone", () => {
    // A year-old cookie naming a column the app no longer has must not reach
    // the database as an orderBy — parseListParams trusts its defaultSort.
    const remembered = resolve("retired-column:asc");
    const params = parseListParams(
      {},
      { ...options, defaultSort: remembered.sort, defaultDir: remembered.dir },
    );
    expect(params.sort).toBe("name");
  });

  it("does not remember the search, the page or any filter", () => {
    // Coming back to a list silently filtered to one client, with no hint why
    // it looks empty, is help nobody asks for twice.
    const stored = formatRememberedSort("status", "asc");
    expect(stored).not.toMatch(/q=|page=|filter/);
    expect(parseRememberedSort(stored)).toEqual({ sort: "status", dir: "asc" });
  });
});
