import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Certification } from "@/lib/db";
import { formatDate } from "@/lib/expiryUtils";
import { ExpiryBadge } from "./ExpiryBadge";
import { StatusBadge } from "./StatusBadge";
import { TypeBadge } from "./TypeBadge";
import { MoreHorizontal, Pencil, Trash2, Search, Eye } from "lucide-react";
import { toast } from "sonner";

interface CertificationTableProps {
  certifications: Certification[];
  onEdit: (cert: Certification) => void;
  onDelete: (id: string) => Promise<void>;
  onView: (cert: Certification) => void;
}

export const CertificationTable = ({
  certifications,
  onEdit,
  onDelete,
  onView,
}: CertificationTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredCerts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return certifications;

    return certifications.filter((cert) => {
      return (
        (cert.plant || "").toLowerCase().includes(query) ||
        (cert.address || "").toLowerCase().includes(query) ||
        (cert.type || "").toLowerCase().includes(query) ||
        (cert.bisRNo || "").toLowerCase().includes(query) ||
        (cert.iecRNo || "").toLowerCase().includes(query) ||
        (cert.bisStatus || "").toLowerCase().includes(query) ||
        (cert.iecStatus || "").toLowerCase().includes(query) ||
        String(cert.sno || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [certifications, searchQuery]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await onDelete(deleteId);
      toast.success("Certification deleted");
    } catch {
      toast.error("Failed to delete certification");
    } finally {
      setDeleteId(null);
    }
  };

  const renderRNoCell = (cert: Certification) => {
    if (cert.type === "BIS & IEC") {
      return (
        <div className="space-y-1">
          <div>
            <span className="text-xs text-muted-foreground">BIS:</span>{" "}
            {cert.bisRNo || "-"}
          </div>
          <div>
            <span className="text-xs text-muted-foreground">IEC:</span>{" "}
            {cert.iecRNo || "-"}
          </div>
        </div>
      );
    }
    if (cert.type === "BIS") return cert.bisRNo || "-";
    return cert.iecRNo || "-";
  };

  const renderStatusCell = (cert: Certification) => {
    if (cert.type === "BIS & IEC") {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">BIS</span>
            <StatusBadge status={(cert.bisStatus as any) || "Pending"} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">IEC</span>
            <StatusBadge status={(cert.iecStatus as any) || "Pending"} />
          </div>
        </div>
      );
    }
    return (
      <StatusBadge
        status={
          ((cert.type === "BIS" ? cert.bisStatus : cert.iecStatus) as any) ||
          "Pending"
        }
      />
    );
  };

  const pickValidityFrom = (cert: Certification) => {
    return cert.type === "BIS" ? cert.bisValidityFrom : cert.iecValidityFrom;
  };
  const pickValidityUpto = (cert: Certification) => {
    return cert.type === "BIS" ? cert.bisValidityUpto : cert.iecValidityUpto;
  };

  const renderValidityFromCell = (cert: Certification) => {
    if (cert.type === "BIS & IEC") {
      return (
        <div className="space-y-1">
          <div>
            <span className="text-xs text-muted-foreground">BIS:</span>{" "}
            {formatDate(cert.bisValidityFrom || "")}
          </div>
          <div>
            <span className="text-xs text-muted-foreground">IEC:</span>{" "}
            {formatDate(cert.iecValidityFrom || "")}
          </div>
        </div>
      );
    }
    return formatDate(pickValidityFrom(cert) || "");
  };

  const renderValidityUptoCell = (cert: Certification) => {
    if (cert.type === "BIS & IEC") {
      return (
        <div className="space-y-1">
          <div>
            <span className="text-xs text-muted-foreground">BIS:</span>{" "}
            {formatDate(cert.bisValidityUpto || "")}
          </div>
          <div>
            <span className="text-xs text-muted-foreground">IEC:</span>{" "}
            {formatDate(cert.iecValidityUpto || "")}
          </div>
        </div>
      );
    }
    return formatDate(pickValidityUpto(cert) || "");
  };

  const renderExpiryCell = (cert: Certification) => {
    if (cert.type === "BIS & IEC") {
      const hasBis = Boolean(cert.bisValidityUpto);
      const hasIec = Boolean(cert.iecValidityUpto);

      return (
        <div className="space-y-1">
          {hasBis ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">BIS</span>
              <ExpiryBadge validityUpto={cert.bisValidityUpto as string} />
            </div>
          ) : null}

          {hasIec ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">IEC</span>
              <ExpiryBadge validityUpto={cert.iecValidityUpto as string} />
            </div>
          ) : null}

          {!hasBis && !hasIec ? (
            <span className="text-muted-foreground">-</span>
          ) : null}
        </div>
      );
    }

    const upto = pickValidityUpto(cert);
    if (!upto) return <span className="text-muted-foreground">-</span>;
    return <ExpiryBadge validityUpto={upto} />;
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search certifications..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">S.No</TableHead>
              <TableHead>Plant</TableHead>
              <TableHead>R-No / ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Validity From</TableHead>
              <TableHead>Validity Upto</TableHead>
              <TableHead>Expiry Alert</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredCerts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  {searchQuery
                    ? "No certifications match your search"
                    : "No certifications yet"}
                </TableCell>
              </TableRow>
            ) : (
              filteredCerts.map((cert, index) => (
                <TableRow
                  key={cert.id}
                  className="animate-fade-in hover:bg-muted/30 transition-colors"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <TableCell className="font-medium">{cert.sno}</TableCell>

                  <TableCell>
                    <div className="font-medium">{cert.plant}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                      {cert.address}
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-sm">
                    {renderRNoCell(cert)}
                  </TableCell>

                  <TableCell>
                    <TypeBadge type={cert.type} />
                  </TableCell>

                  <TableCell>{renderStatusCell(cert)}</TableCell>

                  <TableCell>{renderValidityFromCell(cert)}</TableCell>

                  <TableCell>{renderValidityUptoCell(cert)}</TableCell>

                  <TableCell>{renderExpiryCell(cert)}</TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView(cert)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => onEdit(cert)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => setDeleteId(cert.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certification</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this certification and stop all
              related email notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
