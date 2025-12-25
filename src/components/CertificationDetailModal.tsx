import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download } from "lucide-react";

import { Certification, downloadCertificationAttachment } from "@/lib/db";
import { formatDate } from "@/lib/expiryUtils";
import { ExpiryBadge } from "./ExpiryBadge";
import { StatusBadge } from "./StatusBadge";
import { TypeBadge } from "./TypeBadge";

interface CertificationDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certification: Certification | null;
}

export const CertificationDetailModal = ({
  open,
  onOpenChange,
  certification,
}: CertificationDetailModalProps) => {
  const [downloading, setDownloading] = useState(false);

  if (!certification) return null;

  const hasAttachment = Boolean(certification.hasAttachment);

  const handleDownload = async () => {
    if (!certification?.id) return;
    setDownloading(true);
    try {
      const res = await downloadCertificationAttachment(certification.id);
      const blobUrl = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = res.filename || certification.attachmentName || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-3">
            {certification.plant}
            <TypeBadge type={certification.type} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {certification.bisRNo ? (
                <div className="flex items-center gap-2">
                  <TypeBadge type="BIS" />
                  <StatusBadge
                    status={(certification.bisStatus as any) || "Pending"}
                  />
                  {certification.bisValidityUpto ? (
                    <ExpiryBadge validityUpto={certification.bisValidityUpto} />
                  ) : null}
                </div>
              ) : null}

              {certification.iecRNo ? (
                <div className="flex items-center gap-2">
                  <TypeBadge type="IEC" />
                  <StatusBadge
                    status={(certification.iecStatus as any) || "Pending"}
                  />
                  {certification.iecValidityUpto ? (
                    <ExpiryBadge validityUpto={certification.iecValidityUpto} />
                  ) : null}
                </div>
              ) : null}

              {!certification.bisRNo && !certification.iecRNo ? (
                <StatusBadge status="Pending" />
              ) : null}
            </div>

            <div className="text-xs text-muted-foreground">
              <span className="font-medium">S.No:</span> {certification.sno}
            </div>
          </div>

          <Separator />

          <div className="space-y-6">
            {certification.bisRNo ? (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TypeBadge type="BIS" />
                  <StatusBadge
                    status={(certification.bisStatus as any) || "Pending"}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      R-No
                    </h4>
                    <p className="font-mono">{certification.bisRNo || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Validity From
                    </h4>
                    <p>{formatDate(certification.bisValidityFrom) || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Validity Upto
                    </h4>
                    <p>{formatDate(certification.bisValidityUpto) || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Renewal Status
                    </h4>
                    <p>{certification.bisRenewalStatus || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Alarm Alert
                    </h4>
                    <p>{certification.bisAlarmAlert || "-"}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Model List
                  </h4>
                  <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap font-mono">
                    {certification.bisModelList || "-"}
                  </pre>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Standard
                  </h4>
                  <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">
                    {certification.bisStandard || "-"}
                  </pre>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Action / Notes
                  </h4>
                  <p className="text-sm bg-accent p-3 rounded-lg whitespace-pre-wrap">
                    {certification.bisAction || "-"}
                  </p>
                </div>
              </div>
            ) : null}

            {certification.iecRNo ? (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TypeBadge type="IEC" />
                  <StatusBadge
                    status={(certification.iecStatus as any) || "Pending"}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      ID
                    </h4>
                    <p className="font-mono">{certification.iecRNo || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Validity From
                    </h4>
                    <p>{formatDate(certification.iecValidityFrom) || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Validity Upto
                    </h4>
                    <p>{formatDate(certification.iecValidityUpto) || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Renewal Status
                    </h4>
                    <p>{certification.iecRenewalStatus || "-"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Alarm Alert
                    </h4>
                    <p>{certification.iecAlarmAlert || "-"}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Model List
                  </h4>
                  <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap font-mono">
                    {certification.iecModelList || "-"}
                  </pre>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Standard
                  </h4>
                  <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">
                    {certification.iecStandard || "-"}
                  </pre>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Action / Notes
                  </h4>
                  <p className="text-sm bg-accent p-3 rounded-lg whitespace-pre-wrap">
                    {certification.iecAction || "-"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Address
            </h4>
            <p className="text-sm whitespace-pre-wrap">
              {certification.address || "-"}
            </p>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Model List
            </h4>
            <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap font-mono">
              {certification.modelList || "-"}
            </pre>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Standard
            </h4>
            <pre className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">
              {certification.standard || "-"}
            </pre>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Action / Notes
            </h4>
            <p className="text-sm bg-accent p-3 rounded-lg whitespace-pre-wrap">
              {certification.action || "-"}
            </p>
          </div>

          <Separator />

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  Attachment (optional)
                </div>
                <div className="font-medium truncate">
                  {hasAttachment
                    ? certification.attachmentName || "Attachment"
                    : "No attachment"}
                </div>
                {hasAttachment && certification.attachmentType ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {certification.attachmentType}
                  </div>
                ) : null}
              </div>

              {hasAttachment ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloading ? "Downloading..." : "Download"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-muted-foreground">
            <div>
              <span>Created: </span>
              <span>
                {certification.createdAt
                  ? new Date(certification.createdAt).toLocaleString()
                  : "-"}
              </span>
            </div>
            <div>
              <span>Updated: </span>
              <span>
                {certification.updatedAt
                  ? new Date(certification.updatedAt).toLocaleString()
                  : "-"}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
