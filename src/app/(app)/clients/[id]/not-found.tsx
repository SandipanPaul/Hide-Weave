import Link from "next/link";
import { UserX } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function ClientNotFound() {
  return (
    <EmptyState
      icon={UserX}
      title="Client not found"
      description="This client may have been deleted, or the link may be wrong."
      action={
        <Button variant="outline" nativeButton={false} render={<Link href="/clients" />}>
          Back to clients
        </Button>
      }
    />
  );
}
