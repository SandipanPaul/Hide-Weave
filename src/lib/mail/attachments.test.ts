import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  checkAttachments,
  formatBytes,
  isAllowedType,
  resolveContentType,
} from "@/lib/mail/attachments";

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe("isAllowedType", () => {
  it("accepts PDFs and images", () => {
    expect(isAllowedType(file("catalogue.pdf", "application/pdf"))).toBe(true);
    expect(isAllowedType(file("bag.jpg", "image/jpeg"))).toBe(true);
    expect(isAllowedType(file("bag.png", "image/png"))).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isAllowedType(file("prices.xlsx", "application/vnd.ms-excel"))).toBe(false);
    expect(isAllowedType(file("setup.exe", "application/x-msdownload"))).toBe(false);
  });

  it("falls back to the extension when the browser reports no type", () => {
    // Some platforms send an empty type for perfectly ordinary files, and
    // refusing those would reject real PDFs.
    expect(isAllowedType(file("catalogue.pdf", ""))).toBe(true);
    expect(isAllowedType(file("archive.zip", ""))).toBe(false);
  });

  it("trusts a reported type over the extension", () => {
    // A file named .pdf that the browser knows is a zip is a zip.
    expect(isAllowedType(file("notreally.pdf", "application/zip"))).toBe(false);
  });
});

describe("resolveContentType", () => {
  it("keeps the reported type", () => {
    expect(resolveContentType(file("a.pdf", "application/pdf"))).toBe("application/pdf");
  });

  it("derives one from the extension when there is none", () => {
    expect(resolveContentType(file("a.PDF", ""))).toBe("application/pdf");
    expect(resolveContentType(file("photo.jpeg", ""))).toBe("image/jpeg");
  });
});

describe("checkAttachments", () => {
  it("passes an ordinary selection", () => {
    const { problems, totalBytes } = checkAttachments([
      file("catalogue.pdf", "application/pdf", 2_000_000),
      file("bag.jpg", "image/jpeg", 500_000),
    ]);
    expect(problems).toEqual([]);
    expect(totalBytes).toBe(2_500_000);
  });

  it("reports every problem at once, not just the first", () => {
    // Fixing six files one refusal at a time is six round trips.
    const { problems } = checkAttachments([
      file("a.exe", "application/x-msdownload", 10),
      file("b.zip", "application/zip", 10),
    ]);
    expect(problems).toHaveLength(2);
  });

  it("refuses a single file over the per-file limit", () => {
    const { problems } = checkAttachments([
      file("huge.pdf", "application/pdf", MAX_FILE_BYTES + 1),
    ]);
    expect(problems[0]).toMatchObject({ filename: "huge.pdf" });
    expect(problems[0].reason).toContain("over the");
  });

  it("refuses a selection over the total limit even when each file is fine", () => {
    const half = MAX_TOTAL_BYTES / 2 + 1;
    const { problems } = checkAttachments([
      file("a.pdf", "application/pdf", half),
      file("b.pdf", "application/pdf", half),
    ]);
    // Named against the mailing, not against either file — neither is at fault.
    expect(problems).toHaveLength(1);
    expect(problems[0].filename).toBe("");
    expect(problems[0].reason).toContain("one mailing");
  });

  it("refuses an empty file", () => {
    const { problems } = checkAttachments([file("empty.pdf", "application/pdf", 0)]);
    expect(problems[0].reason).toContain("empty");
  });

  it("is happy with nothing attached", () => {
    expect(checkAttachments([])).toEqual({ problems: [], totalBytes: 0 });
  });
});

describe("formatBytes", () => {
  it("reads the way a person would say it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5_242_880)).toBe("5.0 MB");
  });
});

describe("ACCEPT_ATTRIBUTE", () => {
  it("offers both the types and the extensions to the file picker", () => {
    expect(ACCEPT_ATTRIBUTE).toContain("application/pdf");
    expect(ACCEPT_ATTRIBUTE).toContain(".pdf");
    expect(ACCEPT_ATTRIBUTE).not.toContain(".exe");
  });
});
