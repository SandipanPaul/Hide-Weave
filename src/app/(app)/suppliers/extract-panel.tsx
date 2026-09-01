"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2, Search } from "lucide-react";
import {
  extractSupplier,
  type ExtractionResult,
  type PickedField,
} from "./extraction-actions";
import { ErrorNote } from "@/components/form/error-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Paste a URL, read the site, fill the form.
 *
 * The fetch is a server action — the browser never requests the site itself.
 * Whatever comes back is a suggestion: it lands in the form marked as
 * auto-filled, and nothing is saved until the user submits.
 */
export function ExtractPanel({ onExtracted }: { onExtracted: (result: ExtractionResult) => void }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<
    { kind: "error" | "info"; text: string } | null
  >(null);
  const [picked, setPicked] = useState<PickedField[]>([]);
  const [isPending, startExtraction] = useTransition();

  const run = () => {
    if (url.trim() === "" || isPending) return;
    setMessage(null);
    setPicked([]);

    startExtraction(async () => {
      const result = await extractSupplier(url);

      if (!result.ok) {
        // Each failure has its own explanation — timeout, 403, robots.txt, a
        // certificate problem — so this shows what came back rather than a
        // generic "something went wrong".
        setMessage({ kind: "error", text: result.message });
        return;
      }

      setPicked(result.picked);

      if (result.picked.length === 0) {
        setMessage({
          kind: "info",
          text: `Nothing could be read from ${new URL(result.finalUrl).hostname} — some sites build their pages in the browser, leaving nothing in the HTML. Fill the form in by hand.`,
        });
      } else if (result.picked.every((item) => item.from === "the page title")) {
        // The page had no structured data, no contact links and no readable
        // text — all that could be salvaged is the browser tab's text.
        setMessage({
          kind: "info",
          text: `Only the page title could be read from ${new URL(result.finalUrl).hostname}. Check the company name and add the rest by hand.`,
        });
      } else if (result.existing) {
        setMessage({
          kind: "info",
          text: `${result.existing.companyName} already uses this website — saving this as a new supplier will be refused.`,
        });
      } else {
        const also = result.alsoRead ? ` and ${new URL(result.alsoRead).pathname}` : "";
        setMessage({
          kind: "info",
          text: `Read ${new URL(result.finalUrl).hostname}${also}.`,
        });
      }

      onExtracted(result);
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="extract-url">
            <Globe className="size-3.5 text-muted-foreground" aria-hidden />
            Fill from a website
          </Label>
          <Input
            id="extract-url"
            type="url"
            placeholder="asianleather.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              // Enter would otherwise submit the supplier form underneath.
              if (event.key === "Enter") {
                event.preventDefault();
                run();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={run} disabled={isPending || !url.trim()}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Search className="size-4" aria-hidden />
          )}
          {isPending ? "Reading…" : "Read site"}
        </Button>
      </div>

      {isPending ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Fetching the page on the server. This stops after 10 seconds.
        </p>
      ) : null}

      {message?.kind === "error" ? <ErrorNote>{message.text}</ErrorNote> : null}
      {message?.kind === "info" ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message.text}
        </p>
      ) : null}

      {/* What was picked and where each value came from, so a wrong guess is
          obvious rather than buried in a filled-in form. */}
      {picked.length > 0 ? (
        <dl className="space-y-1 rounded-md border bg-background px-3 py-2 text-xs">
          <p className="font-medium">Picked up from the site — correct anything wrong below:</p>
          {picked.map((item) => (
            <div key={item.field} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0">
                <span className="break-words">{item.value}</span>
                <span className="ml-1.5 text-muted-foreground">— from {item.from}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Nothing is saved until you submit. Anything found is a suggestion to check.
      </p>
    </div>
  );
}
