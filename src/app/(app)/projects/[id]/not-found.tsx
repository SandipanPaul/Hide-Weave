import Link from "next/link";
import { FolderX } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <EmptyState
      icon={FolderX}
      title="Project not found"
      description="This project may have been deleted, or the link may be wrong."
      action={
        <Button variant="outline" nativeButton={false} render={<Link href="/projects" />}>
          Back to projects
        </Button>
      }
    />
  );
}
