"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteClient, updateClient } from "../actions";
import { ClientForm, type ClientFormValues } from "../client-form";
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
import { ClientStatusBadge } from "@/components/status-badge";
import {
  DASH,
  DetailList,
  DetailRow,
  EmailLink,
  ExternalLink,
  PhoneLink,
} from "@/components/detail/detail-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ClientDetailView = ClientFormValues & {
  id: string;
  retainerDisplay: string | null;
};

/**
 * Every way to reach the client, each one a working link. An empty list shows
 * a dash rather than nothing, so the row still reads as "we have none".
 */
function ContactList({ values, kind }: { values: string[]; kind: "phone" | "email" }) {
  if (values.length === 0) return DASH;
  return (
    <ul className="space-y-0.5">
      {values.map((value) => (
        <li key={value}>
          {kind === "email" ? <EmailLink value={value} /> : <PhoneLink value={value} />}
        </li>
      ))}
    </ul>
  );
}

/**
 * The client's own details, editable in place — the edit form replaces the
 * read view on this same page rather than navigating anywhere.
 */
export function ClientDetailsPanel({ client }: { client: ClientDetailView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const boundUpdate = updateClient.bind(null, client.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>Details</CardTitle>
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
                  <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This client and their samplings will be hidden everywhere in the app. Clients
                    with projects can&apos;t be deleted — move or delete the projects first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep client</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteClient(client.id);
                        // A successful delete redirects, so only a failure
                        // ever returns here.
                        if (result && !result.ok) {
                          toast.error(result.formErrors[0] ?? "Could not delete this client.");
                        }
                      })
                    }
                  >
                    Delete client
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {editing ? (
          <ClientForm
            action={boundUpdate}
            initialValues={client}
            submitLabel="Save changes"
            successMessage="Client updated."
            onCancel={() => setEditing(false)}
            onSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <DetailList>
            <DetailRow label="Status">
              <ClientStatusBadge status={client.status} />
            </DetailRow>
            <DetailRow label="Contact person">{client.contactPerson || DASH}</DetailRow>
            <DetailRow label={client.phones.length > 1 ? "Phones" : "Phone"}>
              <ContactList values={client.phones} kind="phone" />
            </DetailRow>
            <DetailRow label={client.emails.length > 1 ? "Emails" : "Email"}>
              <ContactList values={client.emails} kind="email" />
            </DetailRow>
            <DetailRow label="Website">
              {client.website ? (
                <ExternalLink href={client.website}>{client.website}</ExternalLink>
              ) : (
                DASH
              )}
            </DetailRow>
            <DetailRow label="Address">
              {client.address ? (
                <span className="whitespace-pre-line">{client.address}</span>
              ) : (
                DASH
              )}
            </DetailRow>
            <DetailRow label="Country">{client.country || DASH}</DetailRow>
            <DetailRow label="Monthly retainer">{client.retainerDisplay ?? DASH}</DetailRow>
            <DetailRow label="Notes">
              {client.notes ? <span className="whitespace-pre-line">{client.notes}</span> : DASH}
            </DetailRow>
          </DetailList>
        )}
      </CardContent>
    </Card>
  );
}
