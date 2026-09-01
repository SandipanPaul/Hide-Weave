import { describe, expect, it } from "vitest";
import {
  addDaysUtc,
  addMonthsUtc,
  dateOnlyToUtc,
  daysBetween,
  formatDateOnly,
  monthKey,
  todayUtc,
  utcToDateOnly,
} from "@/lib/dates";

/**
 * Date-only values are stored at UTC midnight and must stay there.
 *
 * Untested until now, and underneath every finance figure in the app: a
 * finance range that shifts by a day silently moves payments between months,
 * which is the kind of wrong nobody notices until a total is questioned.
 */

describe("dateOnlyToUtc / utcToDateOnly", () => {
  it("lands on UTC midnight, not local midnight", () => {
    const date = dateOnlyToUtc("2026-08-19");
    expect(date.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(date.getUTCHours()).toBe(0);
  });

  it("round-trips", () => {
    for (const value of ["2026-01-01", "2026-08-19", "2026-12-31"]) {
      expect(utcToDateOnly(dateOnlyToUtc(value))).toBe(value);
    }
  });

  it("keeps the day for someone west of Greenwich", () => {
    // Formatting a UTC-midnight date in local time would show the day before
    // anywhere with a negative offset. The formatter pins the zone to UTC.
    expect(formatDateOnly(dateOnlyToUtc("2026-08-19"))).toBe("19 Aug 2026");
  });

  it("shows a dash rather than inventing a date", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly(undefined)).toBe("—");
  });
});

describe("todayUtc", () => {
  it("strips the time, whatever time of day it is", () => {
    const lateEvening = new Date("2026-08-19T23:59:59.999Z");
    expect(todayUtc(lateEvening).toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });
});

describe("addDaysUtc", () => {
  it("adds and subtracts days", () => {
    expect(utcToDateOnly(addDaysUtc(dateOnlyToUtc("2026-08-19"), 5))).toBe("2026-08-24");
    expect(utcToDateOnly(addDaysUtc(dateOnlyToUtc("2026-08-19"), -19))).toBe("2026-07-31");
  });

  it("crosses a daylight-saving change without losing an hour", () => {
    // The reason every one of these works in UTC. In a local-time
    // implementation this lands at 23:00 the day before, in Europe.
    const beforeUkClockChange = dateOnlyToUtc("2026-03-28");
    const after = addDaysUtc(beforeUkClockChange, 2);
    expect(after.toISOString()).toBe("2026-03-30T00:00:00.000Z");
  });

  it("crosses a leap day", () => {
    expect(utcToDateOnly(addDaysUtc(dateOnlyToUtc("2028-02-28"), 1))).toBe("2028-02-29");
  });

  it("does not mutate what it was given", () => {
    const original = dateOnlyToUtc("2026-08-19");
    addDaysUtc(original, 10);
    expect(utcToDateOnly(original)).toBe("2026-08-19");
  });
});

describe("addMonthsUtc", () => {
  it("adds months", () => {
    expect(utcToDateOnly(addMonthsUtc(dateOnlyToUtc("2026-01-15"), 2))).toBe("2026-03-15");
  });

  it("rolls a short month forward rather than clamping", () => {
    // 31 January plus a month is 3 March in a non-leap year, because that is
    // what setUTCMonth does. Pinned here because it is surprising, and because
    // anything reading this for a monthly schedule needs to know.
    expect(utcToDateOnly(addMonthsUtc(dateOnlyToUtc("2026-01-31"), 1))).toBe("2026-03-03");
  });

  it("crosses a year", () => {
    expect(utcToDateOnly(addMonthsUtc(dateOnlyToUtc("2026-11-15"), 3))).toBe("2027-02-15");
  });

  it("does not mutate what it was given", () => {
    const original = dateOnlyToUtc("2026-01-15");
    addMonthsUtc(original, 6);
    expect(utcToDateOnly(original)).toBe("2026-01-15");
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween(dateOnlyToUtc("2026-08-19"), dateOnlyToUtc("2026-08-24"))).toBe(5);
    expect(daysBetween(dateOnlyToUtc("2026-08-24"), dateOnlyToUtc("2026-08-19"))).toBe(-5);
    expect(daysBetween(dateOnlyToUtc("2026-08-19"), dateOnlyToUtc("2026-08-19"))).toBe(0);
  });

  it("ignores the time of day on either side", () => {
    // Otherwise "overdue by 1 day" flickers depending on when the page is
    // opened.
    const morning = new Date("2026-08-19T08:00:00.000Z");
    const night = new Date("2026-08-20T23:00:00.000Z");
    expect(daysBetween(morning, night)).toBe(1);
  });
});

describe("monthKey", () => {
  it("buckets by UTC month", () => {
    expect(monthKey(dateOnlyToUtc("2026-08-19"))).toBe("2026-08");
    // The last instant of a month must not fall into the next one.
    expect(monthKey(new Date("2026-08-31T23:59:59.999Z"))).toBe("2026-08");
    expect(monthKey(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09");
  });
});
