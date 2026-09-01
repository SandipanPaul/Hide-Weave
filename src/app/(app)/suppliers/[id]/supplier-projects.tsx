import { TableLink } from "@/components/data-table/table-link";
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

type ProjectRow = {
  id: string;
  orderId: string;
  product: string;
  /** This supplier's share of the order. */
  quantity: number;
  /** The whole order, for context. */
  projectQuantity: number;
  unit: string;
  status: string;
  orderDate: Date;
  client: { id: string; name: string };
};

/**
 * The orders this supplier is making.
 *
 * Deliberately no money: what matters about a supplier is what they are
 * producing and whether it is on time. Value and commission belong to the
 * order, and are on the project's own page.
 */
export function SupplierProjects({ projects }: { projects: ProjectRow[] }) {
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
            description="Orders naming this supplier as the supplier will appear here, with the value routed to them."
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
                    <TableHead className="text-right">Making</TableHead>
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
                      <TableCell className="max-w-[16ch] truncate">
                        <TableLink
                          href={`/clients/${project.client.id}`}
                        >
                          {project.client.name}
                        </TableLink>
                      </TableCell>
                      <TableCell className="max-w-[18ch] truncate">{project.product}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {project.quantity.toLocaleString("en-IN")}
                        <span className="ml-1 text-xs text-muted-foreground">{project.unit}</span>
                        {/* Somebody else is making the rest of this order. */}
                        {project.quantity < project.projectQuantity ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            of {project.projectQuantity.toLocaleString("en-IN")}
                          </span>
                        ) : null}
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

          </>
        )}
      </CardContent>
    </Card>
  );
}
