"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteSupplier, updateSupplier } from "../actions";
import { SupplierForm, type SupplierFormValues } from "../supplier-form";
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
import { SupplierTypeBadges } from "@/components/status-badge";
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

export type SupplierDetailView = SupplierFormValues & {
  id: string;
  projectCount: number;
};

export function SupplierDetailsPanel({ supplier }: { supplier: SupplierDetailView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const boundUpdate = updateSupplier.bind(null, supplier.id);
  const readableUrl = supplier.sourceUrl || supplier.website || null;

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
                supplierId={supplier.id}
                url={readableUrl}
                current={{
                  companyName: supplier.companyName,
                  email: supplier.email,
                  phone: supplier.phone,
                  address: supplier.address,
                  notes: supplier.notes,
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
                  <AlertDialogTitle>Delete {supplier.companyName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {supplier.projectCount > 0
                      ? `This supplier will be hidden everywhere in the app. The ${supplier.projectCount} order${
                          supplier.projectCount === 1 ? "" : "s"
                        } they are making are kept and simply lose this maker — an order that happened still happened.`
                      : "This supplier will be hidden everywhere in the app."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep supplier</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteSupplier(supplier.id);
                        // A successful delete redirects, so only a failure
                        // ever returns here.
                        if (result && !result.ok) {
                          toast.error(result.formErrors[0] ?? "Could not delete this supplier.");
                        }
                      })
                    }
                  >
                    Delete supplier
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {editing ? (
          <SupplierForm
            action={boundUpdate}
            initialValues={supplier}
            submitLabel="Save changes"
            successMessage="Supplier updated."
            onCancel={() => setEditing(false)}
            onSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <DetailList>
            <DetailRow label="What they do">
              <SupplierTypeBadges types={supplier.types} />
            </DetailRow>
            <DetailRow label="Contact person">{supplier.contactPerson || DASH}</DetailRow>
            <DetailRow label="Email">
              {supplier.email ? <EmailLink value={supplier.email} /> : DASH}
            </DetailRow>
            <DetailRow label="Phone">
              {supplier.phone ? <PhoneLink value={supplier.phone} /> : DASH}
            </DetailRow>
            <DetailRow label="Website">
              {supplier.website ? (
                <ExternalLink href={supplier.website}>{displayHost(supplier.website)}</ExternalLink>
              ) : (
                DASH
              )}
            </DetailRow>
            <DetailRow label="Address">
              {supplier.address ? (
                <span className="whitespace-pre-line">{supplier.address}</span>
              ) : (
                DASH
              )}
            </DetailRow>
            {supplier.sourceUrl ? (
              <DetailRow label="Read from">
                <ExternalLink href={supplier.sourceUrl}>
                  {displayHost(supplier.sourceUrl)}
                </ExternalLink>
              </DetailRow>
            ) : null}
            <DetailRow label="Notes">
              {supplier.notes ? (
                <span className="whitespace-pre-line">{supplier.notes}</span>
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
