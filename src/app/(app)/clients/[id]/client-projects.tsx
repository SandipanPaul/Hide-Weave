import { TableLink } from "@/components/data-table/table-link";
import { FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { ProjectStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/enums";
import { computeCommission, formatMoney } from "@/lib/money";

type ProjectRow = {
  id: string;
  product: string;
  orderId: string;
  orderValue: bigint;
  commissionPercentage: number;
  currency: string;
  status: string;
  orderDate: Date;
  exporters: Array<{ quantity: number; exporter: { id: string; companyName: string } }>;
};

/**
 * This client's orders, with per-status counts and per-currency totals.
 *
 * Totals are segmented by currency and never summed across them — there is no
 * conversion anywhere in this app.
 */
export function ClientProjects({ projects }: { projects: ProjectRow[] }) {
  const statusCounts = new Map<string, number>();
  const totalsByCurrency = new Map<string, { orderValue: bigint; commission: bigint }>();
  // Commission is computed once per project and reused by the row and the
  // total, so the two can never show different figures.
  const commissions = new Map<string, bigint>();

  for (const project of projects) {
    statusCounts.set(project.status, (statusCounts.get(project.status) ?? 0) + 1);
    const commission = computeCommission(project.orderValue, project.commissionPercentage);
    commissions.set(project.id, commission);

    if (project.status === "CANCELLED") continue;
    const entry = totalsByCurrency.get(project.currency) ?? { orderValue: 0n, commission: 0n };
    entry.orderValue += project.orderValue;
    entry.commission += commission;
    totalsByCurrency.set(project.currency, entry);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        {projects.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[...statusCounts.entries()].map(([status, count]) => (
              <Badge key={status} variant="outline" className="font-normal">
                {PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status}
                <span className="ml-1 tabular-nums text-muted-foreground">{count}</span>
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects for this client"
            description="Orders recorded against this client will appear here, with the commission each one earns."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Exporter</TableHead>
                  <TableHead className="text-right">Order value</TableHead>
                  <TableHead className="text-right">Comm %</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ordered</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <TableLink
                        href={`/projects/${project.id}`}
                      >
                        {project.orderId}
                      </TableLink>
                    </TableCell>
                    <TableCell>{project.product}</TableCell>
                    <TableCell className="max-w-[18ch] truncate text-muted-foreground">
                      {project.exporters.length === 0
                        ? "—"
                        : project.exporters.map((a) => a.exporter.companyName).join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(project.orderValue, project.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {project.commissionPercentage}%
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(commissions.get(project.id) ?? 0n, project.currency)}
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
        )}

        {totalsByCurrency.size > 0 ? (
          <div className="mt-4 space-y-1 border-t pt-3">
            {[...totalsByCurrency.entries()].map(([currency, totals]) => (
              <div key={currency} className="flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">
                  Order value ({currency})
                  <span className="ml-2 font-medium tabular-nums text-foreground">
                    {formatMoney(totals.orderValue, currency)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Commission
                  <span className="ml-2 font-medium tabular-nums text-foreground">
                    {formatMoney(totals.commission, currency)}
                  </span>
                </span>
              </div>
            ))}
            <p className="pt-1 text-right text-xs text-muted-foreground">
              Excludes cancelled orders. Currencies are never converted or combined.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
