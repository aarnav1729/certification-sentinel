// src/components/CertificationTable.tsx
import { Fragment, useMemo, useState } from "react";
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
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  Eye,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface SoftDeletePayload {
  reason: string;
  proof: {
    name: string;
    type: string;
    base64: string;
  };
}

interface CertificationTableProps {
  certifications: Certification[];
  onEdit: (cert: Certification) => void;
  onDelete: (id: string, payload: SoftDeletePayload) => Promise<void>;
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteProofFile, setDeleteProofFile] = useState<File | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => {
        const res = String(reader.result || "");
        const base64 = res.includes(",") ? res.split(",")[1] : "";
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }

  const safeCerts = Array.isArray(certifications) ? certifications : [];

  const query = useMemo(
    () =>
      String(searchQuery || "")
        .toLowerCase()
        .trim(),
    [searchQuery]
  );

  const filteredCerts = useMemo(() => {
    if (!query) return safeCerts;

    return safeCerts.filter((cert) => {
      return (
        (cert.plant || "").toLowerCase().includes(query) ||
        (cert.address || "").toLowerCase().includes(query) ||
        (cert.type || "").toLowerCase().includes(query) ||
        (cert.bisRNo || "").toLowerCase().includes(query) ||
        (cert.iecRNo || "").toLowerCase().includes(query) ||
        (cert.bisStatus || "").toLowerCase().includes(query) ||
        (cert.iecStatus || "").toLowerCase().includes(query) ||
        (cert.bisModelList || "").toLowerCase().includes(query) ||
        (cert.iecModelList || "").toLowerCase().includes(query) ||
        (cert.bisStandard || "").toLowerCase().includes(query) ||
        (cert.iecStandard || "").toLowerCase().includes(query) ||
        String(cert.sno || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [safeCerts, query]);

  const groupedCerts = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        sno: number;
        plant: string;
        address: string;
        items: Certification[];
      }
    >();

    for (const c of filteredCerts) {
      const key = `${c.sno}||${c.plant}||${c.address}`;
      const existing = map.get(key);
      if (existing) existing.items.push(c);
      else {
        map.set(key, {
          key,
          sno: c.sno,
          plant: c.plant,
          address: c.address,
          items: [c],
        });
      }
    }

    const sortType = (t: string) => (t === "BIS" ? 0 : t === "IEC" ? 1 : 2);

    return Array.from(map.values())
      .sort((a, b) => (a.sno || 0) - (b.sno || 0))
      .map((g) => ({
        ...g,
        items: g.items.sort((x, y) => sortType(x.type) - sortType(y.type)),
      }));
  }, [filteredCerts]);

  const getEffectiveFields = (cert: Certification) => {
    const hasLegacy =
      Boolean((cert as any).rNo) ||
      Boolean((cert as any).status) ||
      Boolean((cert as any).modelList) ||
      Boolean((cert as any).standard) ||
      Boolean((cert as any).validityFrom) ||
      Boolean((cert as any).validityUpto) ||
      Boolean((cert as any).renewalStatus) ||
      Boolean((cert as any).alarmAlert) ||
      Boolean((cert as any).action);

    if (hasLegacy) {
      return {
        type: (cert.type || "BIS") as any,
        rNo: (cert as any).rNo || "",
        status: (cert as any).status || "",
        modelList: (cert as any).modelList || "",
        standard: (cert as any).standard || "",
        validityFrom: (cert as any).validityFrom || "",
        validityUpto: (cert as any).validityUpto || "",
        renewalStatus: (cert as any).renewalStatus || "",
        alarmAlert: (cert as any).alarmAlert || "",
        action: (cert as any).action || "",
      };
    }

    const t = (cert.type || "BIS") as any;
    const isBIS = t === "BIS";
    const isIEC = t === "IEC";

    if (t === "BIS & IEC") {
      return {
        type: t,
        rNo: "",
        status: "",
        modelList: "",
        standard: "",
        validityFrom: "",
        validityUpto: "",
        renewalStatus: "",
        alarmAlert: "",
        action: "",
      };
    }

    return {
      type: t,
      rNo: isBIS ? cert.bisRNo || "" : cert.iecRNo || "",
      status: isBIS ? cert.bisStatus || "" : cert.iecStatus || "",
      modelList: isBIS ? cert.bisModelList || "" : cert.iecModelList || "",
      standard: isBIS ? cert.bisStandard || "" : cert.iecStandard || "",
      validityFrom: isBIS
        ? (cert.bisValidityFrom as any) || ""
        : (cert.iecValidityFrom as any) || "",
      validityUpto: isBIS
        ? (cert.bisValidityUpto as any) || ""
        : (cert.iecValidityUpto as any) || "",
      renewalStatus: isBIS
        ? cert.bisRenewalStatus || ""
        : cert.iecRenewalStatus || "",
      alarmAlert: isBIS ? cert.bisAlarmAlert || "" : cert.iecAlarmAlert || "",
      action: isBIS ? cert.bisAction || "" : cert.iecAction || "",
    };
  };

  const getModelSummary = (cert: Certification) => {
    const eff = getEffectiveFields(cert);
    const raw =
      cert.type === "BIS & IEC"
        ? cert.bisModelList || cert.iecModelList || ""
        : eff.modelList || "";

    const first = String(raw || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);

    return first || "-";
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    const reason = String(deleteReason || "").trim();
    if (!reason) {
      toast.error("Please provide a deletion reason.");
      return;
    }
    if (!deleteProofFile) {
      toast.error("Please attach proof for deletion.");
      return;
    }

    // Optional guard (helps avoid huge payloads)
    const maxBytes = 8 * 1024 * 1024; // 8MB
    if (deleteProofFile.size > maxBytes) {
      toast.error("Proof file is too large (max 8MB).");
      return;
    }

    setDeleteBusy(true);
    try {
      const base64 = await fileToBase64(deleteProofFile);

      await onDelete(deleteId, {
        reason,
        proof: {
          name: deleteProofFile.name,
          type: deleteProofFile.type || "application/octet-stream",
          base64,
        },
      });

      toast.success("Certification deleted (soft)");
    } catch (e: any) {
      toast.error(
        e?.message ? String(e.message) : "Failed to delete certification"
      );
    } finally {
      setDeleteBusy(false);
      setDeleteId(null);
      setDeleteReason("");
      setDeleteProofFile(null);
    }
  };

  const renderRNoCell = (cert: Certification) => {
    const eff = getEffectiveFields(cert);

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

    return eff.rNo ? eff.rNo : "-";
  };

  const renderStatusCell = (cert: Certification) => {
    const eff = getEffectiveFields(cert);

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

    return <StatusBadge status={(eff.status as any) || "Pending"} />;
  };

  const pickValidityFrom = (cert: Certification) =>
    getEffectiveFields(cert).validityFrom || "";
  const pickValidityUpto = (cert: Certification) =>
    getEffectiveFields(cert).validityUpto || "";

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

  const renderAllDetailsCell = (cert: Certification) => {
    const eff = getEffectiveFields(cert);
    const hasLegacy =
      Boolean((cert as any).rNo) ||
      Boolean((cert as any).modelList) ||
      Boolean((cert as any).validityUpto) ||
      Boolean((cert as any).status);

    if (hasLegacy && cert.type !== "BIS & IEC") {
      const line = [
        `${cert.type}:`,
        eff.rNo ? `No. ${eff.rNo}` : "No. -",
        eff.status ? `(${eff.status})` : "(Pending)",
        eff.validityFrom || eff.validityUpto
          ? `| ${formatDate(eff.validityFrom || "")} → ${formatDate(
              eff.validityUpto || ""
            )}`
          : "",
        eff.alarmAlert ? `| Alarm: ${eff.alarmAlert}` : "",
        eff.renewalStatus ? `| Renewal: ${eff.renewalStatus}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 max-w-[520px]">
          {line}
        </div>
      );
    }

    const lines: string[] = [];

    if (cert.bisRNo || cert.type === "BIS" || cert.type === "BIS & IEC") {
      const bisLine = [
        "BIS:",
        cert.bisRNo ? `RNo ${cert.bisRNo}` : "RNo -",
        cert.bisStatus ? `(${cert.bisStatus})` : "(Pending)",
        cert.bisValidityFrom || cert.bisValidityUpto
          ? `| ${formatDate(cert.bisValidityFrom || "")} → ${formatDate(
              cert.bisValidityUpto || ""
            )}`
          : "",
        cert.bisAlarmAlert ? `| Alarm: ${cert.bisAlarmAlert}` : "",
        cert.bisRenewalStatus ? `| Renewal: ${cert.bisRenewalStatus}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(bisLine);
    }

    if (cert.iecRNo || cert.type === "IEC" || cert.type === "BIS & IEC") {
      const iecLine = [
        "IEC:",
        cert.iecRNo ? `ID ${cert.iecRNo}` : "ID -",
        cert.iecStatus ? `(${cert.iecStatus})` : "(Pending)",
        cert.iecValidityFrom || cert.iecValidityUpto
          ? `| ${formatDate(cert.iecValidityFrom || "")} → ${formatDate(
              cert.iecValidityUpto || ""
            )}`
          : "",
        cert.iecAlarmAlert ? `| Alarm: ${cert.iecAlarmAlert}` : "",
        cert.iecRenewalStatus ? `| Renewal: ${cert.iecRenewalStatus}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(iecLine);
    }

    if (!lines.length) return <span className="text-muted-foreground">-</span>;

    return (
      <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 max-w-[520px]">
        {lines.join("\n")}
      </div>
    );
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
              <TableHead>All Details</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredCerts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center py-12 text-muted-foreground"
                >
                  {searchQuery
                    ? "No certifications match your search"
                    : "No certifications yet"}
                </TableCell>
              </TableRow>
            ) : (
              groupedCerts.map((group, gIndex) => {
                const isOpen = openGroups[group.key] ?? true;

                // ✅ fixed counts for legacy "BIS & IEC" rows
                const bisCount = group.items.filter(
                  (x) => x.type === "BIS" || x.type === "BIS & IEC"
                ).length;
                const iecCount = group.items.filter(
                  (x) => x.type === "IEC" || x.type === "BIS & IEC"
                ).length;

                return (
                  <Fragment key={group.key}>
                    <TableRow
                      className="bg-muted/40"
                      style={{ animationDelay: `${gIndex * 50}ms` }}
                    >
                      <TableCell colSpan={10} className="py-3">
                        <div className="flex items-start justify-between gap-4">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenGroups((prev) => ({
                                ...prev,
                                [group.key]: !(prev[group.key] ?? true),
                              }))
                            }
                            className="flex items-start gap-2 text-left"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 mt-1 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground" />
                            )}

                            <div>
                              <div className="font-medium">
                                {group.sno}. {group.plant}
                              </div>
                              <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2 max-w-[900px]">
                                {group.address}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                <span className="mr-4">
                                  BIS rows:{" "}
                                  <span className="font-medium">
                                    {bisCount}
                                  </span>
                                </span>
                                <span>
                                  IEC rows:{" "}
                                  <span className="font-medium">
                                    {iecCount}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {isOpen
                      ? group.items.map((cert, index) => (
                          <TableRow
                            key={cert.id}
                            className="animate-fade-in hover:bg-muted/30 transition-colors"
                            style={{
                              animationDelay: `${(gIndex * 10 + index) * 30}ms`,
                            }}
                          >
                            <TableCell className="text-muted-foreground">
                              {" "}
                            </TableCell>

                            <TableCell>
                              <div className="font-medium">
                                {getModelSummary(cert)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {cert.type === "BIS"
                                  ? "BIS entry"
                                  : cert.type === "IEC"
                                  ? "IEC entry"
                                  : "Combined entry"}
                              </div>
                            </TableCell>

                            <TableCell className="font-mono text-sm">
                              {renderRNoCell(cert)}
                            </TableCell>

                            <TableCell>
                              <TypeBadge type={cert.type} />
                            </TableCell>

                            <TableCell>{renderStatusCell(cert)}</TableCell>

                            <TableCell>
                              {renderValidityFromCell(cert)}
                            </TableCell>

                            <TableCell>
                              {renderValidityUptoCell(cert)}
                            </TableCell>

                            <TableCell>{renderExpiryCell(cert)}</TableCell>

                            <TableCell>{renderAllDetailsCell(cert)}</TableCell>

                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => onView(cert)}
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>

                                  <DropdownMenuItem
                                    onClick={() => onEdit(cert)}
                                  >
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
                      : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(null);
            setDeleteReason("");
            setDeleteProofFile(null);
            setDeleteBusy(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Certification (Soft Delete)
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the certification (it will be hidden from
              the main list and excluded from notifications). Please provide a
              reason and attach proof.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Reason (required)</div>
              <Input
                placeholder="Reason for deletion..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">
                Proof Attachment (required)
              </div>
              <Input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) =>
                  setDeleteProofFile(e.target.files?.[0] || null)
                }
              />
              {deleteProofFile ? (
                <div className="text-xs text-muted-foreground">
                  Selected:{" "}
                  <span className="font-medium">{deleteProofFile.name}</span>
                </div>
              ) : null}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={
                deleteBusy || !String(deleteReason).trim() || !deleteProofFile
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
