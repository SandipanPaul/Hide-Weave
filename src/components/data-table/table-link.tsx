import Link from "next/link";
import { LINK_CLASS } from "@/components/ui/link-styles";
import { cn } from "@/lib/utils";

/**
 * A link inside a table cell.
 *
 * Thin on purpose: it exists so a table cell does not have to remember the
 * class string, and so `title` has an obvious home when the cell truncates.
 */
export function TableLink({
  href,
  title,
  className,
  children,
}: {
  href: string;
  /** The full text, when the cell truncates it. */
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(LINK_CLASS, className)}
    >
      {children}
    </Link>
  );
}
