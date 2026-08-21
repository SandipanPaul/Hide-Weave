import Link from "next/link";
import { FolderKanban } from "lucide-react";
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
import { formatDateOnly } from "@/lib/dates";
import { formatMoney, formatMoneyPlain } from "@/lib/money";

type ProjectRow = {
  id: string;
  orderId: string;
  product: string;
  orderValue: bigint;
  currency: string;
  status: string;
  orderDate: Date;
  client: { id: string; name: string };
};

type Total = { currency: string; orderValue: bigint; commission: bigint; projects: number };

/**
 * The orders sourced through this exporter.
 *
 * Order value leads here, unlike everywhere else: this answers "how much
 * supply have I routed to them", which is a different question from what the
 * agent earned. The commission is shown too, but second.
 */
export function ExporterProjects({
  projects,
  totals,
}: {
  projects: ProjectRow[];
  totals: Total[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders sourced through them</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No orders yet"
            description="Orders naming this exporter as the supplier will appear here, with the value routed to them."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Order value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ordered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/projects/${project.id}`}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {project.orderId}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[16ch] truncate">
                        <Link
                          href={`/clients/${project.client.id}`}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {project.client.name}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[18ch] truncate">{project.product}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        <span className="mr-1 text-xs text-muted-foreground">
                          {project.currency}
                        </span>
                        {formatMoneyPlain(project.orderValue, project.currency)}
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={project.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateOnly(project.orderDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totals.length > 0 ? (
              <div className="space-y-1 border-t pt-3">
                {totals.map((total) => (
                  <div key={total.currency} className="flex flex-wrap justify-end gap-6 text-sm">
                    <span className="text-muted-foreground">
                      Value routed ({total.currency})
                      <span className="ml-2 font-medium tabular-nums text-foreground">
                        {formatMoney(total.orderValue, total.currency)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Commission earned
                      <span className="ml-2 font-medium tabular-nums text-foreground">
                        {formatMoney(total.commission, total.currency)}
                      </span>
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-right text-xs text-muted-foreground">
                  Excludes cancelled orders. Currencies are never converted or combined.
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
