"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteExporter, updateExporter } from "../actions";
import { ExporterForm, type ExporterFormValues } from "../exporter-form";
import { ReExtractDialog } from "./re-extract-dialog";
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
import { Button } from "@/components/ui/button";
import {
  DASH,
  DetailList,
  DetailRow,
  EmailLink,
  ExternalLink,
  PhoneLink,
} from "@/components/detail/detail-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayHost } from "@/lib/url";

export type ExporterDetailView = ExporterFormValues & {
  id: string;
  projectCount: number;
};

export function ExporterDetailsPanel({ exporter }: { exporter: ExporterDetailView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const boundUpdate = updateExporter.bind(null, exporter.id);
  const readableUrl = exporter.sourceUrl || exporter.website || null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>Details</CardTitle>
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Only offered when there is somewhere to read: the address it was
                extracted from, or failing that its website. */}
            {readableUrl ? (
              <ReExtractDialog
                exporterId={exporter.id}
                url={readableUrl}
                current={{
                  companyName: exporter.companyName,
                  email: exporter.email,
                  phone: exporter.phone,
                  address: exporter.address,
                  notes: exporter.notes,
                }}
              />
            ) : null}

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
                  <AlertDialogTitle>Delete {exporter.companyName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {exporter.projectCount > 0
                      ? `This exporter will be hidden everywhere in the app. The ${exporter.projectCount} order${
                          exporter.projectCount === 1 ? "" : "s"
                        } they are making are kept and simply lose this maker — an order that happened still happened.`
                      : "This exporter will be hidden everywhere in the app."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep exporter</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteExporter(exporter.id);
                        // A successful delete redirects, so only a failure
                        // ever returns here.
                        if (result && !result.ok) {
                          toast.error(result.formErrors[0] ?? "Could not delete this exporter.");
                        }
                      })
                    }
                  >
                    Delete exporter
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {editing ? (
          <ExporterForm
            action={boundUpdate}
            initialValues={exporter}
            submitLabel="Save changes"
            successMessage="Exporter updated."
            onCancel={() => setEditing(false)}
            onSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <DetailList>
            <DetailRow label="Contact person">{exporter.contactPerson || DASH}</DetailRow>
            <DetailRow label="Email">
              {exporter.email ? <EmailLink value={exporter.email} /> : DASH}
            </DetailRow>
            <DetailRow label="Phone">
              {exporter.phone ? <PhoneLink value={exporter.phone} /> : DASH}
            </DetailRow>
            <DetailRow label="Website">
              {exporter.website ? (
                <ExternalLink href={exporter.website}>{displayHost(exporter.website)}</ExternalLink>
              ) : (
                DASH
              )}
            </DetailRow>
            <DetailRow label="Address">
              {exporter.address ? (
                <span className="whitespace-pre-line">{exporter.address}</span>
              ) : (
                DASH
              )}
            </DetailRow>
            {exporter.sourceUrl ? (
              <DetailRow label="Read from">
                <ExternalLink href={exporter.sourceUrl}>
                  {displayHost(exporter.sourceUrl)}
                </ExternalLink>
              </DetailRow>
            ) : null}
            <DetailRow label="Notes">
              {exporter.notes ? (
                <span className="whitespace-pre-line">{exporter.notes}</span>
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
