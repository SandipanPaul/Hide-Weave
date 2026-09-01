import { describe, expect, it } from "vitest";
import { foldCase, matchByKey } from "@/lib/keys";

/**
 * Uniqueness is enforced in JS, not by the database, so that deleting a record
 * frees its name for reuse. That makes these two functions the whole of
 * duplicate detection — for client names, supplier names, order IDs and
 * websites alike. Production has already accumulated duplicate clients once.
 */

const rows = [
  { id: "1", name: "Oakhide" },
  { id: "2", name: "Bellroy" },
  { id: "3", name: "" },
];

describe("foldCase", () => {
  it("ignores case and surrounding space", () => {
    expect(foldCase("  Oakhide ")).toBe("oakhide");
    expect(foldCase("OAKHIDE")).toBe(foldCase("oakhide"));
  });

  it("treats nothing as an empty key", () => {
    expect(foldCase(null)).toBe("");
    expect(foldCase(undefined)).toBe("");
    expect(foldCase("   ")).toBe("");
  });

  it("does not fold away a difference that matters", () => {
    // Names that only differ inside are still different names.
    expect(foldCase("Oak Hide")).not.toBe(foldCase("Oakhide"));
  });
});

describe("matchByKey", () => {
  const byName = (row: { name: string }) => foldCase(row.name);

  it("finds a row whatever the case", () => {
    expect(matchByKey(rows, byName, foldCase("OAKHIDE"))?.id).toBe("1");
  });

  it("returns null when nothing matches", () => {
    expect(matchByKey(rows, byName, foldCase("Tanner"))).toBeNull();
  });

  it("ignores the record being edited", () => {
    // Otherwise saving a record without changing its name reports it as a
    // duplicate of itself, and nothing can ever be edited.
    expect(matchByKey(rows, byName, foldCase("Oakhide"), "1")).toBeNull();
    expect(matchByKey(rows, byName, foldCase("Oakhide"), "2")?.id).toBe("1");
  });

  it("never matches on an empty key", () => {
    // A supplier with no website must not collide with every other supplier
    // that has no website.
    expect(matchByKey(rows, byName, "")).toBeNull();
    expect(matchByKey(rows, byName, foldCase("   "))).toBeNull();
  });

  it("returns the first match when a list already holds duplicates", () => {
    const withDupes = [...rows, { id: "4", name: "oakhide" }];
    expect(matchByKey(withDupes, byName, foldCase("Oakhide"))?.id).toBe("1");
  });
});
