/** Hands the browser a generated file. Client-side only. */
export function downloadCsv(filename: string, contents: string) {
  // The BOM makes Excel open UTF-8 correctly instead of mangling accents.
  const blob = new Blob([`﻿${contents}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
