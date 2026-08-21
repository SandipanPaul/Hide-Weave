"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProject, updateProject } from "../actions";
import { ProjectForm, type ProjectFormOptions, type ProjectFormValues } from "../project-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProjectStatusBadge } from "@/components/status-badge";
import { DASH, DetailList, DetailRow } from "@/components/detail/detail-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ProjectDetailView = ProjectFormValues & {
  id: string;
  clientName: string;
  exporterName: string | null;
  orderValueDisplay: string;
  orderDateDisplay: string;
  expectedDeliveryDisplay: string | null;
  actualDeliveryDisplay: string | null;
};

/**
 * The project's own fields, editable in place — the edit form replaces the
 * read view on this same page rather than navigating anywhere.
 */
export function ProjectDetailsPanel({
  project,
  options,
}: {
  project: ProjectDetailView;
  options: ProjectFormOptions;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const boundUpdate = updateProject.bind(null, project.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>Order details</CardTitle>
        {!editing ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    className="text-destructive"
                  />
                }
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete order {project.orderId}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This order and every payment recorded against it will be hidden everywhere in
                    the app, including the commission totals.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep project</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteProject(project.id);
                        // A successful delete redirects, so only a failure
                        // ever returns here.
                        if (result && !result.ok) {
                          toast.error(result.formErrors[0] ?? "Could not delete this project.");
                        }
                      })
                    }
                  >
                    Delete project
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {editing ? (
          <ProjectForm
            action={boundUpdate}
            options={options}
            initialValues={project}
            submitLabel="Save changes"
            successMessage="Project updated."
            onCancel={() => setEditing(false)}
            onSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <DetailList>
            <DetailRow label="Status">
              <ProjectStatusBadge status={project.status} />
            </DetailRow>
            <DetailRow label="Client">
              <Link
                href={`/clients/${project.clientId}`}
                className="underline-offset-4 hover:underline"
              >
                {project.clientName}
              </Link>
            </DetailRow>
            <DetailRow label="Exporter">
              {project.exporterName ? (
                <Link
                  href={`/exporters/${project.exporterId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {project.exporterName}
                </Link>
              ) : (
                DASH
              )}
            </DetailRow>
            <DetailRow label="Product">{project.product}</DetailRow>
            <DetailRow label="Quantity">
              <span className="tabular-nums">
                {Number(project.quantity).toLocaleString("en-IN")} {project.unit}
              </span>
            </DetailRow>
            <DetailRow label="Order value">
              {/* Goods routed through the agent — deliberately not called income. */}
              <span className="tabular-nums">{project.orderValueDisplay}</span>
            </DetailRow>
            <DetailRow label="Commission %">
              <span className="tabular-nums">{project.commissionPercentage}%</span>
            </DetailRow>
            <DetailRow label="Ordered">{project.orderDateDisplay}</DetailRow>
            <DetailRow label="Expected">{project.expectedDeliveryDisplay ?? DASH}</DetailRow>
            <DetailRow label="Delivered">{project.actualDeliveryDisplay ?? DASH}</DetailRow>
            <DetailRow label="Notes">
              {project.notes ? (
                <span className="whitespace-pre-line">{project.notes}</span>
              ) : (
                DASH
              )}
            </DetailRow>
          </DetailList>
        )}
      </CardContent>
    </Card>
  );
}
