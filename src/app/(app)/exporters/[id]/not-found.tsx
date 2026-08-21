import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function ExporterNotFound() {
  return (
    <EmptyState
      icon={Building2}
      title="Exporter not found"
      description="This exporter may have been deleted, or the link may be wrong."
      action={
        <Button variant="outline" nativeButton={false} render={<Link href="/exporters" />}>
          Back to exporters
        </Button>
      }
    />
  );
}
