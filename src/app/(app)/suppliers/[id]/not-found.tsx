import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function SupplierNotFound() {
  return (
    <EmptyState
      icon={Building2}
      title="Supplier not found"
      description="This supplier may have been deleted, or the link may be wrong."
      action={
        <Button variant="outline" nativeButton={false} render={<Link href="/suppliers" />}>
          Back to suppliers
        </Button>
      }
    />
  );
}
