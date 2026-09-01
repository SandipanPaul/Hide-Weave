import { LINK_CLASS } from "@/components/ui/link-styles";
/**
 * The read view of a single record: a label column and a value column, one row
 * per field. Shared by the client, project and supplier detail pages so all
 * three read the same way and a fix to one is a fix to all.
 */

/** What an empty value looks like everywhere in the app. */
export const DASH = <span className="text-muted-foreground">—</span>;

export function DetailList({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y">{children}</dl>;
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      {/* break-words, not break-all: a value only breaks when it cannot fit,
          and where it breaks is decided per value. break-all splits every
          over-long line at whatever character reaches the edge, which left
          addresses reading "…aprilsourcing.co / m". */}
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

// Shared with every other link in the app — see LINK_CLASS.
const LINK = LINK_CLASS;

/**
 * An email is one unbreakable token to a browser, so a long one needs to be
 * told where it may wrap. After the "@" is the only place that still reads as
 * an address: "puspanjali@" / "aprilsourcing.com".
 *
 * <wbr> is a break opportunity, not a character — copying the address still
 * yields the address, with no stray newline.
 */
function WrappableEmail({ value }: { value: string }) {
  const at = value.indexOf("@");
  if (at === -1) return <>{value}</>;
  return (
    <>
      {value.slice(0, at + 1)}
      <wbr />
      {value.slice(at + 1)}
    </>
  );
}

export function EmailLink({ value }: { value: string }) {
  return (
    <a href={`mailto:${value}`} className={LINK}>
      <WrappableEmail value={value} />
    </a>
  );
}

export function PhoneLink({ value }: { value: string }) {
  // Spaces and dashes are for reading, not for dialling.
  return (
    <a href={`tel:${value.replace(/\s/g, "")}`} className={LINK}>
      {value}
    </a>
  );
}

/** An outbound link. A URL has no "@" to break after, so it may break anywhere. */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={`break-all ${LINK}`}>
      {children}
    </a>
  );
}
