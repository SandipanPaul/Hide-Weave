import { TableLink } from "@/components/data-table/table-link";
import { EmptyState } from "@/components/layout/empty-state";
import { ProjectStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The dashboard's tables. Every value arrives pre-formatted from the server —
 * these render, they do not calculate.
 */

function Panel({
  title,
  description,
  empty,
  emptyText,
  children,
}: {
  title: string;
  description?: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState title={emptyText} className="py-10" />
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export type ReceivableRowView = {
  id: string;
  orderId: string;
  clientName: string;
  product: string;
  outstanding: string;
  paid: string;
  daysOutstanding: number;
};

export function ReceivablesTable({ rows }: { rows: ReceivableRowView[] }) {
  return (
    <Panel
      title="Overdue receivables"
      description="Delivered orders whose commission is still unpaid, longest-waiting first."
      empty={rows.length === 0}
      emptyText="Nothing outstanding on delivered orders"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Still owed</TableHead>
            <TableHead className="text-right">Waiting</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                <TableLink
                  href={`/projects/${row.id}`}
                >
                  {row.orderId}
                </TableLink>
              </TableCell>
              <TableCell className="max-w-[18ch] truncate">{row.clientName}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                {row.paid}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                {row.outstanding}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {row.daysOutstanding} days
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

export type LateRowView = {
  id: string;
  orderId: string;
  clientName: string;
  product: string;
  expectedDelivery: string;
  daysLate: number;
  status: string;
};

export function LateDeliveriesTable({ rows }: { rows: LateRowView[] }) {
  return (
    <Panel
      title="Past expected delivery"
      description="Orders that were due and have not arrived."
      empty={rows.length === 0}
      emptyText="Nothing is overdue"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Was due</TableHead>
            <TableHead className="text-right">Late by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                <TableLink
                  href={`/projects/${row.id}`}
                >
                  {row.orderId}
                </TableLink>
              </TableCell>
              <TableCell className="max-w-[16ch] truncate">{row.clientName}</TableCell>
              <TableCell className="max-w-[16ch] truncate">{row.product}</TableCell>
              <TableCell>
                <ProjectStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {row.expectedDelivery}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {row.daysLate} days
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

export type SamplingRowView = {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  product: string | null;
};

export function UpcomingSamplingsTable({ rows }: { rows: SamplingRowView[] }) {
  return (
    <Panel
      title="Samplings in the next 30 days"
      description="Not affected by the date range — this is what is coming up."
      empty={rows.length === 0}
      emptyText="Nothing scheduled in the next 30 days"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Product</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap font-medium tabular-nums">
                {row.date}
              </TableCell>
              <TableCell className="max-w-[22ch] truncate">
                <TableLink
                  href={`/clients/${row.clientId}`}
                >
                  {row.clientName}
                </TableLink>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.product ?? "No product noted"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
