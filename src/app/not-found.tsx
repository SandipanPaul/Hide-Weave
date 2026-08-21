import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/**
 * The catch-all 404, for a URL that matches no route at all.
 *
 * It renders outside the app shell, so it carries its own framing rather than
 * dropping the reader onto Next's default page in a different typeface.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6">
      <div className="w-full">
        <EmptyState
          icon={Compass}
          title="There is nothing at this address"
          description="The link may be wrong, or the page may have been renamed."
          action={
            <Button nativeButton={false} render={<Link href="/projects" />}>
              Go to Projects
            </Button>
          }
        />
      </div>
    </main>
  );
}
