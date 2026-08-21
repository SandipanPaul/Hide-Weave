import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The "back to the list" link at the top of every detail page. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mb-2 -ml-2 text-muted-foreground"
      // Base UI renders as another element via `render`, not `asChild`, and a
      // link is not a native button.
      nativeButton={false}
      render={<Link href={href} />}
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Button>
  );
}
